import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';

// Mock function to generate comments for paragraphs
// In a real app, this would be an HTTP endpoint call
const getComments = async (paragraphs) => {
  // paragraphs: array of {id, content}
  // Returns: object keyed by paragraph id with comment data

  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 500));

  const results = {};

  paragraphs.forEach(para => {
    // Generate random scores for demo purposes
    const labels = ['Actionability', 'Helpfulness', 'Grounding', 'Verifiability'];
    const comment = {};

    labels.forEach(label => {
      const score = Math.floor(Math.random() * 5) + 1; // 1-5
      comment[label] = {
        score: score,
        text: `${label} feedback for paragraph: Score ${score}/5. ${para.content.substring(0, 50)}...`
      };
    });

    results[para.id] = comment;
  });

  return results;
};

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
    if (openCommentBar !== null && reviewTextFrameRef.current && viewportRef.current) {
      if (widthFractionRef.current === null) {
        // First time opening - capture initial fraction
        const reviewTextRect = reviewTextFrameRef.current.getBoundingClientRect();
        const viewportRect = viewportRef.current.getBoundingClientRect();
        const fraction = reviewTextRect.width / viewportRect.width;
        widthFractionRef.current = fraction;
        setReviewTextWidth(reviewTextRect.width);
      } else {
        // Reopening - use stored fraction
        const viewportRect = viewportRef.current.getBoundingClientRect();
        const newWidth = viewportRect.width * widthFractionRef.current;
        setReviewTextWidth(newWidth);
      }
    }
    // Trigger recalculation when comment bar opens/closes to update paragraph boundaries
    setResizeCounter(prev => prev + 1);
  }, [openCommentBar]);

  // Listen for window resize events and maintain width fraction
  useEffect(() => {
    const handleResize = () => {
      if (openCommentBar !== null && viewportRef.current && widthFractionRef.current !== null) {
        const viewportRect = viewportRef.current.getBoundingClientRect();
        const newWidth = viewportRect.width * widthFractionRef.current;
        setReviewTextWidth(newWidth);
      }
      setResizeCounter(prev => prev + 1);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [openCommentBar]);

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
  }, [reviewText, scrollTop, resizeCounter]);

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
      // When closing a comment bar, scroll to center the closed bar after resize
      if (justClosedCommentRef.current !== null &&
          paragraphPositions[justClosedCommentRef.current] &&
          scrollContainerRef.current) {
        const scrollTimer = setTimeout(() => {
          const position = paragraphPositions[justClosedCommentRef.current];
          const scrollContainer = scrollContainerRef.current;
          const containerHeight = scrollContainer.clientHeight;

          // Calculate the center of the comment bar relative to the scrollable content
          const commentBarCenter = position.top + 10 + (position.height / 2);

          // Scroll so the comment bar center aligns with viewport center
          const targetScrollTop = commentBarCenter - (containerHeight / 2);

          scrollContainer.scrollTo({
            top: Math.max(0, targetScrollTop),
            behavior: 'smooth'
          });

          // Clear the just closed ref
          justClosedCommentRef.current = null;
        }, 100); // Wait 100ms for layout to settle

        return () => clearTimeout(scrollTimer);
      }
      // Reset when closing a comment bar so clicking the same bar again will scroll
      lastScrolledCommentRef.current = null;
    } else if (openCommentBar !== lastScrolledCommentRef.current &&
               paragraphPositions[openCommentBar] &&
               scrollContainerRef.current) {
      // Opening a comment bar - scroll to center it
      const scrollTimer = setTimeout(() => {
        const position = paragraphPositions[openCommentBar];
        const scrollContainer = scrollContainerRef.current;
        const containerHeight = scrollContainer.clientHeight;

        // Calculate the center of the comment bar relative to the scrollable content
        const commentBarCenter = position.top + 10 + (position.height / 2);

        // Scroll so the comment bar center aligns with viewport center
        const targetScrollTop = commentBarCenter - (containerHeight / 2);

        scrollContainer.scrollTo({
          top: Math.max(0, targetScrollTop),
          behavior: 'smooth'
        });

        // Mark this comment as scrolled
        lastScrolledCommentRef.current = openCommentBar;
      }, 100); // Wait 100ms for layout to settle

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

          // Only include items that are not severity 'none'
          if (severity !== 'none') {
            formattedComments.push({
              severity: severity,
              label: label,
              text: text
            });
          }
        }
      });

      // Only add comments for this paragraph if there are any non-'none' items
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

    // Red if any comments are red, yellow otherwise
    const hasRed = paragraphComments.some(c => c.severity === 'red');
    return hasRed ? '#cc5656' : '#ffc700';
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
                      backgroundColor: color || 'transparent',
                      top: `${position.top + 10}px`,
                      height: `${position.height}px`,
                      right: isOpen ? '-28.5px' : '-8.5px'
                    }}
                  >
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
                {paragraphComments && (
                  <div
                    className="absolute left-0 flex flex-col gap-[11px]"
                    style={{
                      top: position
                        ? `${position.top + 10 + (position.height - getTotalCommentHeight(paragraphComments)) / 2}px`
                        : '0px'
                    }}
                  >
                    {paragraphComments
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
              )}
            </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

// Helper function to calculate total height of comments
function getTotalCommentHeight(comments) {
  // Rough estimate: 15px per line, plus label height
  return comments.reduce((total, comment) => {
    const lines = Math.ceil(comment.text.length / 50);
    return total + (lines * 15) + 20; // 20 for label
  }, 0) + (comments.length - 1) * 11; // 11px gap between comments
}
