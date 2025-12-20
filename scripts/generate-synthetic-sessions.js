#!/usr/bin/env node

/**
 * Synthetic User Session Generator
 *
 * Generates realistic user interaction data for developing the interaction report.
 *
 * Each session simulates a user:
 * 1. Submitting a review for scoring
 * 2. Iteratively viewing comments, editing paragraphs, or dismissing comments
 * 3. Until all scores are 5 or max interactions reached
 *
 * Usage:
 *   node scripts/generate-synthetic-sessions.js [options]
 *
 * Options:
 *   --sessions=N      Number of sessions to generate (default: 10)
 *   --max-interactions=N  Max interactions per session (default: 20)
 *   --edit-ratio=N    Probability of edit vs dismiss (default: 0.7)
 *   --output=FILE     Output JSON file (default: synthetic-sessions.json)
 *   --seed=N          Random seed for reproducibility
 */

import fs from 'fs';
import path from 'path';

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_CONFIG = {
  sessions: 10,
  maxInteractions: 20,
  editRatio: 0.7,  // 70% chance of edit, 30% dismiss
  output: 'synthetic-sessions.json',
  seed: null,
};

// Parse command line arguments
function parseArgs() {
  const config = { ...DEFAULT_CONFIG };

  for (const arg of process.argv.slice(2)) {
    const [key, value] = arg.replace(/^--/, '').split('=');
    switch (key) {
      case 'sessions':
        config.sessions = parseInt(value, 10);
        break;
      case 'max-interactions':
        config.maxInteractions = parseInt(value, 10);
        break;
      case 'edit-ratio':
        config.editRatio = parseFloat(value);
        break;
      case 'output':
        config.output = value;
        break;
      case 'seed':
        config.seed = parseInt(value, 10);
        break;
      case 'help':
        console.log(`
Synthetic User Session Generator

Usage:
  node scripts/generate-synthetic-sessions.js [options]

Options:
  --sessions=N          Number of sessions to generate (default: 10)
  --max-interactions=N  Max interactions per session (default: 20)
  --edit-ratio=N        Probability of edit vs dismiss, 0-1 (default: 0.7)
  --output=FILE         Output JSON file (default: synthetic-sessions.json)
  --seed=N              Random seed for reproducibility
  --help                Show this help
`);
        process.exit(0);
    }
  }

  return config;
}

// ============================================================================
// Seeded Random Number Generator
// ============================================================================

class SeededRandom {
  constructor(seed = null) {
    this.seed = seed ?? Date.now();
    this.state = this.seed;
  }

  // Simple LCG random
  next() {
    this.state = (this.state * 1664525 + 1013904223) % 0x100000000;
    return this.state / 0x100000000;
  }

  // Random integer in range [min, max]
  int(min, max) {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  // Random float in range [min, max]
  float(min, max) {
    return this.next() * (max - min) + min;
  }

  // Random choice from array
  choice(arr) {
    return arr[this.int(0, arr.length - 1)];
  }

  // Shuffle array in place
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // Generate UUID
  uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.floor(this.next() * 16);
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
}

// ============================================================================
// Sample Data Corpus
// ============================================================================

const PAPER_TITLES = [
  "Transformer-Based Approaches for Multi-Modal Sentiment Analysis",
  "Efficient Neural Architecture Search with Progressive Distillation",
  "Self-Supervised Learning for Low-Resource Language Understanding",
  "Causal Inference in Deep Reinforcement Learning Environments",
  "Federated Learning with Differential Privacy Guarantees",
  "Graph Neural Networks for Molecular Property Prediction",
  "Attention Mechanisms in Vision-Language Pre-training",
  "Meta-Learning for Few-Shot Text Classification",
  "Robust Adversarial Training with Curriculum Learning",
  "Neural Program Synthesis from Natural Language Specifications",
  "Contrastive Learning for Cross-Lingual Representations",
  "Uncertainty Quantification in Bayesian Neural Networks",
  "Knowledge Distillation for Edge Device Deployment",
  "Multi-Task Learning with Auxiliary Objectives",
  "Zero-Shot Transfer in Domain Adaptation",
];

const CONFERENCES = [
  "NeurIPS 2025",
  "ICML 2025",
  "ICLR 2025",
  "ACL 2025",
  "EMNLP 2025",
  "CVPR 2025",
  "AAAI 2025",
  "IJCAI 2025",
];

// Sample review paragraphs with varying quality levels
// Quality is roughly: 1=vague, 2=somewhat specific, 3=specific, 4=detailed, 5=excellent
const REVIEW_PARAGRAPHS = {
  low_quality: [
    "The paper is not very good. The methodology is unclear and the results are not convincing.",
    "I don't understand the main contribution. More work is needed.",
    "The experiments are insufficient. The paper needs improvement.",
    "This paper lacks novelty. Similar work exists.",
    "The writing quality is poor. Hard to follow the main points.",
    "Results are not significant. The approach seems flawed.",
    "The related work section is incomplete. Missing important references.",
    "Theoretical analysis is weak. Claims are not well supported.",
  ],
  medium_quality: [
    "The paper proposes an interesting approach to the problem, but the experimental validation could be stronger. Consider adding more baselines.",
    "The methodology is mostly clear, though some implementation details are missing. The ablation studies help understand the contribution.",
    "While the results show improvement over baselines, the gains are modest. It would help to analyze where the method succeeds and fails.",
    "The paper addresses a relevant problem in the field. The approach is reasonable but the novelty over prior work could be better articulated.",
    "The writing is generally clear, but some sections are dense. The figures help illustrate the approach.",
    "The experimental setup is appropriate for the claims made. However, testing on additional datasets would strengthen the conclusions.",
    "The related work provides good context, though recent work on similar methods should be discussed.",
    "The theoretical justification is present but could be more rigorous. Some assumptions should be explicitly stated.",
  ],
  high_quality: [
    "The paper presents a well-motivated approach with strong experimental validation across five benchmark datasets. The ablation studies in Table 3 clearly demonstrate the contribution of each component, and the statistical significance tests add credibility to the claims.",
    "The methodology is clearly described with sufficient detail for reproduction. I particularly appreciate the discussion of computational complexity in Section 4.2 and the comparison of runtime across methods in Table 5.",
    "The results are compelling, showing consistent improvement over state-of-the-art methods. The error analysis in Section 5.3 provides valuable insights into the failure modes and suggests promising directions for future work.",
    "The paper makes a clear contribution to the field by addressing the specific limitation of prior methods regarding scalability. The proposed solution is elegant and well-grounded in the theoretical framework developed in Section 3.",
    "The writing is clear and well-organized. The paper effectively uses examples in Section 2 to illustrate the problem and the intuition behind the proposed approach is well-explained in Figure 2.",
    "The experimental methodology is thorough, with appropriate train/validation/test splits, multiple random seeds, and fair comparison to baselines using the same hyperparameter tuning budget.",
    "The related work section provides comprehensive coverage of the literature, clearly positioning this work relative to prior approaches and explaining the key differences that enable the reported improvements.",
    "The theoretical analysis is rigorous with clear statements of assumptions in Section 3.1 and formal proofs in the appendix. The connection between theory and empirical results is well-established.",
  ],
};

// Dimension-specific comment templates
// 4 dimensions: Actionability, Helpfulness, Grounding, Verifiability
const DIMENSION_COMMENTS = {
  Actionability: {
    low: [
      "This feedback is too vague to act on. What specific changes should the author make?",
      "The criticism lacks concrete suggestions. How can this be improved?",
      "No actionable guidance provided. The author cannot improve from this.",
    ],
    medium: [
      "The feedback points to issues but could be more specific about solutions. Consider suggesting concrete next steps.",
      "Some actionable elements present, but the author would benefit from more detailed guidance on how to address the concerns.",
      "Partially actionable - identifies problems but the path to improvement could be clearer.",
    ],
    high: [
      "Excellent actionable feedback with specific suggestions for improvement. The author can immediately act on these points.",
      "Clear, concrete recommendations that directly address the identified issues. Very helpful for revision.",
      "Highly actionable with step-by-step guidance. The author knows exactly what to change.",
    ],
  },
  Helpfulness: {
    low: [
      "This feedback does not help the author understand the issues or how to address them.",
      "The criticism is not constructive. It identifies problems without offering insight.",
      "Not helpful - the author learns little about how to improve their work.",
    ],
    medium: [
      "Moderately helpful feedback that identifies key issues. More depth would increase its value.",
      "Provides useful perspective but could elaborate on the reasoning behind the concerns.",
      "Helpful in parts, though the connection between criticism and improvement path could be clearer.",
    ],
    high: [
      "Exceptionally helpful feedback that thoroughly explains the issues and provides constructive guidance.",
      "Very helpful - combines clear problem identification with supportive suggestions for improvement.",
      "Highly constructive feedback that would genuinely help the author strengthen their work.",
    ],
  },
  Grounding: {
    low: [
      "The feedback lacks grounding in the paper's content. No specific references to support the claims.",
      "Assertions are made without pointing to evidence in the manuscript.",
      "Ungrounded criticism - does not reference specific sections, figures, or results.",
    ],
    medium: [
      "Some grounding in the paper's content, but could reference more specific sections or results.",
      "Partially grounded with references to some elements, though key claims lack supporting citations.",
      "Moderate grounding - mentions the paper's content but could be more precise about locations.",
    ],
    high: [
      "Well-grounded feedback with clear references to specific sections, figures, and experimental results.",
      "Thoroughly grounded in the paper's content with precise citations to support each point.",
      "Excellent grounding - every claim is backed by specific references to the manuscript.",
    ],
  },
  Verifiability: {
    low: [
      "The claims in this feedback cannot be verified from the paper. Subjective assertions without evidence.",
      "Not verifiable - the author cannot check whether these criticisms are accurate.",
      "Unverifiable feedback that relies on unstated assumptions or external knowledge.",
    ],
    medium: [
      "Some claims are verifiable but others require assumptions or external context.",
      "Partially verifiable - the author can check some assertions but not all.",
      "Moderate verifiability - main points can be verified but supporting details are vague.",
    ],
    high: [
      "Highly verifiable feedback where each claim can be checked against the paper's content.",
      "All assertions are verifiable with clear references to specific evidence in the manuscript.",
      "Excellent verifiability - the author can independently confirm every point made.",
    ],
  },
};

const DIMENSIONS = ['Actionability', 'Helpfulness', 'Grounding', 'Verifiability'];

// ============================================================================
// Synthetic Scoring Engine
// ============================================================================

/**
 * Generate a synthetic score based on paragraph text characteristics
 * Simulates AI scoring with some randomness
 * @returns {number} Integer score 1-5
 */
function generateSyntheticScore(text, dimension, rng) {
  // Base score from text quality indicators (start at 3)
  let baseScore = 3;

  const wordCount = text.split(/\s+/).length;
  const hasSpecificRefs = /section|table|figure|equation|line|page/i.test(text);
  const hasNumbers = /\d+/.test(text);
  const hasConcreteSuggestions = /should|could|consider|suggest|recommend|try/i.test(text);
  const isVague = /not good|unclear|insufficient|weak|poor|needs work/i.test(text);
  const isPositive = /excellent|strong|clear|well|thorough|rigorous/i.test(text);

  // Adjust based on text features (probabilistic integer changes)
  if (wordCount > 40 && rng.next() < 0.6) baseScore += 1;
  if (wordCount > 80 && rng.next() < 0.5) baseScore += 1;
  if (hasSpecificRefs && rng.next() < 0.7) baseScore += 1;
  if (hasNumbers && rng.next() < 0.4) baseScore += 1;
  if (hasConcreteSuggestions && rng.next() < 0.6) baseScore += 1;
  if (isVague) baseScore -= 1;
  if (isPositive && rng.next() < 0.5) baseScore += 1;

  // Dimension-specific adjustments
  if (dimension === 'Grounding' && hasSpecificRefs && rng.next() < 0.5) baseScore += 1;
  if (dimension === 'Actionability' && hasConcreteSuggestions && rng.next() < 0.5) baseScore += 1;
  if (dimension === 'Verifiability' && /because|since|therefore|thus|evidence|shows|demonstrates/i.test(text) && rng.next() < 0.5) baseScore += 1;

  // Add small random adjustment
  baseScore += rng.int(-1, 1);

  // Clamp to integer 1-5
  return Math.max(1, Math.min(5, baseScore));
}

/**
 * Generate AI comment for a given score and dimension
 */
function generateComment(dimension, score, rng) {
  const level = score <= 2 ? 'low' : score <= 3 ? 'medium' : 'high';
  return rng.choice(DIMENSION_COMMENTS[dimension][level]);
}

/**
 * Simulate an edit that improves the paragraph
 * Returns the new text (improvement is general, not dimension-specific since edit affects all dimensions)
 */
function simulateEdit(originalText, rng) {
  const improvements = [
    " Consider adding specific implementation details.",
    " I suggest restructuring this section for clarity.",
    " The authors should include a comparison with baseline X.",
    " Adding error bars to Figure 3 would strengthen the claims.",
    " This insight could help the authors better position their contribution.",
    " Understanding this limitation will guide future iterations.",
    " Specifically, Section 4.2 lines 15-20 need clarification.",
    " Table 3 row 2 shows an anomaly that should be explained.",
    " The claim in paragraph 3 of Section 5 lacks evidence.",
    " This matters because it affects reproducibility.",
    " The theoretical grounding in Section 3 supports this concern.",
    " Prior work by Smith et al. (2023) demonstrates why this is important.",
    " Overall, the paper makes a solid contribution despite these issues.",
    " With these revisions, the paper would be a strong contribution.",
    " See the experimental results in Table 2 for supporting evidence.",
    " As noted in the methodology section, this approach is well-justified.",
  ];

  // Append an improvement
  const addition = rng.choice(improvements);
  return originalText + addition;
}

// ============================================================================
// Session Generation
// ============================================================================

/**
 * Generate a complete review with paragraphs
 */
function generateReview(rng) {
  // Mix quality levels
  const paragraphs = [];
  const numParagraphs = rng.int(3, 8);

  for (let i = 0; i < numParagraphs; i++) {
    const qualityRoll = rng.next();
    let pool;
    if (qualityRoll < 0.3) {
      pool = REVIEW_PARAGRAPHS.low_quality;
    } else if (qualityRoll < 0.7) {
      pool = REVIEW_PARAGRAPHS.medium_quality;
    } else {
      pool = REVIEW_PARAGRAPHS.high_quality;
    }
    paragraphs.push(rng.choice(pool));
  }

  return paragraphs;
}

/**
 * Generate scores for all paragraphs and dimensions
 */
function scoreReview(paragraphs, rng) {
  const scores = [];

  for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
    const text = paragraphs[pIdx];
    const paragraphScores = {};

    for (const dim of DIMENSIONS) {
      const score = generateSyntheticScore(text, dim, rng);
      paragraphScores[dim] = {
        score,
        comment: generateComment(dim, score, rng),
      };
    }

    scores.push({
      paragraph_id: pIdx,
      scores: paragraphScores,
    });
  }

  return scores;
}

/**
 * Find paragraphs with scores below 5
 */
function findImprovableParagraphs(scores) {
  const improvable = [];

  for (const { paragraph_id, scores: dimScores } of scores) {
    for (const [dim, { score }] of Object.entries(dimScores)) {
      if (score < 5) {
        improvable.push({ paragraph_id, dimension: dim, score });
      }
    }
  }

  return improvable;
}

/**
 * Generate a single user session
 */
function generateSession(sessionId, config, rng) {
  const session = {
    id: rng.uuid(),
    created_at: new Date().toISOString(),
    paper: {
      id: rng.uuid(),
      title: rng.choice(PAPER_TITLES),
      conference: rng.choice(CONFERENCES),
    },
    review: {
      id: rng.uuid(),
      versions: [],
      interactions: [],
    },
  };

  // Initial review submission
  let paragraphs = generateReview(rng);
  let scores = scoreReview(paragraphs, rng);
  let version = 1;

  session.review.versions.push({
    version,
    paragraphs: paragraphs.map((text, idx) => ({
      paragraph_id: idx,
      content: text,
    })),
    scores: scores.map(s => ({
      paragraph_id: s.paragraph_id,
      ...s.scores,
    })),
    created_at: new Date().toISOString(),
  });

  // Interaction loop
  // Track which dimension-specific comments have been dismissed
  const dismissed = new Set(); // "paragraph_id:dimension"
  let interactionCount = 0;

  while (interactionCount < config.maxInteractions) {
    // Find paragraphs with improvable dimensions (score < 5, not dismissed)
    const improvable = findImprovableParagraphs(scores).filter(
      ({ paragraph_id, dimension }) => !dismissed.has(`${paragraph_id}:${dimension}`)
    );

    if (improvable.length === 0) {
      // All scores are 5 or dismissed - session complete
      break;
    }

    // Group improvable items by paragraph
    const byParagraph = new Map();
    for (const item of improvable) {
      if (!byParagraph.has(item.paragraph_id)) {
        byParagraph.set(item.paragraph_id, []);
      }
      byParagraph.get(item.paragraph_id).push(item);
    }

    // Pick a random paragraph to interact with
    const paragraphIds = [...byParagraph.keys()];
    const targetParagraphId = rng.choice(paragraphIds);
    const targetDimensions = byParagraph.get(targetParagraphId);
    interactionCount++;

    // Record view interaction (paragraph-level - user opens comment bar)
    session.review.interactions.push({
      type: 'view',
      paragraph_id: targetParagraphId,
      version,
      timestamp: new Date(Date.now() + interactionCount * 30000).toISOString(),
    });

    // Decide action: edit only, dismiss only, or both
    // Action probabilities: ~50% edit only, ~25% dismiss only, ~25% edit+dismiss
    const actionRoll = rng.next();
    const willEdit = actionRoll < 0.75; // 75% chance of editing
    const willDismiss = actionRoll >= 0.5 || rng.next() < 0.3; // ~50% chance of dismissing

    // Handle dismissals (can dismiss 0 to all available dimensions)
    if (willDismiss && targetDimensions.length > 0) {
      // Decide how many dimensions to dismiss (1 to all available, weighted toward fewer)
      const maxDismissals = targetDimensions.length;
      let numDismissals;
      const dismissRoll = rng.next();
      if (dismissRoll < 0.5) {
        numDismissals = 1; // 50% chance of dismissing just 1
      } else if (dismissRoll < 0.8) {
        numDismissals = Math.min(2, maxDismissals); // 30% chance of 2
      } else if (dismissRoll < 0.95) {
        numDismissals = Math.min(3, maxDismissals); // 15% chance of 3
      } else {
        numDismissals = maxDismissals; // 5% chance of all
      }

      // Pick which dimensions to dismiss
      const shuffled = rng.shuffle([...targetDimensions]);
      const toDismiss = shuffled.slice(0, numDismissals);

      for (const target of toDismiss) {
        session.review.interactions.push({
          type: 'dismiss',
          paragraph_id: target.paragraph_id,
          dimension: target.dimension,
          version,
          timestamp: new Date(Date.now() + interactionCount * 30000 + 5000).toISOString(),
        });

        // Track dismissal so we don't re-target this dimension
        dismissed.add(`${target.paragraph_id}:${target.dimension}`);
      }
    }

    // Handle edit
    if (willEdit) {
      // Edit the paragraph (creates new version, all dimensions re-scored)
      const originalText = paragraphs[targetParagraphId];
      const editedText = simulateEdit(originalText, rng);
      paragraphs[targetParagraphId] = editedText;

      // Re-score (scores tend to improve after edits)
      version++;
      scores = scoreReview(paragraphs, rng);

      // Bias scores upward for edited paragraphs
      const editedScores = scores[targetParagraphId].scores;
      for (const dim of DIMENSIONS) {
        if (rng.next() < 0.7) { // 70% chance of improvement
          editedScores[dim].score = Math.min(5, editedScores[dim].score + rng.int(0, 2));
          editedScores[dim].comment = generateComment(dim, editedScores[dim].score, rng);
        }
      }

      const fromVersion = version - 1;

      session.review.versions.push({
        version,
        paragraphs: paragraphs.map((text, idx) => ({
          paragraph_id: idx,
          content: text,
        })),
        scores: scores.map(s => ({
          paragraph_id: s.paragraph_id,
          ...s.scores,
        })),
        created_at: new Date(Date.now() + interactionCount * 60000).toISOString(),
      });

      // Record edit interaction (paragraph-level, creates new version)
      session.review.interactions.push({
        type: 'edit',
        paragraph_id: targetParagraphId,
        from_version: fromVersion,
        to_version: version,
        timestamp: new Date(Date.now() + interactionCount * 60000).toISOString(),
      });
    }
  }

  // Summary stats
  // A session is "complete" if all paragraph/dimension pairs are either score=5 or dismissed
  const remainingImprovable = findImprovableParagraphs(scores).filter(
    ({ paragraph_id, dimension }) => !dismissed.has(`${paragraph_id}:${dimension}`)
  );

  session.stats = {
    total_interactions: session.review.interactions.length,
    total_versions: session.review.versions.length,
    edits: session.review.interactions.filter(i => i.type === 'edit').length,
    dismissals: session.review.interactions.filter(i => i.type === 'dismiss').length,
    views: session.review.interactions.filter(i => i.type === 'view').length,
    final_scores: scores.flatMap(s =>
      Object.values(s.scores).map(d => d.score)
    ),
    completed: remainingImprovable.length === 0,
  };

  return session;
}

// ============================================================================
// Main
// ============================================================================

function main() {
  const config = parseArgs();
  const rng = new SeededRandom(config.seed);

  console.log('Generating synthetic sessions...');
  console.log(`  Sessions: ${config.sessions}`);
  console.log(`  Max interactions: ${config.maxInteractions}`);
  console.log(`  Edit ratio: ${config.editRatio}`);
  console.log(`  Seed: ${rng.seed}`);
  console.log();

  const sessions = [];

  for (let i = 0; i < config.sessions; i++) {
    const session = generateSession(i, config, rng);
    sessions.push(session);

    const { stats } = session;
    console.log(`Session ${i + 1}: ${stats.total_versions} versions, ` +
      `${stats.edits} edits, ${stats.dismissals} dismissals, ` +
      `${stats.completed ? 'completed' : 'max interactions'}`);
  }

  // Aggregate statistics
  const totalInteractions = sessions.reduce((sum, s) => sum + s.stats.total_interactions, 0);
  const totalEdits = sessions.reduce((sum, s) => sum + s.stats.edits, 0);
  const totalDismissals = sessions.reduce((sum, s) => sum + s.stats.dismissals, 0);
  const completed = sessions.filter(s => s.stats.completed).length;

  console.log();
  console.log('Summary:');
  console.log(`  Total interactions: ${totalInteractions}`);
  console.log(`  Total edits: ${totalEdits} (${(totalEdits / totalInteractions * 100).toFixed(1)}%)`);
  console.log(`  Total dismissals: ${totalDismissals} (${(totalDismissals / totalInteractions * 100).toFixed(1)}%)`);
  console.log(`  Sessions reaching all 5s: ${completed}/${config.sessions}`);

  // Output
  const output = {
    metadata: {
      generated_at: new Date().toISOString(),
      config,
      seed: rng.seed,
      summary: {
        total_sessions: sessions.length,
        total_interactions: totalInteractions,
        total_edits: totalEdits,
        total_dismissals: totalDismissals,
        completed_sessions: completed,
      },
    },
    sessions,
  };

  const outputPath = path.resolve(config.output);
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log();
  console.log(`Output written to: ${outputPath}`);
}

main();
