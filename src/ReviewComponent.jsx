import React, { useState, useRef, useEffect, useLayoutEffect, forwardRef, useImperativeHandle, useMemo } from 'react';
import { getComments } from './commentsClient.js';
import { supabase } from './supabaseClient.js';
import { useAuth } from './AuthContext.jsx';
import PaperInfoDialog from './components/PaperInfoDialog.jsx';

// Now using commentsClient for API calls
// Toggle between mock and backend by changing MODE in commentsClient.js:
//   MODE: 'mock'    - Uses local mock data (includes XXX/YYY/ZZZ test markers)
//   MODE: 'backend' - Calls real API at http://10.127.105.10:8888
//
// API returns data in the format:
// {
//   paragraphId: {
//     Actionability: { score: 1-5, text: "..." },
//     Helpfulness: { score: 1-5, text: "..." },
//     Grounding: { score: 1-5, text: "..." },
//     Verifiability: { score: 1-5, text: "..." }
//   }
// }

// Helper function to convert score to severity
const scoreToSeverity = (score) => {
  if (score <= 2) return 'red';
  if (score <= 3) return 'yellow';
  return 'none'; // scores 4-5 are hidden
};

// Paragraph matching configuration
const PARAGRAPH_MATCH_THRESHOLD = 0.7; // 70% cosine similarity required for fuzzy match

// Calculate cosine similarity between two text strings (bag-of-words)
const calculateSimilarity = (text1, text2) => {
  const words1 = new Set(text1.toLowerCase().split(/\s+/).filter(w => w.length > 0));
  const words2 = new Set(text2.toLowerCase().split(/\s+/).filter(w => w.length > 0));

  if (words1.size === 0 && words2.size === 0) return 1; // Both empty = identical
  if (words1.size === 0 || words2.size === 0) return 0; // One empty = no match

  const intersection = [...words1].filter(w => words2.has(w)).length;
  return intersection / Math.sqrt(words1.size * words2.size); // Cosine similarity
};

const ReviewComponent = forwardRef(({ currentReview, onDiscardReview, ...props }, ref) => {
  const { signOut } = useAuth();
  const [reviewText, setReviewText] = useState('');
  const [openCommentBar, setOpenCommentBar] = useState(null); // Start with no comment bar open
  const [paragraphPositions, setParagraphPositions] = useState({});
  const [scrollTop, setScrollTop] = useState(0);
  const [resizeCounter, setResizeCounter] = useState(0);
  const [reviewTextWidth, setReviewTextWidth] = useState(null);
  const [lastUpdateParagraphs, setLastUpdateParagraphs] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0); // Progress percentage (0-100)
  const [loadingWord, setLoadingWord] = useState('Loading');
  const [isUpdating, setIsUpdating] = useState(false); // Track UPDATE in progress

  // Stable paragraph tracking: {id, originalContent, currentContent}
  const [paragraphsWithIds, setParagraphsWithIds] = useState([]);
  const paragraphsWithIdsRef = useRef([]); // Ref to avoid closure issues in timer
  const reviewTextRef = useRef(''); // Ref to avoid closure issues in unmount
  const nextParagraphIdRef = useRef(0);
  const [commentsByParagraphId, setCommentsByParagraphId] = useState({});

  // Track individual comment element heights for segmented bars
  const [commentHeights, setCommentHeights] = useState({}); // {paragraphId: [{label, height, color}, ...]}

  // Track dismissed comments by paragraph ID and label
  const [dismissedComments, setDismissedComments] = useState({}); // {paragraphId: Set(['Actionability', ...])}

  // Derived state: true if any paragraph is modified or new
  const isModified = useMemo(() => {
    return paragraphsWithIds.some(p =>
      p.originalContent !== p.currentContent || p.originalContent === ''
    );
  }, [paragraphsWithIds]);

  // Persistence state
  const [reviewId, setReviewId] = useState(null);
  const [paperId, setPaperId] = useState(null);
  const [paperTitle, setPaperTitle] = useState('');
  const [paperConference, setPaperConference] = useState('');
  const [showPaperDialog, setShowPaperDialog] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [savingStatus, setSavingStatus] = useState('saved'); // 'saved' | 'saving' | 'error'
  const [isLocked, setIsLocked] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  const textareaRef = useRef(null);
  const hiddenTextRef = useRef(null);
  const viewportRef = useRef(null);
  const reviewTextFrameRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const widthFractionRef = useRef(null);
  const lastScrolledCommentRef = useRef(null);
  const justClosedCommentRef = useRef(null);
  const currentRequestIdRef = useRef(0);
  const commentTextRef = useRef(null);
  const isInitializingRef = useRef(false); // Guard against StrictMode double-execution
  const isSavingRef = useRef(false); // Mutex to prevent concurrent saves
  const isUpdatingRef = useRef(false); // Ref for checking in timer callbacks

  // Keep ref in sync with state to avoid closure issues
  useEffect(() => {
    paragraphsWithIdsRef.current = paragraphsWithIds;
  }, [paragraphsWithIds]);

  useEffect(() => {
    reviewTextRef.current = reviewText;
  }, [reviewText]);

  useEffect(() => {
    isUpdatingRef.current = isUpdating;
  }, [isUpdating]);

  // Warn user before leaving page during UPDATE
  useEffect(() => {
    if (!isUpdating) return;

    const handleBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = ''; // Required for Chrome
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isUpdating]);

  // Initialize paragraph IDs on first render
  useEffect(() => {
    const initialParagraphTexts = getParagraphs(reviewText);

    // Create initial paragraphs with stable IDs and empty originalContent
    // This makes all paragraphs appear as "new" with dotted rectangles
    const withIds = initialParagraphTexts.map((content, index) => ({
      id: index,
      originalContent: '', // Empty to show dotted rectangles
      currentContent: content
    }));

    setParagraphsWithIds(withIds);
    nextParagraphIdRef.current = initialParagraphTexts.length;

    // Start with no comments
    setCommentsByParagraphId({});

    if (lastUpdateParagraphs.length === 0) {
      setLastUpdateParagraphs(initialParagraphTexts);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Match saved paragraphs to new paragraph texts
  const matchParagraphs = (savedParagraphs, newParagraphTexts) => {
    const matched = []; // {newIndex, savedParagraph, newText}
    const unmatchedSaved = [...savedParagraphs];
    const unmatchedNewIndices = newParagraphTexts.map((_, i) => i);

    // Phase 0: Exact match against originalContent (scored versions)
    // This ensures pasting back the original scored text restores IDs
    for (let i = unmatchedNewIndices.length - 1; i >= 0; i--) {
      const newIndex = unmatchedNewIndices[i];
      const newText = newParagraphTexts[newIndex];
      const savedIndex = unmatchedSaved.findIndex(s => s.originalContent && s.originalContent === newText);

      if (savedIndex !== -1) {
        matched.push({
          newIndex: newIndex,
          savedParagraph: unmatchedSaved[savedIndex],
          newText: newText
        });
        unmatchedSaved.splice(savedIndex, 1);
        unmatchedNewIndices.splice(i, 1);
      }
    }

    // Phase 1: Exact match against currentContent
    for (let i = unmatchedNewIndices.length - 1; i >= 0; i--) {
      const newIndex = unmatchedNewIndices[i];
      const newText = newParagraphTexts[newIndex];
      const savedIndex = unmatchedSaved.findIndex(s => s.currentContent === newText);

      if (savedIndex !== -1) {
        matched.push({
          newIndex: newIndex,
          savedParagraph: unmatchedSaved[savedIndex],
          newText: newText
        });
        unmatchedSaved.splice(savedIndex, 1);
        unmatchedNewIndices.splice(i, 1);
      }
    }

    // Phase 2: Fuzzy matches using cosine similarity
    for (let i = unmatchedNewIndices.length - 1; i >= 0; i--) {
      const newIndex = unmatchedNewIndices[i];
      const newText = newParagraphTexts[newIndex];

      let bestMatch = null;
      let bestScore = 0;

      for (const saved of unmatchedSaved) {
        const score = calculateSimilarity(newText, saved.currentContent);

        if (score > PARAGRAPH_MATCH_THRESHOLD && score > bestScore) {
          bestScore = score;
          bestMatch = saved;
        }
      }

      if (bestMatch) {
        matched.push({
          newIndex: newIndex,
          savedParagraph: bestMatch,
          newText: newText
        });
        unmatchedSaved.splice(unmatchedSaved.indexOf(bestMatch), 1);
        unmatchedNewIndices.splice(i, 1);
      }
    }

    return { matched, unmatchedNewIndices };
  };

  // Update paragraph IDs when text changes
  useEffect(() => {
    const newParagraphTexts = getParagraphs(reviewText);

    // If starting from empty, create all new paragraphs
    if (paragraphsWithIds.length === 0 && newParagraphTexts.length > 0) {
      const newParagraphs = newParagraphTexts.map((content, index) => ({
        id: nextParagraphIdRef.current++,
        originalContent: '', // Empty to indicate new paragraph
        currentContent: content
      }));
      setParagraphsWithIds(newParagraphs);
      return;
    }

    // If no paragraphs exist anymore, keep scored paragraph data but clear current content
    // This allows matching when text is pasted back
    if (newParagraphTexts.length === 0) {
      if (paragraphsWithIds.some(p => p.originalContent)) {
        // Keep paragraphs that have scored versions (originalContent)
        // Set currentContent to empty
        const preserved = paragraphsWithIds
          .filter(p => p.originalContent)
          .map(p => ({ ...p, currentContent: '' }));
        setParagraphsWithIds(preserved);
      } else {
        // No scored versions exist - safe to clear completely
        setParagraphsWithIds([]);
      }
      return;
    }

    const { matched, unmatchedNewIndices } = matchParagraphs(paragraphsWithIds, newParagraphTexts);

    // Build updated paragraph list
    const updated = new Array(newParagraphTexts.length);

    // Place matched paragraphs (keep ID and originalContent, update currentContent)
    matched.forEach(m => {
      updated[m.newIndex] = {
        id: m.savedParagraph.id,
        originalContent: m.savedParagraph.originalContent,
        currentContent: m.newText
      };
    });

    // Create new paragraphs for unmatched (with empty originalContent)
    unmatchedNewIndices.forEach(newIndex => {
      const newText = newParagraphTexts[newIndex];
      updated[newIndex] = {
        id: nextParagraphIdRef.current++,
        originalContent: '', // Empty to indicate new paragraph
        currentContent: newText
      };
    });

    // Close comment bar if its paragraph was deleted
    if (openCommentBar !== null) {
      const paragraphStillExists = updated.some(p => p.id === openCommentBar);
      if (!paragraphStillExists) {
        setOpenCommentBar(null);
      }
    }

    setParagraphsWithIds(updated);
    // isModified is now derived from paragraphsWithIds via useMemo
  }, [reviewText]); // eslint-disable-line react-hooks/exhaustive-deps

  // Parse text into blocks, tracking paragraph positions while preserving all content
  const parseTextBlocks = (text) => {
    const lines = text.split('\n');
    const blocks = [];
    let currentParagraph = [];
    let currentParagraphLines = [];
    let paragraphIndex = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const isBlank = line.trim() === '';

      if (isBlank) {
        // If we have a current paragraph, save it
        if (currentParagraph.length > 0) {
          blocks.push({
            type: 'paragraph',
            content: currentParagraph.join('\n'),
            lines: currentParagraphLines,
            id: paragraphIndex++
          });
          currentParagraph = [];
          currentParagraphLines = [];
        }
        // Add blank line
        blocks.push({
          type: 'blank',
          line: i
        });
      } else {
        // Add to current paragraph
        currentParagraph.push(line);
        currentParagraphLines.push(i);
      }
    }

    // Don't forget the last paragraph if text doesn't end with blank line
    if (currentParagraph.length > 0) {
      blocks.push({
        type: 'paragraph',
        content: currentParagraph.join('\n'),
        lines: currentParagraphLines,
        id: paragraphIndex++
      });
    }

    return blocks;
  };

  // Get just the paragraphs for comment mapping
  const getParagraphs = (text) => {
    return parseTextBlocks(text)
      .filter(block => block.type === 'paragraph')
      .map(block => block.content);
  };

  // Calculate and store width fraction when a comment bar is opened
  useLayoutEffect(() => {
    if (openCommentBar !== null && viewportRef.current) {
      if (widthFractionRef.current === null) {
        // First time opening - use default 60% width for review text
        widthFractionRef.current = 0.6;
      }
      // Always calculate width from fraction (don't measure the frame)
      const viewportRect = viewportRef.current.getBoundingClientRect();
      const newWidth = viewportRect.width * widthFractionRef.current;
      setReviewTextWidth(newWidth);
    }
    // Trigger recalculation when comment bar opens/closes to update paragraph boundaries
    setResizeCounter(prev => prev + 1);
  }, [openCommentBar]);

  // Listen for window resize events and maintain width fraction
  useEffect(() => {
    const handleResize = () => {
      // Always update width on resize if fraction is set (even when no comment is open)
      if (viewportRef.current && widthFractionRef.current !== null) {
        const viewportRect = viewportRef.current.getBoundingClientRect();
        const newWidth = viewportRect.width * widthFractionRef.current;
        setReviewTextWidth(newWidth);
      }
      setResizeCounter(prev => prev + 1);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Update paragraph positions when text changes (including blank line insertions) or on scroll
  // Using useLayoutEffect to ensure DOM is measured after updates but before paint
  // Also recalculate when comments arrive (commentsByParagraphId changes) to ensure bars render
  // IMPORTANT: Must depend on paragraphsWithIds to recalculate after paragraph IDs change (e.g., deletion)
  useLayoutEffect(() => {
    if (hiddenTextRef.current) {
      const elements = hiddenTextRef.current.querySelectorAll('[data-paragraph-id]');
      const positions = {};

      elements.forEach((element) => {
        const id = parseInt(element.getAttribute('data-paragraph-id'));
        const rect = element.getBoundingClientRect();
        const containerRect = hiddenTextRef.current.getBoundingClientRect();

        positions[id] = {
          top: rect.top - containerRect.top,
          bottom: rect.bottom - containerRect.top,
          height: rect.height
        };
      });

      setParagraphPositions(positions);
    }
  }, [reviewText, scrollTop, resizeCounter, reviewTextWidth, commentsByParagraphId, paragraphsWithIds]);

  // Auto-resize textarea (when text changes or width changes)
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [reviewText, resizeCounter]);

  // Track which comment was just closed
  const previousOpenCommentRef = useRef(openCommentBar);
  useEffect(() => {
    if (previousOpenCommentRef.current !== null && openCommentBar === null) {
      // A comment bar was just closed
      justClosedCommentRef.current = previousOpenCommentRef.current;
    }
    previousOpenCommentRef.current = openCommentBar;
  }, [openCommentBar]);

  // Scroll when opening a comment to make comment text visible
  useEffect(() => {
    if (openCommentBar === null) {
      // When closing a comment bar, just reset the scroll ref
      // Don't scroll - let the view stay where it is
      justClosedCommentRef.current = null;
      lastScrolledCommentRef.current = null;
    } else if (openCommentBar !== lastScrolledCommentRef.current &&
               paragraphPositions[openCommentBar] &&
               scrollContainerRef.current) {
      // Opening a comment bar - scroll to show comment text or bar at top
      const scrollTimer = setTimeout(() => {
        // Re-check that this comment is still open (user might have clicked again)
        if (openCommentBar === null) return;

        const position = paragraphPositions[openCommentBar];
        if (!position) return; // Position not available yet

        const scrollContainer = scrollContainerRef.current;
        if (!scrollContainer) return;

        const containerHeight = scrollContainer.clientHeight;
        const currentScrollTop = scrollContainer.scrollTop;

        // Get comment text height if available
        const commentTextHeight = commentTextRef.current ? commentTextRef.current.offsetHeight : 0;

        // Calculate positions
        const barTop = position.top + 10;
        const commentTextTop = barTop;
        const commentTextBottom = commentTextTop + commentTextHeight;
        const viewportBottom = currentScrollTop + containerHeight;

        // Check if comment text is fully visible
        if (commentTextBottom > viewportBottom) {
          // Comment text extends below viewport - need to scroll up

          // Option A: Scroll so comment text bottom aligns with viewport bottom
          const scrollToShowText = commentTextBottom - containerHeight;

          // Option B: Scroll comment bar to top of viewport
          const scrollBarToTop = barTop;

          // Use the minimum (scroll less) - this prioritizes showing text but won't scroll bar above top
          const targetScrollTop = Math.max(0, Math.min(scrollToShowText, scrollBarToTop));

          scrollContainer.scrollTo({
            top: targetScrollTop,
            behavior: 'smooth'
          });
        }

        // Mark this comment as scrolled
        lastScrolledCommentRef.current = openCommentBar;
      }, 200); // Wait 200ms for layout to settle (especially after close/reopen)

      return () => clearTimeout(scrollTimer);
    }
  }, [openCommentBar, paragraphPositions]);

  const handleTextChange = (e) => {
    setReviewText(e.target.value);
    // isModified is derived from paragraphsWithIds - updates automatically
  };

  const handleScroll = (e) => {
    setScrollTop(e.target.scrollTop);
  };

  const handleResizeMouseDown = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleResizeMouseMove = (e) => {
    if (!isDragging || !scrollContainerRef.current) return;

    const scrollContainer = scrollContainerRef.current;
    const scrollContainerRect = scrollContainer.getBoundingClientRect();

    // Calculate new width based on mouse position relative to scroll container
    const mouseX = e.clientX - scrollContainerRect.left;

    // Min width: 300px for readability
    // Max width: leave at least 150px for comment frame (+ 35px gap)
    const minWidth = 300;
    const maxWidth = scrollContainerRect.width - 185; // 150px + 35px gap
    const newWidth = Math.max(minWidth, Math.min(mouseX, maxWidth));

    setReviewTextWidth(newWidth);
    // Trigger recalculation during drag to update alignments
    setResizeCounter(prev => prev + 1);
  };

  const handleResizeMouseUp = () => {
    if (isDragging && viewportRef.current && reviewTextFrameRef.current) {
      setIsDragging(false);

      // Update the stored width fraction
      const viewportRect = viewportRef.current.getBoundingClientRect();
      const newFraction = reviewTextWidth / viewportRect.width;
      widthFractionRef.current = newFraction;
    }
  };

  // Add mouse event listeners for resize
  useEffect(() => {
    if (isDragging) {
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      window.addEventListener('mousemove', handleResizeMouseMove);
      window.addEventListener('mouseup', handleResizeMouseUp);
      return () => {
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        window.removeEventListener('mousemove', handleResizeMouseMove);
        window.removeEventListener('mouseup', handleResizeMouseUp);
      };
    }
  }, [isDragging, reviewTextWidth]); // eslint-disable-line react-hooks/exhaustive-deps

  // Initialize from currentReview prop
  useEffect(() => {
    if (!currentReview) {
      // Reset ALL state when currentReview is cleared (e.g., Discard button)
      console.log('Clearing review state - no currentReview');
      setReviewText('');
      setParagraphsWithIds([]);
      setCommentsByParagraphId({});
      setDismissedComments({});
      // isModified becomes false automatically (derived from empty paragraphsWithIds)
      setOpenCommentBar(null);
      setReviewId(null);
      setPaperId(null);
      setPaperTitle('');
      setPaperConference('');
      setIsInitialized(true); // No data to load, component is immediately usable
      isInitializingRef.current = false; // Reset guard when clearing
      return;
    }

    console.log('Initializing from currentReview prop:', currentReview);

    // Guard against StrictMode double-execution for async operations
    if (isInitializingRef.current) {
      console.log('Already initializing, skipping duplicate');
      return;
    }
    isInitializingRef.current = true;

    // Reset state when switching to a different review
    setReviewText('');
    setParagraphsWithIds([]);
    setCommentsByParagraphId({});
    setDismissedComments({});
    // isModified becomes false automatically (derived from empty paragraphsWithIds)
    setOpenCommentBar(null);

    if (currentReview.isNewReview) {
      // Creating new review
      setIsInitialized(false); // Show loading state while creating review
      handlePaperInfoSubmit({
        title: currentReview.paperTitle,
        conference: currentReview.paperConference,
        initialText: currentReview.initialText
      }).finally(() => {
        isInitializingRef.current = false;
      });
    } else {
      // Loading existing review
      setIsInitialized(false); // Show loading state while fetching data
      setReviewId(currentReview.reviewId);
      setPaperId(currentReview.paperId);
      setPaperTitle(currentReview.paperTitle);
      setPaperConference(currentReview.paperConference);
      loadReviewData(currentReview.reviewId).finally(() => {
        isInitializingRef.current = false;
        setIsInitialized(true); // Enable editing after data loads
      });
    }
  }, [currentReview]); // eslint-disable-line react-hooks/exhaustive-deps

  // Autosave: start timer on keypress if not already running
  const autosaveTimerRef = useRef(null);

  useEffect(() => {
    console.log('Autosave effect triggered:', { reviewId, isModified, isLocked, isUpdating, hasTimer: !!autosaveTimerRef.current });

    if (!reviewId || !isModified || isLocked || isUpdating) {
      console.log('Autosave: conditions not met, skipping');
      return;
    }

    // Only start timer if one isn't already running
    if (!autosaveTimerRef.current) {
      console.log('Autosave: starting 30-second timer');
      autosaveTimerRef.current = setTimeout(() => {
        // Double-check conditions at execution time (UPDATE may have started)
        if (isUpdatingRef.current) {
          console.log('Autosave: skipping, UPDATE in progress');
          autosaveTimerRef.current = null;
          return;
        }
        console.log('Autosave: timer expired, saving now');
        saveReviewDraft();
        autosaveTimerRef.current = null;
      }, 30000); // 30 seconds
    } else {
      console.log('Autosave: timer already running, not starting new one');
    }

    return () => {
      // Don't clear the timer on every render, only on unmount
    };
  }, [reviewText, reviewId, isModified, isLocked, isUpdating]); // eslint-disable-line react-hooks/exhaustive-deps

  // Initialize or load review
  const initializeReview = async () => {
    try {
      // Check if user is logged in
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.log('No active session - review will not be persisted');
        setIsInitialized(true);
        return;
      }

      // Check if user has existing reviews
      const { data: existingReviews, error: reviewsError } = await supabase
        .from('reviews')
        .select(`
          id,
          paper_id,
          papers (
            title,
            conference_or_journal
          )
        `)
        .eq('reviewer_user_id', session.user.id)
        .eq('is_locked', false)
        .order('updated_at', { ascending: false })
        .limit(1);

      if (reviewsError) {
        console.error('Error checking for existing reviews:', reviewsError);
      }

      // If user has an existing review, load it directly
      if (existingReviews && existingReviews.length > 0) {
        const review = existingReviews[0];
        console.log('Loading existing review:', review.id);

        setReviewId(review.id);
        setPaperId(review.paper_id);
        setPaperTitle(review.papers?.title || '');
        setPaperConference(review.papers?.conference_or_journal || '');

        await loadReviewData(review.id);
        setIsInitialized(true);
        return;
      }

      // No existing reviews - show paper info dialog
      setShowPaperDialog(true);
      setIsInitialized(true);
    } catch (error) {
      console.error('Error initializing review:', error);
      setIsInitialized(true);
    }
  };

  // Handle paper info submission
  const handlePaperInfoSubmit = async ({ title, conference, initialText }) => {
    setShowPaperDialog(false);

    try {
      setPaperTitle(title || '');
      setPaperConference(conference || '');

      // Get or create paper
      const { data: newPaperId, error: paperError } = await supabase.rpc('get_or_create_paper', {
        p_title: title,
        p_conference: conference
      });

      if (paperError) throw paperError;

      setPaperId(newPaperId);

      // Get or create review for this paper
      const { data: newReviewId, error: reviewError } = await supabase.rpc('get_or_create_review', {
        p_paper_id: newPaperId
      });

      if (reviewError) throw reviewError;

      setReviewId(newReviewId);

      // Load existing review data if it exists
      await loadReviewData(newReviewId);

      // If initial text was provided (e.g., from dev sample data), populate it
      if (initialText) {
        setReviewText(initialText);
        // isModified becomes true automatically (paragraphs have empty originalContent)
      }

      setIsInitialized(true);
    } catch (error) {
      console.error('Error creating/loading review:', error);

      // If user doesn't exist in database (after reset), sign them out
      if (error?.code === '23503' && error?.message?.includes('violates foreign key constraint')) {
        console.warn('User not found in database - likely after database reset. Signing out.');
        await signOut();
        return;
      }

      setIsInitialized(true);
    }
  };

  // Load review data from database
  const loadReviewData = async (loadReviewId) => {
    try {
      // Use RPC function to fetch draft and latest scored version
      const { data: review, error: reviewError } = await supabase
        .rpc('load_review_with_draft', { p_review_id: loadReviewId });

      if (reviewError) throw reviewError;

      if (!review) {
        // No existing review content, start fresh
        return;
      }

      // Check if review is locked
      setIsLocked(review.is_locked);

      // Set current review text from draft_content (or empty if none)
      const draftContent = review.draft_content || '';

      // Build lookup maps for scored paragraphs (by paragraph_id)
      const scoredParagraphsMap = {};
      const commentsData = {};
      const dismissedCommentsData = {};

      if (review.paragraphs && review.paragraphs.length > 0) {
        review.paragraphs.forEach((item) => {
          const paragraphId = item.paragraph_id;

          // Store scored paragraph content for later matching
          scoredParagraphsMap[paragraphId] = {
            originalContent: item.content || '',
            paragraphId: paragraphId
          };

          // Reconstruct comments if they exist
          const hasComments = item.scores && Object.keys(item.scores).length > 0;
          if (hasComments) {
            commentsData[paragraphId] = [];
            Object.entries(item.scores).forEach(([dimension, scoreData]) => {
              const severity = scoreToSeverity(scoreData.score);
              commentsData[paragraphId].push({
                severity: severity,
                label: dimension,
                text: scoreData.comment || '',
                score: scoreData.score
              });
            });
          }

          // Reconstruct dismissed comments if they exist
          if (item.interactions) {
            Object.entries(item.interactions).forEach(([dimension, interaction]) => {
              if (interaction.comment_dismissed) {
                if (!dismissedCommentsData[paragraphId]) {
                  dismissedCommentsData[paragraphId] = [];
                }
                dismissedCommentsData[paragraphId].push(dimension);
              }
            });
          }
        });

        // Update next paragraph ID to be higher than any existing
        const maxParagraphId = Math.max(...review.paragraphs.map(p => p.paragraph_id));
        nextParagraphIdRef.current = maxParagraphId + 1;
      } else {
        // No scored paragraphs - reset counter to 0 for consistent IDs
        nextParagraphIdRef.current = 0;
      }

      // Parse current draft text into paragraphs
      const currentParagraphTexts = draftContent.split('\n\n').filter(p => p.trim().length > 0);

      // Create paragraphsWithIds by matching current text to scored paragraphs
      // Use smart matching: exact first, then fuzzy with high threshold
      const usedScoredParagraphs = new Set();

      // Helper to normalize text for comparison (trim whitespace)
      const normalize = (s) => s?.trim() || '';

      const paragraphsWithIds = currentParagraphTexts.map((text, index) => {
        // Phase 1: Try exact content match first
        const exactMatch = review.paragraphs?.find(p =>
          !usedScoredParagraphs.has(p.paragraph_id) && p.content === text
        );

        if (exactMatch) {
          usedScoredParagraphs.add(exactMatch.paragraph_id);
          return {
            id: exactMatch.paragraph_id,
            originalContent: exactMatch.content || '',
            currentContent: text
          };
        }

        // Phase 1b: Try normalized exact match (handles whitespace differences)
        const normalizedMatch = review.paragraphs?.find(p =>
          !usedScoredParagraphs.has(p.paragraph_id) && normalize(p.content) === normalize(text)
        );

        if (normalizedMatch) {
          usedScoredParagraphs.add(normalizedMatch.paragraph_id);
          return {
            id: normalizedMatch.paragraph_id,
            originalContent: normalizedMatch.content || '',
            currentContent: text
          };
        }

        // Phase 2: Try fuzzy match using cosine similarity
        let bestMatch = null;
        let bestScore = 0;

        review.paragraphs?.forEach(p => {
          if (usedScoredParagraphs.has(p.paragraph_id)) return;

          const score = calculateSimilarity(text, p.content);

          if (score > bestScore && score > PARAGRAPH_MATCH_THRESHOLD) {
            bestScore = score;
            bestMatch = p;
          }
        });

        if (bestMatch) {
          usedScoredParagraphs.add(bestMatch.paragraph_id);
          return {
            id: bestMatch.paragraph_id,
            originalContent: bestMatch.content || '',
            currentContent: text
          };
        }

        // No match - treat as new paragraph
        const newId = nextParagraphIdRef.current++;
        return {
          id: newId,
          originalContent: '', // Empty = new paragraph
          currentContent: text
        };
      });

      // Set all state at once
      setReviewText(draftContent);
      setParagraphsWithIds(paragraphsWithIds);
      setCommentsByParagraphId(commentsData);
      setDismissedComments(dismissedCommentsData);
      // isModified is derived from paragraphsWithIds via useMemo - no need to set it

    } catch (error) {
      console.error('Error loading review data:', error);
    }
  };

  // Save review draft to database (autosave - simple!)
  const saveReviewDraft = async () => {
    if (!reviewId || isLocked) {
      console.log('Skipping save: no reviewId or review is locked');
      return;
    }

    // Mutex: prevent concurrent saves
    if (isSavingRef.current) {
      console.log('Skipping save: another save is in progress');
      return;
    }
    isSavingRef.current = true;

    const startTime = Date.now();

    try {
      setSavingStatus('saving');

      console.log('Saving draft:', { reviewId, contentLength: reviewText.length });

      // Simple: just save the full review text as draft
      const { error } = await supabase.rpc('save_draft', {
        p_review_id: reviewId,
        p_content: reviewText
      });

      console.log('RPC save_draft result:', { error });

      if (error) throw error;

      setLastSavedAt(new Date());

      // Ensure indicator is visible for at least 2 seconds
      const elapsed = Date.now() - startTime;
      const remainingTime = Math.max(0, 2000 - elapsed);

      setTimeout(() => {
        setSavingStatus('saved');
        console.log('Draft saved successfully');
      }, remainingTime);
    } catch (error) {
      console.error('Error saving draft:', error);
      setSavingStatus('error');
    } finally {
      isSavingRef.current = false;
    }
  };

  // Expose saveReviewDraft to parent via ref
  useImperativeHandle(ref, () => ({
    saveReviewDraft: saveReviewDraft
  }), [saveReviewDraft]);

  // Save on unmount (when navigating away)
  useEffect(() => {
    return () => {
      // Cleanup: save any unsaved changes when component unmounts
      // Skip if still initializing (e.g., StrictMode remount)
      if (reviewId && !isLocked && reviewTextRef.current && !isInitializingRef.current) {
        console.log('Component unmounting, saving draft...');
        // Note: This runs synchronously before unmount, so we can't use async/await
        // But we can fire-and-forget the save
        supabase.rpc('save_draft', {
          p_review_id: reviewId,
          p_content: reviewTextRef.current
        });
      }
    };
  }, [reviewId, isLocked]);

  // Save scores after UPDATE
  const saveScores = async (commentData) => {
    if (!reviewId || isLocked) {
      console.log('Skipping score save: no reviewId or review is locked');
      return;
    }

    try {
      // Debug: Log incoming comment data
      console.log('saveScores received commentData for paragraphs:', Object.keys(commentData));

      // Transform comment data to scores format
      const scores = [];

      Object.keys(commentData).forEach(paragraphIdStr => {
        const paragraphId = parseInt(paragraphIdStr);
        const data = commentData[paragraphIdStr];

        ['Actionability', 'Helpfulness', 'Grounding', 'Verifiability'].forEach(dimension => {
          if (data[dimension]) {
            scores.push({
              paragraph_id: paragraphId,
              dimension: dimension,
              score: data[dimension].score,
              comment: data[dimension].text
            });
          }
        });
      });

      if (scores.length === 0) {
        console.log('saveScores: No scores to save');
        return; // No scores to save
      }

      // Debug: Log scores being saved
      const paragraphsWithScores = [...new Set(scores.map(s => s.paragraph_id))];
      console.log(`saveScores: Saving ${scores.length} scores for ${paragraphsWithScores.length} paragraphs:`, paragraphsWithScores);

      // Call save_review_scores RPC function
      const { error } = await supabase.rpc('save_review_scores', {
        p_review_id: reviewId,
        p_scores: scores
      });

      if (error) throw error;

      console.log('Scores saved successfully');
    } catch (error) {
      console.error('Error saving scores:', error);
    }
  };

  const handleUpdate = async () => {
    if (!isModified) return;

    // Disable editing during UPDATE to prevent race conditions
    setIsUpdating(true);

    // Cancel any pending autosave timer
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
      console.log('Autosave: timer cancelled due to UPDATE');
    }

    // Save draft before getting comments
    await saveReviewDraft();

    // Create unique ID for this request
    const requestId = ++currentRequestIdRef.current;

    // Collect modified paragraphs
    const modifiedParagraphs = paragraphsWithIds
      .filter(p => p.currentContent !== p.originalContent)
      .map(p => ({
        id: p.id,
        content: p.currentContent
      }));

    console.log(`[BACKEND] Updating comments for modified paragraphs (request #${requestId}):`, modifiedParagraphs);

    // Set loading state and reset progress
    // Randomly select a thinking word for this loading session
    const thinkingWords = [
      'Analyzing',
      'Processing',
      'Computing',
      'Evaluating',
      'Considering',
      'Calculating',
      'Reviewing',
      'Examining',
      'Synthesizing',
      'Pondering',
      'Combobulating',
      'Extemporizing',
      'Pontificating',
      'Thought-Leadering',
      'Embroidering',
      'Sauteeing'
    ];
    const randomWord = thinkingWords[Math.floor(Math.random() * thinkingWords.length)];

    setIsLoading(true);
    setLoadingProgress(0);
    setLoadingWord(randomWord);

    try {
      // Call getComments function with progress callback
      const commentResults = await getComments(modifiedParagraphs, (completed, total, percentage) => {
        // Only update progress if this request is still current
        if (requestId === currentRequestIdRef.current) {
          setLoadingProgress(percentage);
          console.log(`[BACKEND] Progress: ${completed}/${total} batches (${percentage}%)`);
        } else {
          console.log(`[BACKEND] Ignoring progress from stale request #${requestId} (current is #${currentRequestIdRef.current})`);
        }
      });

      // Debug: Log API response
      console.log('[BACKEND] API returned comments for paragraphs:', Object.keys(commentResults));

      // Check if this request is still current (not cancelled or superseded)
      if (requestId !== currentRequestIdRef.current) {
        console.log('Ignoring results from stale request #' + requestId + ' (current is #' + currentRequestIdRef.current + ')');
        return;
      }

      // Transform API response to internal comment format with severity
      const newComments = {};

      Object.keys(commentResults).forEach(paragraphIdStr => {
        const paragraphId = parseInt(paragraphIdStr);
        const commentData = commentResults[paragraphIdStr];

        // Transform each label's data into the internal format
        const formattedComments = [];
        const labels = ['Actionability', 'Helpfulness', 'Grounding', 'Verifiability'];

        labels.forEach(label => {
          if (commentData[label]) {
            const { score, text } = commentData[label];
            const severity = scoreToSeverity(score);

            // Store all items including severity 'none' for score tracking
            // Items with severity 'none' will be filtered out at display time
            formattedComments.push({
              severity: severity,
              label: label,
              text: text,
              score: score
            });
          }
        });

        // Always store all comments (including 'none' severity items for score tracking)
        // Display logic will filter out 'none' items at render time
        if (formattedComments.length > 0) {
          newComments[paragraphId] = formattedComments;
        }
      });

      // Merge new comments with existing comments
      // Start with existing comments, then remove old comments for modified paragraphs,
      // and finally add new comments for those modified paragraphs
      const updatedComments = { ...commentsByParagraphId };

      // Remove old comments for all modified paragraphs
      modifiedParagraphs.forEach(p => {
        delete updatedComments[p.id];
      });

      // Add new comments (only for paragraphs that have non-'none' items)
      Object.assign(updatedComments, newComments);

      setCommentsByParagraphId(updatedComments);

      // Create version from draft FIRST (create scored snapshot)
      // Pass all current paragraphs to create full version snapshot
      const paragraphsForVersion = paragraphsWithIds.map(p => ({
        paragraph_id: p.id,
        content: p.currentContent
      }));

      const { data: newVersion, error: versionError } = await supabase.rpc('create_version_from_draft', {
        p_review_id: reviewId,
        p_paragraphs: paragraphsForVersion
      });

      if (versionError) throw versionError;

      console.log('Created new version:', newVersion);

      // THEN save scores to the new version
      await saveScores(commentResults);

      // If comment bar is open for a modified paragraph, track views for the new version
      // Note: We need to check visibility AFTER updating commentsByParagraphId state
      // but the state update is async. Instead, compute visible comments from newComments
      // while respecting dismissedComments.
      if (openCommentBar !== null) {
        const modifiedParagraphIds = modifiedParagraphs.map(p => p.id);
        if (modifiedParagraphIds.includes(openCommentBar)) {
          // Get dimensions from new comments, but exclude dismissed ones
          const newParagraphComments = newComments[openCommentBar] || [];
          const dismissed = dismissedComments[openCommentBar] || new Set();
          const visibleDimensions = newParagraphComments
            .filter(c => c.severity !== 'none' && !dismissed.has(c.label))
            .map(c => c.label);
          const uniqueDimensions = [...new Set(visibleDimensions)];
          for (const dimension of uniqueDimensions) {
            trackInteraction(openCommentBar, dimension, 'view');
          }
        }
      }

      // Update paragraph originalContent to match currentContent
      const updatedParagraphs = paragraphsWithIds.map(p => ({
        ...p,
        originalContent: p.currentContent
      }));
      setParagraphsWithIds(updatedParagraphs);

      // Store current paragraphs for comparison
      setLastUpdateParagraphs(getParagraphs(reviewText));

      // isModified is now derived from paragraph state - it becomes false
      // automatically when originalContent is set to currentContent above
    } catch (error) {
      // Handle errors from getComments API
      console.error('Error getting comments:', error);
      // TODO: Consider showing error message to user
      // For now, silently fail and allow user to retry
    } finally {
      // Only clear loading if this request is still current
      if (requestId === currentRequestIdRef.current) {
        setIsLoading(false);
        setLoadingProgress(0);
        setIsUpdating(false); // Re-enable editing
      }
    }
  };

  const handleCancel = () => {
    // Increment request ID to invalidate the current request
    currentRequestIdRef.current++;

    // Immediately reset UI
    setIsLoading(false);
    setLoadingProgress(0);
    setIsUpdating(false); // Re-enable editing

    console.log('Request cancelled by user (invalidated request, now expecting #' + currentRequestIdRef.current + ')');
  };

  const handleDiscard = () => {
    // Confirmation handled in App.jsx's handleDiscardReview
    onDiscardReview?.();
  };

  const truncatePaperName = (name) => {
    if (!name) return 'Untitled Review';
    if (name.length <= 20) return name;
    return name.substring(0, 20) + '...';
  };

  // Track interaction (view or dismiss) in the database
  const trackInteraction = async (paragraphId, dimension, interactionType) => {
    if (!reviewId) return;

    try {
      await supabase.rpc('track_interaction', {
        p_review_id: reviewId,
        p_paragraph_id: paragraphId,
        p_dimension: dimension,
        p_interaction_type: interactionType,
      });
    } catch (error) {
      // Silently ignore tracking errors - don't interrupt user workflow
      console.warn('Failed to track interaction:', error.message);
    }
  };

  const handleCommentBarClick = (paragraphId) => {
    if (openCommentBar === paragraphId) {
      setOpenCommentBar(null);
    } else {
      setOpenCommentBar(paragraphId);

      // Track view interaction for all visible comment dimensions
      const visibleComments = getVisibleComments(paragraphId);
      const dimensions = [...new Set(visibleComments.map(c => c.label))];
      for (const dimension of dimensions) {
        trackInteraction(paragraphId, dimension, 'view');
      }
    }
  };

  // Get visible comments for a paragraph (filtering out 'none' severity and dismissed comments)
  const getVisibleComments = (paragraphId) => {
    const paragraphComments = commentsByParagraphId[paragraphId];
    if (!paragraphComments || paragraphComments.length === 0) return [];

    const dismissed = dismissedComments[paragraphId] || new Set();
    return paragraphComments.filter(c =>
      c.severity !== 'none' && !dismissed.has(c.label)
    );
  };

  // Handle dismissing a comment
  const handleDismissComment = (paragraphId, label) => {
    setDismissedComments(prev => {
      const dismissed = new Set(prev[paragraphId] || []);
      dismissed.add(label);
      return { ...prev, [paragraphId]: dismissed };
    });

    // Clear comment heights for this paragraph to force re-measurement
    setCommentHeights(prev => {
      const updated = { ...prev };
      delete updated[paragraphId];
      return updated;
    });

    // Track dismiss interaction for this dimension
    trackInteraction(paragraphId, label, 'dismiss');
  };

  const getCommentBarColor = (paragraphId) => {
    const visibleComments = getVisibleComments(paragraphId);
    // Return true if there are any visible comments (proportional rendering handles all cases)
    return visibleComments.length > 0 ? true : null;
  };

  const getCommentSeverityCounts = (paragraphId) => {
    const visibleComments = getVisibleComments(paragraphId);
    const redCount = visibleComments.filter(c => c.severity === 'red').length;
    const yellowCount = visibleComments.filter(c => c.severity === 'yellow').length;

    return { red: redCount, yellow: yellowCount };
  };

  const isParagraphModified = (paragraphId) => {
    const paragraph = paragraphsWithIds.find(p => p.id === paragraphId);
    if (!paragraph) return false;
    return paragraph.currentContent !== paragraph.originalContent;
  };

  const isParagraphNew = (paragraphId) => {
    const paragraph = paragraphsWithIds.find(p => p.id === paragraphId);
    if (!paragraph) return false;
    return paragraph.originalContent === '';
  };

  const paragraphs = getParagraphs(reviewText);
  const textBlocks = parseTextBlocks(reviewText);

  // Calculate statistics for comment counts
  const getCommentStats = () => {
    const stats = {
      Actionability: 0,
      Helpfulness: 0,
      Grounding: 0,
      Verifiability: 0,
      Critical: 0,
      Moderate: 0
    };

    Object.keys(commentsByParagraphId).forEach(paragraphId => {
      const visibleComments = getVisibleComments(parseInt(paragraphId));
      visibleComments.forEach(comment => {
        // Count by label
        if (stats.hasOwnProperty(comment.label)) {
          stats[comment.label]++;
        }
        // Count by severity
        if (comment.severity === 'red') stats.Critical++;
        if (comment.severity === 'yellow') stats.Moderate++;
      });
    });

    return stats;
  };

  // Find first paragraph with a specific label or severity
  // If afterParagraphId is provided, search starts after that paragraph
  // If no match found after that paragraph, wraps around to the first match
  const findFirstParagraphWith = (type, value, afterParagraphId = null) => {
    const matchesCriteria = (paragraph) => {
      const visibleComments = getVisibleComments(paragraph.id);
      if (visibleComments.length === 0) return false;

      if (type === 'label') {
        return visibleComments.some(c => c.label === value);
      } else if (type === 'severity') {
        return visibleComments.some(c => c.severity === value);
      }
      return false;
    };

    // If no afterParagraphId, just find first match
    if (afterParagraphId === null) {
      for (const paragraph of paragraphsWithIds) {
        if (matchesCriteria(paragraph)) {
          return paragraph;
        }
      }
      return null;
    }

    // Find the index of the paragraph to search after
    const afterIndex = paragraphsWithIds.findIndex(p => p.id === afterParagraphId);
    if (afterIndex === -1) {
      // If afterParagraphId not found, just find first match
      for (const paragraph of paragraphsWithIds) {
        if (matchesCriteria(paragraph)) {
          return paragraph;
        }
      }
      return null;
    }

    // Search for next match after the specified paragraph
    for (let i = afterIndex + 1; i < paragraphsWithIds.length; i++) {
      if (matchesCriteria(paragraphsWithIds[i])) {
        return paragraphsWithIds[i];
      }
    }

    // No match found after, wrap around to first match
    for (const paragraph of paragraphsWithIds) {
      if (matchesCriteria(paragraph)) {
        return paragraph;
      }
    }

    return null;
  };

  // Get first 7 words of paragraph text
  const getFirst7Words = (text) => {
    const words = text.split(/\s+/).slice(0, 7);
    return words.join(' ') + '...';
  };

  // Handle clicking on a stat to scroll to next paragraph with that type
  // If a comment bar is open, search after it; otherwise start from beginning
  const handleStatClick = (type, value) => {
    const paragraph = findFirstParagraphWith(type, value, openCommentBar);
    if (paragraph) {
      setOpenCommentBar(paragraph.id);
      // Scroll will be handled by the existing useEffect
    }
  };

  const stats = getCommentStats();

  return (
    <div className="bg-white box-border flex flex-col gap-[21px] items-center justify-center px-[22px] py-[15px] h-screen w-full">
      {/* Paper Info Dialog */}
      {showPaperDialog && (
        <PaperInfoDialog
          onSubmit={handlePaperInfoSubmit}
          onCancel={() => {
            setShowPaperDialog(false);
            setIsInitialized(true);
          }}
        />
      )}

      {/* Label stats or Progress Bar - bottom left of UPDATE button */}
      {isLoading ? (
        /* Progress bar during update */
        <div className="absolute bottom-[10px] right-[169px] flex items-center gap-[10px]">
          {/* Progress bar container */}
          <div className="w-[200px] h-[20px] bg-gray-200 rounded-full overflow-hidden border border-gray-300">
            {/* Progress bar fill */}
            <div
              className="h-full bg-blue-500 transition-all duration-300 ease-out flex items-center justify-center"
              style={{ width: `${loadingProgress}%` }}
            >
              {/* Percentage text inside bar (only show if there's enough space) */}
              {loadingProgress > 15 && (
                <span className="text-white text-[12px] font-semibold">
                  {loadingProgress}%
                </span>
              )}
            </div>
          </div>
          {/* Percentage text outside bar (show if bar is too small) */}
          {loadingProgress <= 15 && (
            <span className="text-blue-500 text-[14px] font-semibold min-w-[40px]">
              {loadingProgress}%
            </span>
          )}
          {/* Loading text */}
          <span className="text-blue-500 text-[14px]">
            {loadingProgress < 100 ? `${loadingWord}...` : 'Complete!'}
          </span>
        </div>
      ) : (
        /* Label statistics when not loading */
        <div className="absolute font-normal text-[12px] text-black bottom-[10px] right-[169px] flex gap-[15px] items-center">
          {['Actionability', 'Helpfulness', 'Grounding', 'Verifiability'].map(label => {
            const count = stats[label];
            const paragraph = count > 0 ? findFirstParagraphWith('label', label, openCommentBar) : null;

            return (
              <span key={label} className="relative group">
                {count > 0 ? (
                  <button
                    onClick={() => handleStatClick('label', label)}
                    className="cursor-pointer hover:underline"
                  >
                    {label} ({count})
                  </button>
                ) : (
                  <span className="text-gray-400">{label} ({count})</span>
                )}
                {paragraph && count > 0 && (
                  <span className="absolute hidden group-hover:block bg-black text-white text-[10px] px-[6px] py-[3px] rounded whitespace-nowrap bottom-full left-0 mb-1 z-50">
                    {getFirst7Words(paragraph.currentContent)}
                  </span>
                )}
              </span>
            );
          })}
        </div>
      )}

      {/* UPDATE/CANCEL Button */}
      {isLoading ? (
        <button
          onClick={handleCancel}
          className="absolute bottom-[10px] right-[22px] box-border flex items-center justify-center px-[38px] py-[13px] rounded-[23px] h-[23px] w-[119px] border border-black bg-[#6c757d] cursor-pointer transition-colors duration-200"
        >
          <span className="font-normal text-[20px] text-white leading-none">
            CANCEL
          </span>
        </button>
      ) : (
        <button
          onClick={handleUpdate}
          disabled={!isModified}
          className={`absolute bottom-[10px] right-[22px] box-border flex items-center justify-center px-[38px] py-[13px] rounded-[23px] h-[23px] w-[119px] border border-black ${
            isModified ? 'bg-[#4a90e2] cursor-pointer' : 'bg-[#d9d9d9] cursor-not-allowed'
          } transition-colors duration-200`}
        >
          <span className="font-normal text-[20px] text-white leading-none">
            UPDATE
          </span>
        </button>
      )}

      {/* Header with Paper Name and Discard Button */}
      <div className="absolute top-[15px] left-[22px] flex items-center gap-3">
        <p className="font-normal text-[20px] text-black">
          {truncatePaperName(currentReview?.paperTitle)}
        </p>
        {isLocked ? (
          <span className="px-2 py-0.5 text-[12px] text-gray-400 border border-gray-200 rounded bg-gray-50">
            Locked
          </span>
        ) : (
          <button
            onClick={handleDiscard}
            disabled={isUpdating}
            className={`px-2 py-0.5 text-[12px] border rounded transition-colors ${
              isUpdating
                ? 'text-gray-300 border-gray-200 cursor-not-allowed'
                : 'text-gray-500 border-gray-300 hover:bg-gray-100 hover:text-gray-700'
            }`}
            title={isUpdating ? 'Please wait for update to complete' : (currentReview?.paperTitle || 'Discard this review')}
          >
            Discard
          </button>
        )}
        {savingStatus === 'saving' && (
          <span className="ml-3 text-[12px] text-gray-400 italic font-normal">
            saving...
          </span>
        )}
      </div>

      {/* Severity Statistics Bar - Centered */}
      <div className="absolute font-normal text-[12px] text-black top-[21px] left-1/2 -translate-x-1/2 flex gap-[15px] items-center">
        {/* Severity counts */}
        <span className="relative group">
          {stats.Critical > 0 ? (
            <button
              onClick={() => handleStatClick('severity', 'red')}
              className="cursor-pointer hover:underline"
              style={{ color: '#cc5656' }}
            >
              Critical ({stats.Critical})
            </button>
          ) : (
            <span className="text-gray-400">Critical ({stats.Critical})</span>
          )}
          {stats.Critical > 0 && (() => {
            // Find next paragraph that would be navigated to
            const paragraph = findFirstParagraphWith('severity', 'red', openCommentBar);
            return paragraph && (
              <span className="absolute hidden group-hover:block bg-black text-white text-[10px] px-[6px] py-[3px] rounded whitespace-nowrap top-full left-0 mt-1 z-50">
                {getFirst7Words(paragraph.currentContent)}
              </span>
            );
          })()}
        </span>

        <span className="relative group">
          {stats.Moderate > 0 ? (
            <button
              onClick={() => handleStatClick('severity', 'yellow')}
              className="cursor-pointer hover:underline"
              style={{ color: '#ffc700' }}
            >
              Moderate ({stats.Moderate})
            </button>
          ) : (
            <span className="text-gray-400">Moderate ({stats.Moderate})</span>
          )}
          {stats.Moderate > 0 && (() => {
            // Find next paragraph that would be navigated to
            const paragraph = findFirstParagraphWith('severity', 'yellow', openCommentBar);
            return paragraph && (
              <span className="absolute hidden group-hover:block bg-black text-white text-[10px] px-[6px] py-[3px] rounded whitespace-nowrap top-full left-0 mt-1 z-50">
                {getFirst7Words(paragraph.currentContent)}
              </span>
            );
          })()}
        </span>
      </div>

      {/* Main Viewport */}
      <div
        ref={viewportRef}
        className="absolute border border-black inset-[57px_22px_45px_22px] overflow-hidden"
      >
        <div
          ref={scrollContainerRef}
          className="flex gap-[35px] items-start justify-end overflow-y-auto overflow-x-hidden h-full hide-scrollbar"
          onScroll={handleScroll}
        >
          {/* Review Text Frame */}
          <div
            ref={reviewTextFrameRef}
            className={`border-t border-l border-r border-black box-border px-[20px] py-[10px] relative min-h-full ${openCommentBar === null || reviewTextWidth === null ? 'flex-1' : 'shrink-0'}`}
            style={openCommentBar !== null && reviewTextWidth !== null ? { width: `${reviewTextWidth}px` } : {}}
          >
            {/* Textarea for editing */}
            <textarea
              ref={textareaRef}
              value={reviewText}
              onChange={handleTextChange}
              readOnly={!isInitialized || isUpdating || isLocked}
              className="font-normal text-[12px] text-black w-full resize-none border-none outline-none bg-transparent leading-normal overflow-hidden"
              style={{
                minHeight: '100%',
                cursor: (!isInitialized || isUpdating || isLocked) ? 'not-allowed' : 'text',
                opacity: (!isInitialized || isUpdating) ? 0.6 : 1
              }}
            />

            {/* Loading overlay - shown while loading/creating review or updating */}
            {((!isInitialized && currentReview) || isUpdating) && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="text-[48px] text-gray-300 font-light">
                  Loading...
                </span>
              </div>
            )}

            {/* Welcome message overlay - shown when textarea is empty */}
            {reviewText === '' && isInitialized && (
              <div
                className="absolute inset-0 flex items-center justify-center cursor-text"
                onClick={() => textareaRef.current?.focus()}
              >
                <div className="text-center text-gray-400 font-normal text-[12px] leading-relaxed px-[20px]">
                  Welcome to Revas, the Review Assistant.
                  <br />
                  We want to help you write more helpful, actionable reviews.
                  <br />
                  <br />
                  To begin, type or paste your review text here.
                  <br />
                  <br />
                  Separate each of your review concerns with a blank line.
                  <br />
                  <br />
                  Press "Update" to get comments on the actionability, helpfulness,
                  <br />
                  grounding, and verifiability for each of your concerns as written.
                  <br />
                  <br />
                  Continue editing in this window to address comments
                  <br />
                  (then "Update" again)
                  <br />
                  <br />
                  When you are done, select and copy your review text to export it elsewhere
                  <br />
                  (at least until we have an export button!)
                </div>
              </div>
            )}


            {/* Hidden text with paragraph spans for alignment calculations */}
            <div
              ref={hiddenTextRef}
              className="absolute top-[10px] left-[20px] right-[20px] pointer-events-none opacity-0 font-normal text-[12px] text-black leading-normal whitespace-pre-wrap"
              aria-hidden="true"
            >
              {(() => {
                const blocks = parseTextBlocks(reviewText);
                let paragraphCount = 0;

                return blocks.map((block, index) => {
                  if (block.type === 'blank') {
                    return <div key={`blank-${index}`} className="block">&nbsp;</div>;
                  } else {
                    // Match by position in sequence, not by content
                    const paragraph = paragraphsWithIds[paragraphCount];
                    paragraphCount++;
                    return (
                      <div key={`para-${index}`} data-paragraph-id={paragraph?.id} className="block">
                        {block.content}
                      </div>
                    );
                  }
                });
              })()}
            </div>

            {/* Comment Bars */}
            {paragraphsWithIds.map((paragraph, index) => {
              const position = paragraphPositions[paragraph.id];  // FIX: Use paragraph.id, not index
              if (!position) return null;

              const id = paragraph.id;
              const color = getCommentBarColor(id);
              const isModified = isParagraphModified(id);

              // Check if paragraph has been analyzed but has no visible comments
              const hasBeenAnalyzed = commentsByParagraphId[id] !== undefined;
              const visibleComments = getVisibleComments(id);
              const hasNoVisibleComments = hasBeenAnalyzed && visibleComments.length === 0;

              // Render if: there are comments OR paragraph is modified OR has no visible comments (show green bar)
              if (!color && !isModified && !hasNoVisibleComments) return null;

              const isOpen = openCommentBar === id;
              const isClosed = openCommentBar !== null && !isOpen;

              return (
                <React.Fragment key={id}>
                  {/* Connecting line - aligned with first line of paragraph or green checkbox center */}
                  {isOpen && (() => {
                    let lineY;
                    if (hasNoVisibleComments) {
                      // Align with green checkbox center (paragraph center)
                      lineY = position.top + 10 + position.height / 2 - 1.5;
                    } else {
                      // Align with first line of paragraph (assuming 18px line-height for 12px text with leading-normal)
                      const firstLineHeight = 18;
                      lineY = position.top + 10 + firstLineHeight / 2 - 1.5;
                    }

                    return (
                      <svg
                        className="absolute pointer-events-none z-5"
                        style={{
                          top: `${lineY}px`,
                          right: '-28.5px',
                          width: '29px',
                          height: '3px'
                        }}
                      >
                        <line
                          x1="21"
                          y1="1.5"
                          x2="0"
                          y2="1.5"
                          stroke="black"
                          strokeWidth="3"
                        />
                      </svg>
                    );
                  })()}

                  <div
                    onClick={() => handleCommentBarClick(id)}
                    className="absolute w-[16px] cursor-pointer transition-all duration-200 z-10"
                    style={{
                      backgroundColor: 'transparent',
                      top: `${position.top + 10}px`,
                      height: isOpen && commentTextRef.current && !hasNoVisibleComments
                        ? `${commentTextRef.current.offsetHeight}px`
                        : `${position.height}px`,
                      right: isOpen ? '-28.5px' : '-8.5px'
                    }}
                  >
                    {/* Green square for paragraphs with no visible comments */}
                    {hasNoVisibleComments && (() => {
                      // When open with no visible comments, center on paragraph; otherwise use bar height
                      const barHeight = isOpen ? position.height : position.height;
                      const squareSize = 16;
                      const yOffset = (barHeight - squareSize) / 2;
                      const allClosed = openCommentBar === null;

                      return (
                        <svg
                          className="absolute left-0 top-0 pointer-events-none"
                          width="16"
                          height={barHeight}
                          style={{ height: '100%' }}
                        >
                          {/* Crosshatch pattern for closed green bars */}
                          <defs>
                            <pattern id={`crosshatch-green-${id}`} patternUnits="userSpaceOnUse" width="4" height="4">
                              <rect width="4" height="4" fill="white" />
                              <path d="M-1,1 l2,-2 M0,4 l4,-4 M3,5 l2,-2" stroke="#32CD32" strokeWidth="1" />
                            </pattern>
                          </defs>
                          {/* Green square - solid when all closed or this is open, crosshatch when closed */}
                          <rect
                            x="0"
                            y={yOffset}
                            width={squareSize}
                            height={squareSize}
                            fill={isClosed ? `url(#crosshatch-green-${id})` : '#32CD32'}
                            stroke="#32CD32"
                            strokeWidth={isClosed ? "2" : "0"}
                          />
                          {/* White checkmark only when this bar is open */}
                          {isOpen && (
                            <path
                              d={`M4,${yOffset + 8} L6.5,${yOffset + 10.5} L12,${yOffset + 5}`}
                              stroke="white"
                              strokeWidth="2"
                              fill="none"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          )}
                        </svg>
                      );
                    })()}

                    {/* Segmented bars when open, proportional when closed */}
                    {color && (() => {

                      // When open and we have measured comment heights, render segments
                      if (isOpen && commentHeights[id] && commentHeights[id].length > 0) {
                        const segments = commentHeights[id];
                        let currentY = 0;

                        return (
                          <>
                            <svg
                              className="absolute left-0 top-0 pointer-events-none"
                              width="16"
                              height={commentTextRef.current ? commentTextRef.current.offsetHeight : position.height}
                              style={{ height: '100%' }}
                            >
                              {/* Vertical connecting line - full height, drawn behind segments */}
                              {segments.length > 1 && (
                                <line
                                  x1="8"
                                  y1="0"
                                  x2="8"
                                  y2={commentTextRef.current ? commentTextRef.current.offsetHeight : position.height}
                                  stroke="black"
                                  strokeWidth="3"
                                />
                              )}
                              {/* Colored segment rectangles drawn on top of line */}
                              {segments.map((segment, idx) => {
                                const segmentElement = (
                                  <rect
                                    key={idx}
                                    x="0"
                                    y={currentY}
                                    width="16"
                                    height={segment.height}
                                    fill={segment.color}
                                  />
                                );
                                currentY += segment.height + 11; // Add gap between comments
                                return segmentElement;
                              })}
                            </svg>
                            {/* Blue dotted lines for each segment when modified */}
                            {isModified && (
                              <svg
                                className="absolute left-0 top-0 pointer-events-none"
                                width="16"
                                height={commentTextRef.current ? commentTextRef.current.offsetHeight : position.height}
                                style={{ height: '100%' }}
                              >
                                {segments.map((segment, idx) => {
                                  const segmentY = segments.slice(0, idx).reduce((sum, s) => sum + s.height + 11, 0);
                                  return (
                                    <rect
                                      key={idx}
                                      x="1.5"
                                      y={segmentY + 1.5}
                                      width="13"
                                      height={segment.height - 3}
                                      fill="none"
                                      stroke="#4a90e2"
                                      strokeWidth="3"
                                      strokeDasharray="6 3"
                                    />
                                  );
                                })}
                              </svg>
                            )}
                          </>
                        );
                      }

                      // When closed, use proportional display
                      const counts = getCommentSeverityCounts(id);
                      const total = counts.red + counts.yellow;
                      if (total === 0) return null;

                      const redProportion = counts.red / total;
                      const redHeight = position.height * redProportion;

                      return (
                        <svg
                          className="absolute left-0 top-0 pointer-events-none"
                          width="16"
                          height={position.height}
                          style={{ height: '100%' }}
                        >
                          {/* Define crosshatch patterns for closed bars */}
                          <defs>
                            <pattern id={`crosshatch-red-${id}`} patternUnits="userSpaceOnUse" width="4" height="4">
                              <rect width="4" height="4" fill="white" />
                              <path d="M-1,1 l2,-2 M0,4 l4,-4 M3,5 l2,-2" stroke="#cc5656" strokeWidth="1" />
                            </pattern>
                            <pattern id={`crosshatch-yellow-${id}`} patternUnits="userSpaceOnUse" width="4" height="4">
                              <rect width="4" height="4" fill="white" />
                              <path d="M-1,1 l2,-2 M0,4 l4,-4 M3,5 l2,-2" stroke="#ffc700" strokeWidth="1" />
                            </pattern>
                          </defs>
                          {/* Red bar (top portion, 0% if no red comments) */}
                          {counts.red > 0 && (
                            <rect
                              x="1"
                              y="1"
                              width="14"
                              height={redHeight - (counts.yellow > 0 ? 1 : 2)}
                              fill={isClosed ? `url(#crosshatch-red-${id})` : '#cc5656'}
                              stroke="#cc5656"
                              strokeWidth="2"
                            />
                          )}
                          {/* Yellow bar (bottom portion, 0% if no yellow comments) */}
                          {counts.yellow > 0 && (
                            <rect
                              x="1"
                              y={redHeight + (counts.red > 0 ? 0 : 1)}
                              width="14"
                              height={position.height - redHeight - (counts.red > 0 ? 1 : 2)}
                              fill={isClosed ? `url(#crosshatch-yellow-${id})` : '#ffc700'}
                              stroke="#ffc700"
                              strokeWidth="2"
                            />
                          )}
                        </svg>
                      );
                    })()}

                    {isModified && !isOpen && (
                      <svg
                        className="absolute left-0 top-0 pointer-events-none"
                        width="16"
                        height={isOpen && commentTextRef.current
                          ? commentTextRef.current.offsetHeight
                          : position.height}
                        style={{ height: '100%' }}
                      >
                        <rect
                          x={isClosed ? "3.5" : "1.5"}
                          y={isClosed ? "3.5" : "1.5"}
                          width={isClosed ? "9" : "13"}
                          height={(isOpen && commentTextRef.current
                            ? commentTextRef.current.offsetHeight
                            : position.height) - (isClosed ? 7 : 3)}
                          fill="none"
                          stroke="#4a90e2"
                          strokeWidth="3"
                          strokeDasharray="6 3"
                        />
                      </svg>
                    )}
                  </div>
                </React.Fragment>
              );
            })}

            {/* Resize Handle - Only show when a comment bar is open */}
            {openCommentBar !== null && (
              <div
                className="absolute top-0 bottom-0 w-[6px] cursor-col-resize hover:bg-blue-200 transition-colors z-0"
                style={{ right: '-3px' }}
                onMouseDown={handleResizeMouseDown}
              />
            )}
          </div>

          {/* Comment Frame - Only show when a comment bar is open */}
          {openCommentBar !== null && (() => {
            const paragraphIndex = paragraphsWithIds.findIndex(p => p.id === openCommentBar);
            const position = paragraphPositions[openCommentBar];  // FIX: Use openCommentBar (paragraph ID), not index
            const paragraphComments = commentsByParagraphId[openCommentBar];

            return (
              <div className="flex-1 font-normal text-[12px] text-black relative min-h-full">
                {paragraphComments && (() => {
                  // Get visible comments (filtering out 'none' severity and dismissed)
                  const visibleComments = getVisibleComments(openCommentBar);

                  // Simple top-aligned position
                  const commentTop = position ? position.top + 10 : 0;

                  return visibleComments.length > 0 && (
                    <div
                      ref={commentTextRef}
                      className="absolute left-0 flex flex-col gap-[11px]"
                      style={{
                        top: `${commentTop}px`
                      }}
                    >
                      {visibleComments
                      .sort((a, b) => {
                        // Red comments come before yellow
                        if (a.severity === 'red' && b.severity !== 'red') return -1;
                        if (a.severity !== 'red' && b.severity === 'red') return 1;
                        return 0;
                      })
                      .map((comment, index) => (
                        <div
                          key={index}
                          className="leading-normal"
                          ref={(el) => {
                            // Measure and store each comment's height only if it changed
                            if (el && openCommentBar !== null) {
                              const height = el.offsetHeight;
                              const color = comment.severity === 'red' ? '#cc5656' : '#ffc700';

                              setCommentHeights(prev => {
                                const existing = prev[openCommentBar] || [];
                                const current = existing[index];

                                // Only update if height or color changed
                                if (!current || current.height !== height || current.color !== color || current.label !== comment.label) {
                                  const updated = [...existing];
                                  updated[index] = { label: comment.label, height, color };
                                  return { ...prev, [openCommentBar]: updated };
                                }

                                return prev; // No change, return same object to prevent re-render
                              });
                            }
                          }}
                        >
                          <div className="flex items-center gap-[8px]">
                            <p
                              className="font-bold mb-0 not-italic"
                              style={{ color: comment.severity === 'red' ? '#cc5656' : '#ffc700' }}
                            >
                              {comment.label}
                            </p>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDismissComment(openCommentBar, comment.label);
                              }}
                              className="text-gray-400 hover:text-gray-600 text-[10px] cursor-pointer bg-transparent border-none p-0 leading-none"
                              title="Dismiss this comment"
                            >
                              ✕
                            </button>
                          </div>
                          <p className="mb-0">{comment.text}</p>
                        </div>
                      ))}
                    </div>
                  );
                })()}
            </div>
            );
          })()}
        </div>
      </div>

    </div>
  );
});

ReviewComponent.displayName = 'ReviewComponent';

export default ReviewComponent;
