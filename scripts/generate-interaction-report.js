#!/usr/bin/env node

/**
 * Generate Interaction Report
 *
 * Analyzes session data (synthetic or real) to produce interaction metrics.
 *
 * Usage:
 *   node scripts/generate-interaction-report.js [options]
 *
 * Options:
 *   --input=FILE      Input JSON file (default: synthetic-sessions.json)
 *   --output=FILE     Output file for detailed report (optional)
 *   --format=FORMAT   Output format: console, json, csv (default: console)
 */

import fs from 'fs';
import path from 'path';

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_CONFIG = {
  input: 'synthetic-sessions.json',
  output: null,
  format: 'console',
};

const DIMENSIONS = ['Actionability', 'Helpfulness', 'Grounding', 'Verifiability'];

function parseArgs() {
  const config = { ...DEFAULT_CONFIG };

  for (const arg of process.argv.slice(2)) {
    const [key, value] = arg.replace(/^--/, '').split('=');
    switch (key) {
      case 'input':
        config.input = value;
        break;
      case 'output':
        config.output = value;
        break;
      case 'format':
        if (['console', 'json', 'csv'].includes(value)) {
          config.format = value;
        }
        break;
      case 'help':
        console.log(`
Generate Interaction Report

Analyzes session data to produce interaction metrics.

Usage:
  node scripts/generate-interaction-report.js [options]

Options:
  --input=FILE      Input JSON file (default: synthetic-sessions.json)
  --output=FILE     Output file for detailed report (optional)
  --format=FORMAT   Output format: console, json, csv (default: console)
  --help            Show this help
`);
        process.exit(0);
    }
  }

  return config;
}

// ============================================================================
// Analysis Functions
// ============================================================================

/**
 * Calculate overall session statistics
 */
function calculateSessionStats(sessions) {
  const stats = {
    total_sessions: sessions.length,
    completed_sessions: 0,
    total_paragraphs: 0,
    total_versions: 0,
    total_interactions: 0,
    sessions_with_interactions: 0,
  };

  for (const session of sessions) {
    const review = session.review;
    const versions = review.versions || [];
    const interactions = review.interactions || [];

    if (versions.length > 0) {
      stats.total_paragraphs += versions[0].paragraphs?.length || 0;
    }
    stats.total_versions += versions.length;
    stats.total_interactions += interactions.length;

    if (interactions.length > 0) {
      stats.sessions_with_interactions++;
    }

    // A session is "completed" if all final scores are 5
    if (session.stats?.completed) {
      stats.completed_sessions++;
    }
  }

  stats.avg_versions_per_session = stats.total_sessions > 0
    ? (stats.total_versions / stats.total_sessions).toFixed(2)
    : 0;
  stats.avg_interactions_per_session = stats.total_sessions > 0
    ? (stats.total_interactions / stats.total_sessions).toFixed(2)
    : 0;

  return stats;
}

/**
 * Calculate interaction type breakdown
 */
function calculateInteractionBreakdown(sessions) {
  const breakdown = {
    views: 0,
    edits: 0,
    dismissals: 0,
    by_dimension: {},
  };

  // Initialize dimension counts
  for (const dim of DIMENSIONS) {
    breakdown.by_dimension[dim] = { dismissals: 0 };
  }

  for (const session of sessions) {
    const interactions = session.review?.interactions || [];

    for (const interaction of interactions) {
      switch (interaction.type) {
        case 'view':
          breakdown.views++;
          break;
        case 'edit':
          breakdown.edits++;
          break;
        case 'dismiss':
          breakdown.dismissals++;
          if (interaction.dimension && breakdown.by_dimension[interaction.dimension]) {
            breakdown.by_dimension[interaction.dimension].dismissals++;
          }
          break;
      }
    }
  }

  const total = breakdown.views + breakdown.edits + breakdown.dismissals;
  breakdown.view_rate = total > 0 ? (breakdown.views / total * 100).toFixed(1) : '0.0';
  breakdown.edit_rate = total > 0 ? (breakdown.edits / total * 100).toFixed(1) : '0.0';
  breakdown.dismiss_rate = total > 0 ? (breakdown.dismissals / total * 100).toFixed(1) : '0.0';

  return breakdown;
}

/**
 * Analyze what happens after viewing a comment
 */
function calculatePostViewBehavior(sessions) {
  const behavior = {
    view_then_edit: 0,
    view_then_dismiss: 0,
    view_only: 0,
    total_views: 0,
  };

  for (const session of sessions) {
    const interactions = session.review?.interactions || [];

    // Find all view interactions and what follows them
    for (let i = 0; i < interactions.length; i++) {
      const current = interactions[i];
      if (current.type !== 'view') continue;

      behavior.total_views++;

      // Look for next interaction on same paragraph
      let foundFollowUp = false;
      for (let j = i + 1; j < interactions.length; j++) {
        const next = interactions[j];
        if (next.paragraph_id === current.paragraph_id) {
          if (next.type === 'edit') {
            behavior.view_then_edit++;
            foundFollowUp = true;
            break;
          } else if (next.type === 'dismiss') {
            behavior.view_then_dismiss++;
            foundFollowUp = true;
            break;
          }
        }
      }

      if (!foundFollowUp) {
        behavior.view_only++;
      }
    }
  }

  behavior.edit_after_view_rate = behavior.total_views > 0
    ? (behavior.view_then_edit / behavior.total_views * 100).toFixed(1)
    : '0.0';
  behavior.dismiss_after_view_rate = behavior.total_views > 0
    ? (behavior.view_then_dismiss / behavior.total_views * 100).toFixed(1)
    : '0.0';
  behavior.no_action_rate = behavior.total_views > 0
    ? (behavior.view_only / behavior.total_views * 100).toFixed(1)
    : '0.0';

  return behavior;
}

/**
 * Analyze score changes after edits
 */
function calculateScoreImprovements(sessions) {
  const improvements = {
    total_edits_with_scores: 0,
    improved: 0,
    unchanged: 0,
    worsened: 0,
    by_dimension: {},
    by_initial_score: { 1: { improved: 0, total: 0 }, 2: { improved: 0, total: 0 }, 3: { improved: 0, total: 0 }, 4: { improved: 0, total: 0 } },
  };

  for (const dim of DIMENSIONS) {
    improvements.by_dimension[dim] = { improved: 0, unchanged: 0, worsened: 0, total: 0 };
  }

  for (const session of sessions) {
    const versions = session.review?.versions || [];
    const interactions = session.review?.interactions || [];

    // Find edit interactions
    const edits = interactions.filter(i => i.type === 'edit');

    for (const edit of edits) {
      const fromVersion = versions.find(v => v.version === edit.from_version);
      const toVersion = versions.find(v => v.version === edit.to_version);

      if (!fromVersion || !toVersion) continue;

      const fromScores = fromVersion.scores?.find(s => s.paragraph_id === edit.paragraph_id);
      const toScores = toVersion.scores?.find(s => s.paragraph_id === edit.paragraph_id);

      if (!fromScores || !toScores) continue;

      // Compare scores for each dimension
      for (const dim of DIMENSIONS) {
        const fromScore = fromScores[dim]?.score;
        const toScore = toScores[dim]?.score;

        if (fromScore == null || toScore == null) continue;

        improvements.total_edits_with_scores++;
        improvements.by_dimension[dim].total++;

        if (toScore > fromScore) {
          improvements.improved++;
          improvements.by_dimension[dim].improved++;
          if (fromScore >= 1 && fromScore <= 4) {
            improvements.by_initial_score[fromScore].improved++;
            improvements.by_initial_score[fromScore].total++;
          }
        } else if (toScore < fromScore) {
          improvements.worsened++;
          improvements.by_dimension[dim].worsened++;
          if (fromScore >= 1 && fromScore <= 4) {
            improvements.by_initial_score[fromScore].total++;
          }
        } else {
          improvements.unchanged++;
          improvements.by_dimension[dim].unchanged++;
          if (fromScore >= 1 && fromScore <= 4) {
            improvements.by_initial_score[fromScore].total++;
          }
        }
      }
    }
  }

  improvements.improvement_rate = improvements.total_edits_with_scores > 0
    ? (improvements.improved / improvements.total_edits_with_scores * 100).toFixed(1)
    : '0.0';

  return improvements;
}

/**
 * Calculate edit count distribution
 */
function calculateEditDistribution(sessions) {
  const distribution = {
    sessions_by_edit_count: {},
    paragraphs_by_edit_count: {},
  };

  for (const session of sessions) {
    const interactions = session.review?.interactions || [];
    const edits = interactions.filter(i => i.type === 'edit');

    // Count by session
    const editCount = edits.length;
    const bucket = editCount >= 10 ? '10+' : String(editCount);
    distribution.sessions_by_edit_count[bucket] = (distribution.sessions_by_edit_count[bucket] || 0) + 1;

    // Count edits per paragraph
    const paragraphEdits = {};
    for (const edit of edits) {
      paragraphEdits[edit.paragraph_id] = (paragraphEdits[edit.paragraph_id] || 0) + 1;
    }

    for (const count of Object.values(paragraphEdits)) {
      const pBucket = count >= 5 ? '5+' : String(count);
      distribution.paragraphs_by_edit_count[pBucket] = (distribution.paragraphs_by_edit_count[pBucket] || 0) + 1;
    }
  }

  return distribution;
}

/**
 * Analyze final score distribution
 */
function calculateFinalScoreDistribution(sessions) {
  const distribution = {
    by_score: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    by_dimension: {},
    total_scores: 0,
  };

  for (const dim of DIMENSIONS) {
    distribution.by_dimension[dim] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, total: 0 };
  }

  for (const session of sessions) {
    const versions = session.review?.versions || [];
    if (versions.length === 0) continue;

    const finalVersion = versions[versions.length - 1];
    const scores = finalVersion.scores || [];

    for (const paragraphScores of scores) {
      for (const dim of DIMENSIONS) {
        const score = paragraphScores[dim]?.score;
        if (score != null && score >= 1 && score <= 5) {
          distribution.by_score[score]++;
          distribution.by_dimension[dim][score]++;
          distribution.by_dimension[dim].total++;
          distribution.total_scores++;
        }
      }
    }
  }

  // Calculate percentages
  distribution.perfect_score_rate = distribution.total_scores > 0
    ? (distribution.by_score[5] / distribution.total_scores * 100).toFixed(1)
    : '0.0';

  return distribution;
}

// ============================================================================
// Output Formatting
// ============================================================================

function formatConsoleReport(report) {
  const lines = [];
  const hr = '═'.repeat(60);

  lines.push('');
  lines.push(hr);
  lines.push('  INTERACTION REPORT');
  lines.push(hr);
  lines.push('');

  // Session Stats
  lines.push('SESSION STATISTICS');
  lines.push('─'.repeat(40));
  lines.push(`  Total sessions:       ${report.session_stats.total_sessions}`);
  lines.push(`  Completed sessions:   ${report.session_stats.completed_sessions}`);
  lines.push(`  Total paragraphs:     ${report.session_stats.total_paragraphs}`);
  lines.push(`  Avg versions/session: ${report.session_stats.avg_versions_per_session}`);
  lines.push(`  Avg interactions:     ${report.session_stats.avg_interactions_per_session}`);
  lines.push('');

  // Interaction Breakdown
  lines.push('INTERACTION BREAKDOWN');
  lines.push('─'.repeat(40));
  lines.push(`  Views:      ${report.interaction_breakdown.views} (${report.interaction_breakdown.view_rate}%)`);
  lines.push(`  Edits:      ${report.interaction_breakdown.edits} (${report.interaction_breakdown.edit_rate}%)`);
  lines.push(`  Dismissals: ${report.interaction_breakdown.dismissals} (${report.interaction_breakdown.dismiss_rate}%)`);
  lines.push('');
  lines.push('  Dismissals by dimension:');
  for (const dim of DIMENSIONS) {
    const count = report.interaction_breakdown.by_dimension[dim]?.dismissals || 0;
    lines.push(`    ${dim}: ${count}`);
  }
  lines.push('');

  // Post-View Behavior
  lines.push('POST-VIEW BEHAVIOR');
  lines.push('─'.repeat(40));
  lines.push(`  After viewing a comment:`);
  lines.push(`    → Edit:    ${report.post_view_behavior.view_then_edit} (${report.post_view_behavior.edit_after_view_rate}%)`);
  lines.push(`    → Dismiss: ${report.post_view_behavior.view_then_dismiss} (${report.post_view_behavior.dismiss_after_view_rate}%)`);
  lines.push(`    → Nothing: ${report.post_view_behavior.view_only} (${report.post_view_behavior.no_action_rate}%)`);
  lines.push('');

  // Score Improvements
  lines.push('SCORE CHANGES AFTER EDIT');
  lines.push('─'.repeat(40));
  lines.push(`  Total dimension-edits: ${report.score_improvements.total_edits_with_scores}`);
  lines.push(`    Improved:  ${report.score_improvements.improved} (${report.score_improvements.improvement_rate}%)`);
  lines.push(`    Unchanged: ${report.score_improvements.unchanged}`);
  lines.push(`    Worsened:  ${report.score_improvements.worsened}`);
  lines.push('');
  lines.push('  Improvement rate by initial score:');
  for (let score = 1; score <= 4; score++) {
    const data = report.score_improvements.by_initial_score[score];
    const rate = data.total > 0 ? (data.improved / data.total * 100).toFixed(1) : '0.0';
    lines.push(`    Score ${score} → improved: ${data.improved}/${data.total} (${rate}%)`);
  }
  lines.push('');

  // Edit Distribution
  lines.push('EDIT DISTRIBUTION');
  lines.push('─'.repeat(40));
  lines.push('  Edits per session:');
  const sessionBuckets = Object.keys(report.edit_distribution.sessions_by_edit_count).sort((a, b) => {
    if (a === '10+') return 1;
    if (b === '10+') return -1;
    return parseInt(a) - parseInt(b);
  });
  for (const bucket of sessionBuckets) {
    lines.push(`    ${bucket}: ${report.edit_distribution.sessions_by_edit_count[bucket]} sessions`);
  }
  lines.push('');

  // Final Score Distribution
  lines.push('FINAL SCORE DISTRIBUTION');
  lines.push('─'.repeat(40));
  lines.push(`  Perfect score rate (5): ${report.final_score_distribution.perfect_score_rate}%`);
  lines.push('');
  lines.push('  Overall distribution:');
  for (let score = 1; score <= 5; score++) {
    const count = report.final_score_distribution.by_score[score];
    const pct = report.final_score_distribution.total_scores > 0
      ? (count / report.final_score_distribution.total_scores * 100).toFixed(1)
      : '0.0';
    lines.push(`    Score ${score}: ${count} (${pct}%)`);
  }
  lines.push('');

  lines.push(hr);
  lines.push('');

  return lines.join('\n');
}

function formatCSVReport(report) {
  const lines = [];

  // Header section
  lines.push('Section,Metric,Value');
  lines.push('');

  // Session Stats
  lines.push(`Session Stats,Total Sessions,${report.session_stats.total_sessions}`);
  lines.push(`Session Stats,Completed Sessions,${report.session_stats.completed_sessions}`);
  lines.push(`Session Stats,Total Paragraphs,${report.session_stats.total_paragraphs}`);
  lines.push(`Session Stats,Avg Versions/Session,${report.session_stats.avg_versions_per_session}`);
  lines.push(`Session Stats,Avg Interactions/Session,${report.session_stats.avg_interactions_per_session}`);

  // Interaction Breakdown
  lines.push(`Interactions,Views,${report.interaction_breakdown.views}`);
  lines.push(`Interactions,Edits,${report.interaction_breakdown.edits}`);
  lines.push(`Interactions,Dismissals,${report.interaction_breakdown.dismissals}`);
  lines.push(`Interactions,View Rate %,${report.interaction_breakdown.view_rate}`);
  lines.push(`Interactions,Edit Rate %,${report.interaction_breakdown.edit_rate}`);
  lines.push(`Interactions,Dismiss Rate %,${report.interaction_breakdown.dismiss_rate}`);

  // Post-View Behavior
  lines.push(`Post-View,Edit After View,${report.post_view_behavior.view_then_edit}`);
  lines.push(`Post-View,Dismiss After View,${report.post_view_behavior.view_then_dismiss}`);
  lines.push(`Post-View,No Action After View,${report.post_view_behavior.view_only}`);
  lines.push(`Post-View,Edit After View %,${report.post_view_behavior.edit_after_view_rate}`);

  // Score Improvements
  lines.push(`Score Changes,Total Edits,${report.score_improvements.total_edits_with_scores}`);
  lines.push(`Score Changes,Improved,${report.score_improvements.improved}`);
  lines.push(`Score Changes,Unchanged,${report.score_improvements.unchanged}`);
  lines.push(`Score Changes,Worsened,${report.score_improvements.worsened}`);
  lines.push(`Score Changes,Improvement Rate %,${report.score_improvements.improvement_rate}`);

  // Final Scores
  for (let score = 1; score <= 5; score++) {
    lines.push(`Final Scores,Score ${score},${report.final_score_distribution.by_score[score]}`);
  }
  lines.push(`Final Scores,Perfect Score Rate %,${report.final_score_distribution.perfect_score_rate}`);

  return lines.join('\n');
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const config = parseArgs();

  // Read input file
  const inputPath = path.resolve(config.input);
  if (!fs.existsSync(inputPath)) {
    console.error(`Error: Input file not found: ${inputPath}`);
    console.error('');
    console.error('Generate synthetic data first:');
    console.error('  npm run generate:sessions');
    console.error('');
    console.error('Or export from database:');
    console.error('  npm run export:sessions');
    process.exit(1);
  }

  console.log(`Reading: ${inputPath}`);
  const data = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
  const sessions = data.sessions || [];

  if (sessions.length === 0) {
    console.error('Error: No sessions found in input file');
    process.exit(1);
  }

  console.log(`Analyzing ${sessions.length} sessions...`);

  // Generate report
  const report = {
    metadata: {
      source_file: config.input,
      source_type: data.metadata?.source || 'unknown',
      generated_at: new Date().toISOString(),
      session_count: sessions.length,
    },
    session_stats: calculateSessionStats(sessions),
    interaction_breakdown: calculateInteractionBreakdown(sessions),
    post_view_behavior: calculatePostViewBehavior(sessions),
    score_improvements: calculateScoreImprovements(sessions),
    edit_distribution: calculateEditDistribution(sessions),
    final_score_distribution: calculateFinalScoreDistribution(sessions),
  };

  // Output report
  let output;
  switch (config.format) {
    case 'json':
      output = JSON.stringify(report, null, 2);
      break;
    case 'csv':
      output = formatCSVReport(report);
      break;
    case 'console':
    default:
      output = formatConsoleReport(report);
      break;
  }

  if (config.output) {
    const outputPath = path.resolve(config.output);
    fs.writeFileSync(outputPath, output);
    console.log(`Report written to: ${outputPath}`);
  } else {
    console.log(output);
  }
}

main();
