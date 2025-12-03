import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';

// Mock comment data - in a real app, this would come from an API
const initialComments = {
  1: [
    {
      severity: 'yellow',
      label: 'Actionability',
      text: 'The comment gives concrete advice about changes that would improve the paper, but it could be better.'
    },
    {
      severity: 'yellow',
      label: 'Helpfulness',
      text: 'This is not a very helpful comment.'
    }
  ],
  2: [
    {
      severity: 'red',
      label: 'Actionability',
      text: 'The comment gives concrete advice about changes that would improve the paper, but it could be better.'
    },
    {
      severity: 'yellow',
      label: 'Helpfulness',
      text: 'This is not a very helpful comment.'
    }
  ],
  4: [
    {
      severity: 'yellow',
      label: 'Grounding',
      text: 'The comment should provide more specific evidence from the paper.'
    }
  ]
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
  const [originalText, setOriginalText] = useState(initialReviewText);
  const [isModified, setIsModified] = useState(false);
  const [comments, setComments] = useState(initialComments);
  const [openCommentBar, setOpenCommentBar] = useState(null); // Start with no comment bar open
  const [paragraphPositions, setParagraphPositions] = useState({});
  const [scrollTop, setScrollTop] = useState(0);
  const [resizeCounter, setResizeCounter] = useState(0);
  const [reviewTextWidth, setReviewTextWidth] = useState(null);

  const textareaRef = useRef(null);
  const hiddenTextRef = useRef(null);
  const viewportRef = useRef(null);
  const reviewTextFrameRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const widthFractionRef = useRef(null);
  const lastScrolledCommentRef = useRef(null);
  const justClosedCommentRef = useRef(null);

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

  // Calculate and store width fraction when a comment bar is opened for the first time
  useLayoutEffect(() => {
    if (openCommentBar !== null && reviewTextFrameRef.current && viewportRef.current && widthFractionRef.current === null) {
      const reviewTextRect = reviewTextFrameRef.current.getBoundingClientRect();
      const viewportRect = viewportRef.current.getBoundingClientRect();
      const fraction = reviewTextRect.width / viewportRect.width;
      widthFractionRef.current = fraction;
      setReviewTextWidth(reviewTextRect.width);
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

  const handleUpdate = () => {
    if (!isModified) return;

    // Mock function to compute new comments
    // In a real app, this would call an API
    console.log('Updating comments for text:', reviewText);

    // Simulate comment update
    setOriginalText(reviewText);
    setIsModified(false);

    // You could update comments here based on the new text
    // For now, keeping existing comments
  };

  const handleCommentBarClick = (paragraphId) => {
    if (openCommentBar === paragraphId) {
      setOpenCommentBar(null);
    } else {
      setOpenCommentBar(paragraphId);
    }
  };

  const getCommentBarColor = (paragraphId) => {
    const paragraphComments = comments[paragraphId];
    if (!paragraphComments || paragraphComments.length === 0) return null;

    // Red if any comments are red, yellow otherwise
    const hasRed = paragraphComments.some(c => c.severity === 'red');
    return hasRed ? '#cc5656' : '#ffc700';
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
          className="flex gap-[35px] items-start justify-end overflow-y-auto h-full"
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
            {Object.keys(paragraphPositions).map((paragraphId) => {
              const id = parseInt(paragraphId);
              const color = getCommentBarColor(id);
              if (!color) return null;

              const position = paragraphPositions[id];
              const isOpen = openCommentBar === id;

              return (
                <div
                  key={id}
                  onClick={() => handleCommentBarClick(id)}
                  className="absolute w-[16px] cursor-pointer transition-all duration-200"
                  style={{
                    backgroundColor: color,
                    top: `${position.top + 10}px`,
                    height: `${position.height}px`,
                    right: isOpen ? '-28.5px' : '-8.5px'
                  }}
                />
              );
            })}
          </div>

          {/* Comment Frame - Only show when a comment bar is open */}
          {openCommentBar !== null && (
            <div className="flex-1 font-normal text-[12px] text-black relative min-h-full">
              {comments[openCommentBar] && (
                <div
                  className="absolute left-0 flex flex-col gap-[11px]"
                  style={{
                    top: paragraphPositions[openCommentBar]
                      ? `${paragraphPositions[openCommentBar].top + 10 + (paragraphPositions[openCommentBar].height - getTotalCommentHeight(comments[openCommentBar])) / 2}px`
                      : '0px'
                  }}
                >
                  {comments[openCommentBar]
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
          )}
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
