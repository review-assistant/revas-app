import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { getComments } from './commentsClient.js';

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
  if (score <= 4) return 'yellow';
  return 'none';
};

const initialReviewText = `Limited insights from the analysis. I appreciate the attempt of the authors to propose a new algorithm to analyze the impact of the context to reasoning path of LLMs, however, beyond the algorithm itself I don't see much new insights from the analysis. For example, one main finding from the paper is "good context can lead to incorrect answers and bad context can lead to correct answers,", this is not new and has been revealed from previous work (e.g., [1]). I would like to see the authors do more in-depth analysis with their method.



Lack of experiments. One of the main contribution claimed by the authors is the proposed methods leading to more accurate reasoning of LLMs, however, it is not well supported by the experiment:- The paper only compares with self-consistency method, but doesn't compare with other state-of-the-art baselines such as Tree of Thoughts or Graph of Thoughts.- The method improves over self-consistency (Table 2) but it is quite marginal (<=2%). Is that statistical significant? Even if so, how do we justify the significantly increased complexity introduced by the method (tree constructing and maintenance etc)? It is worth mentioning in the paper.- If the claim is about improvement of reasoning correctness on the reasoning path, there is no evaluation results to verify whether the reasoning path quality has improved.






I think the paper need improvement on the writing, here are a few examples:- Long sequences in the paper are not easy to follow. For example, line 13-17 in the abstract;- Fix the citation in line 62-64, and line 256.- Figure 3, it is not clear what is the difference between 3 plots on the same row. I think caption should be added to emphasize that.- As mentioned above, section 3.3 should be expanded to include more details, e.g., what metrics are used? How should we interpret the results? reference:[1] Language Models Don't Always Say What They Think: Unfaithful Explanations in Chain-of-Thought Prompting

What's the motivation for calculating the upperbound of variations for uncertainty quantification? As shown in Eq 1. The objective is to estimate the variance given an different parameters initializations. To solve this, the DNN is first linearized locally with the NTK theory and the upperbound for introducing the changes are calculated with the NTK theory. The paradox is if the parameters can be already be perturbed, why NTK is needed for calculating the upperbound. Besides, calculating the upperbound will bring biased estimations of uncertainty. Another simple way to achieve this might be directly apply random perturbations to the network parameters (like random noises injection, dropout parameters), can easily get ensemble of neural network parameters. What is the advantage over these methods?

Given that $\\lambda \\in\\{\\sqrt{o}, 3 \\sqrt{o}\\}$, where $o$ represents the number of output dimensions, why does Figure 4 only explore the range of $\\lambda$ values between 0 and 3 on ImageNet-200? The authors should consider exploring a broader range of this hyperparameter.

The authors mention that TULiP is over three times faster than ViM, noting that ViM takes more than 30 minutes just to extract ID information on a recent GPU machine. However, it appears that the proposed method requires $M=10$ forward passes per sample for OOD detection. Compared to classic OOD detectors like EBO, does this imply that the detection speed of the proposed method is relatively slower?

In the experiments, the authors calculated Equation 8 using 256 samples from the ID dataset (ImageNet-1K) and 128 samples per OOD dataset. However, the authors do not clarify how these 256 ID samples and 128 OOD samples were selected or whether OOD samples align with test samples. Additionally, did the authors know beforehand which samples were ID and OOD when using these samples?

Have the authors considered the impact of different types of OOD data? For example, have the authors considered situations where OOD data is very far from ID data to improve detection of far-OOD.`;

export default function ReviewComponent() {
  const [reviewText, setReviewText] = useState(initialReviewText);
  const [originalText, setOriginalText] = useState(''); // Start empty so update button is active
  const [isModified, setIsModified] = useState(true); // Start as modified
  const [openCommentBar, setOpenCommentBar] = useState(null); // Start with no comment bar open
  const [paragraphPositions, setParagraphPositions] = useState({});
  const [scrollTop, setScrollTop] = useState(0);
  const [resizeCounter, setResizeCounter] = useState(0);
  const [reviewTextWidth, setReviewTextWidth] = useState(null);
  const [lastUpdateParagraphs, setLastUpdateParagraphs] = useState([]);
  const [isDragging, setIsDragging] = useState(false);

  // Stable paragraph tracking: {id, originalContent, currentContent}
  const [paragraphsWithIds, setParagraphsWithIds] = useState([]);
  const nextParagraphIdRef = useRef(0);
  const [commentsByParagraphId, setCommentsByParagraphId] = useState({});

  const textareaRef = useRef(null);
  const hiddenTextRef = useRef(null);
  const viewportRef = useRef(null);
  const reviewTextFrameRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const widthFractionRef = useRef(null);
  const lastScrolledCommentRef = useRef(null);
  const justClosedCommentRef = useRef(null);

  // Initialize paragraph IDs on first render
  useEffect(() => {
    const initialParagraphTexts = getParagraphs(initialReviewText);

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

    // Phase 1: Exact matches
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

    // Phase 2: Bag-of-words matches
    for (let i = unmatchedNewIndices.length - 1; i >= 0; i--) {
      const newIndex = unmatchedNewIndices[i];
      const newText = newParagraphTexts[newIndex];
      const newWords = new Set(newText.toLowerCase().split(/\s+/).filter(w => w.length > 0));

      let bestMatch = null;
      let bestOverlap = 0;

      for (const saved of unmatchedSaved) {
        const savedWords = new Set(saved.currentContent.toLowerCase().split(/\s+/).filter(w => w.length > 0));
        const intersection = new Set([...newWords].filter(w => savedWords.has(w)));
        const union = new Set([...newWords, ...savedWords]);
        const overlapRatio = union.size > 0 ? intersection.size / union.size : 0;

        if (overlapRatio > 0.5 && overlapRatio > bestOverlap) {
          bestOverlap = overlapRatio;
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
    if (paragraphsWithIds.length === 0) return; // Wait for initialization

    const newParagraphTexts = getParagraphs(reviewText);
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

    setParagraphsWithIds(updated);
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
  }, [reviewText, scrollTop, resizeCounter, reviewTextWidth]);

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

  // Scroll to center the clicked comment bar after layout settles (only once per click)
  useEffect(() => {
    if (openCommentBar === null) {
      // When closing a comment bar, just reset the scroll ref
      // Don't scroll - let the view stay where it is
      justClosedCommentRef.current = null;
      lastScrolledCommentRef.current = null;
    } else if (openCommentBar !== lastScrolledCommentRef.current &&
               paragraphPositions[openCommentBar] &&
               scrollContainerRef.current) {
      // Opening a comment bar - scroll to center it
      const scrollTimer = setTimeout(() => {
        // Re-check that this comment is still open (user might have clicked again)
        if (openCommentBar === null) return;

        const position = paragraphPositions[openCommentBar];
        if (!position) return; // Position not available yet

        const scrollContainer = scrollContainerRef.current;
        if (!scrollContainer) return;

        const containerHeight = scrollContainer.clientHeight;
        const currentScrollTop = scrollContainer.scrollTop;

        // Check if comment bar is fully visible in viewport
        const barTop = position.top + 10;
        const barBottom = position.top + 10 + position.height;
        const viewportTop = currentScrollTop;
        const viewportBottom = currentScrollTop + containerHeight;

        const isFullyVisible = barTop >= viewportTop && barBottom <= viewportBottom;

        // Only scroll if comment bar is not fully visible
        if (!isFullyVisible) {
          // Calculate the center of the comment bar relative to the scrollable content
          const commentBarCenter = position.top + 10 + (position.height / 2);

          // Scroll so the comment bar center aligns with viewport center
          const targetScrollTop = commentBarCenter - (containerHeight / 2);

          // Clamp to valid scroll range
          const maxScrollTop = scrollContainer.scrollHeight - containerHeight;
          const clampedScrollTop = Math.max(0, Math.min(targetScrollTop, maxScrollTop));

          scrollContainer.scrollTo({
            top: clampedScrollTop,
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
    setIsModified(e.target.value !== originalText);
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

  const handleUpdate = async () => {
    if (!isModified) return;

    // Collect modified paragraphs
    const modifiedParagraphs = paragraphsWithIds
      .filter(p => p.currentContent !== p.originalContent)
      .map(p => ({
        id: p.id,
        content: p.currentContent
      }));

    console.log('Updating comments for modified paragraphs:', modifiedParagraphs);

    // Call getComments function (mock or API endpoint)
    const commentResults = await getComments(modifiedParagraphs);

    // Transform API response to internal comment format with severity
    // Also implement monotonic score behavior: new scores are max of old and new
    const newComments = {};

    Object.keys(commentResults).forEach(paragraphIdStr => {
      const paragraphId = parseInt(paragraphIdStr);
      const commentData = commentResults[paragraphIdStr];
      const existingComments = commentsByParagraphId[paragraphId] || [];

      // Transform each label's data into the internal format
      const formattedComments = [];
      const labels = ['Actionability', 'Helpfulness', 'Grounding', 'Verifiability'];

      labels.forEach(label => {
        if (commentData[label]) {
          let { score, text } = commentData[label];

          // Check if this paragraph has test markers that should override monotonic behavior
          const labelMarkers = { 'Actionability': 'A', 'Helpfulness': 'H', 'Grounding': 'G', 'Verifiability': 'V' };
          const marker = labelMarkers[label];
          const paraContent = modifiedParagraphs.find(p => p.id === paragraphId)?.content || '';
          const hasMarker = paraContent.includes(`XXX${marker}`) ||
                            paraContent.includes(`YYY${marker}`) ||
                            paraContent.includes(`ZZZ${marker}`);

          // Implement monotonic behavior UNLESS a marker is present (markers always override)
          if (!hasMarker) {
            const existingComment = existingComments.find(c => c.label === label);
            if (existingComment && existingComment.score) {
              // Take the maximum of old and new scores
              score = Math.max(existingComment.score, score);
              // Update text to reflect the final score
              text = `${label} feedback for paragraph: Score ${score}/5. ${commentData[label].text.split('. ').slice(1).join('. ')}`;
            }
          }

          const severity = scoreToSeverity(score);

          // Store all items including severity 'none' for score tracking
          // Items with severity 'none' will be filtered out at display time
          formattedComments.push({
            severity: severity,
            label: label,
            text: text,
            score: score // Store the score for future comparisons
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

    // Update paragraph originalContent to match currentContent
    const updatedParagraphs = paragraphsWithIds.map(p => ({
      ...p,
      originalContent: p.currentContent
    }));
    setParagraphsWithIds(updatedParagraphs);

    // Store current paragraphs for comparison
    setLastUpdateParagraphs(getParagraphs(reviewText));

    // Update original text and deactivate button
    setOriginalText(reviewText);
    setIsModified(false);
  };

  const handleCommentBarClick = (paragraphId) => {
    if (openCommentBar === paragraphId) {
      setOpenCommentBar(null);
    } else {
      setOpenCommentBar(paragraphId);
    }
  };

  const getCommentBarColor = (paragraphId) => {
    const paragraphComments = commentsByParagraphId[paragraphId];
    if (!paragraphComments || paragraphComments.length === 0) return null;

    // Filter out 'none' severity items (score 5) - they shouldn't be displayed
    const visibleComments = paragraphComments.filter(c => c.severity !== 'none');
    if (visibleComments.length === 0) return null;

    // Return true if there are any visible comments (proportional rendering handles all cases)
    return true;
  };

  const getCommentSeverityCounts = (paragraphId) => {
    const paragraphComments = commentsByParagraphId[paragraphId];
    if (!paragraphComments) return { red: 0, yellow: 0 };

    const visibleComments = paragraphComments.filter(c => c.severity !== 'none');
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

    Object.values(commentsByParagraphId).forEach(comments => {
      const visibleComments = comments.filter(c => c.severity !== 'none');
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
      const comments = commentsByParagraphId[paragraph.id];
      if (!comments) return false;

      const visibleComments = comments.filter(c => c.severity !== 'none');
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
      {/* UPDATE Button */}
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

      {/* Header */}
      <p className="absolute font-normal text-[20px] text-black top-[15px] left-[22px] w-[1036px]">
        Edit your review:
      </p>

      {/* Statistics Bar */}
      <div className="absolute font-normal text-[12px] text-black top-[15px] right-[22px] flex gap-[15px]">
        {/* Label counts */}
        {['Actionability', 'Helpfulness', 'Grounding', 'Verifiability'].map(label => {
          const count = stats[label];
          // Find next paragraph that would be navigated to (after current open comment, or first if none open)
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
                <span className="absolute hidden group-hover:block bg-black text-white text-[10px] px-[6px] py-[3px] rounded whitespace-nowrap top-full left-0 mt-1 z-50">
                  {getFirst7Words(paragraph.currentContent)}
                </span>
              )}
            </span>
          );
        })}

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
            className={`border border-black box-border px-[20px] py-[10px] relative min-h-full ${openCommentBar === null || reviewTextWidth === null ? 'flex-1' : 'shrink-0'}`}
            style={openCommentBar !== null && reviewTextWidth !== null ? { width: `${reviewTextWidth}px` } : {}}
          >
            {/* Textarea for editing */}
            <textarea
              ref={textareaRef}
              value={reviewText}
              onChange={handleTextChange}
              className="font-normal text-[12px] text-black w-full resize-none border-none outline-none bg-transparent leading-normal overflow-hidden"
              style={{ minHeight: '100%' }}
            />

            {/* Hidden text with paragraph spans for alignment calculations */}
            <div
              ref={hiddenTextRef}
              className="absolute top-[10px] left-[20px] right-[20px] pointer-events-none opacity-0 font-normal text-[12px] text-black leading-normal whitespace-pre-wrap"
              aria-hidden="true"
            >
              {textBlocks.map((block, index) => {
                if (block.type === 'paragraph') {
                  return (
                    <div key={`p-${block.id}`} data-paragraph-id={block.id} className="block">
                      {block.content}
                    </div>
                  );
                } else {
                  // Render blank line
                  return <div key={`b-${index}`} className="block">&nbsp;</div>;
                }
              })}
            </div>

            {/* Comment Bars */}
            {paragraphsWithIds.map((paragraph, index) => {
              const position = paragraphPositions[index];
              if (!position) return null;

              const id = paragraph.id;
              const color = getCommentBarColor(id);
              const isModified = isParagraphModified(id);

              // Only render if there are comments OR if the paragraph is modified
              if (!color && !isModified) return null;

              const isOpen = openCommentBar === id;

              return (
                <React.Fragment key={id}>
                  {/* Connecting line - drawn behind comment bar */}
                  {isOpen && (
                    <svg
                      className="absolute pointer-events-none z-5"
                      style={{
                        top: `${position.top + 10 + position.height / 2 - 1.5}px`,
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
                  )}

                  <div
                    onClick={() => handleCommentBarClick(id)}
                    className="absolute w-[16px] cursor-pointer transition-all duration-200 z-10"
                    style={{
                      backgroundColor: 'transparent',
                      top: `${position.top + 10}px`,
                      height: `${position.height}px`,
                      right: isOpen ? '-28.5px' : '-8.5px'
                    }}
                  >
                    {/* Proportional red and yellow bars (works for pure or mixed) */}
                    {color && (() => {
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
                          {/* Red bar (top portion, 0% if no red comments) */}
                          {counts.red > 0 && (
                            <rect
                              x="0"
                              y="0"
                              width="16"
                              height={redHeight}
                              fill="#cc5656"
                            />
                          )}
                          {/* Yellow bar (bottom portion, 0% if no yellow comments) */}
                          {counts.yellow > 0 && (
                            <rect
                              x="0"
                              y={redHeight}
                              width="16"
                              height={position.height - redHeight}
                              fill="#ffc700"
                            />
                          )}
                        </svg>
                      );
                    })()}

                    {isModified && (
                      <svg
                        className="absolute left-0 top-0 pointer-events-none"
                        width="16"
                        height={position.height}
                        style={{ height: '100%' }}
                      >
                        <rect
                          x="1.5"
                          y="1.5"
                          width="13"
                          height={position.height - 3}
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
            const position = paragraphIndex >= 0 ? paragraphPositions[paragraphIndex] : null;
            const paragraphComments = commentsByParagraphId[openCommentBar];

            return (
              <div className="flex-1 font-normal text-[12px] text-black relative min-h-full">
                {paragraphComments && (() => {
                  // Filter out 'none' severity items (score 5) at display time
                  const visibleComments = paragraphComments.filter(c => c.severity !== 'none');

                  // Simple top-aligned position
                  const commentTop = position ? position.top + 10 : 0;

                  return visibleComments.length > 0 && (
                    <div
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
                        <div key={index} className="leading-normal">
                          <p
                            className="font-bold mb-0 not-italic"
                            style={{ color: comment.severity === 'red' ? '#cc5656' : '#ffc700' }}
                          >
                            {comment.label}
                          </p>
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
}
