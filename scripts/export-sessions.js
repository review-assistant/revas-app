#!/usr/bin/env node

/**
 * Export Database Sessions to JSON
 *
 * Exports real user sessions from Supabase into the same JSON format
 * as the synthetic session generator. This allows the interaction report
 * to work with both synthetic and real data.
 *
 * Usage:
 *   node scripts/export-sessions.js [options]
 *
 * Options:
 *   --output=FILE     Output JSON file (default: exported-sessions.json)
 *   --anonymize       Anonymize user IDs (default: true)
 *
 * Requires:
 *   - VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env
 *   - Or SUPABASE_SERVICE_ROLE_KEY for full access
 */

import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

// Load environment variables
config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Error: Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/VITE_SUPABASE_ANON_KEY');
  console.error('Make sure your .env file is configured correctly.');
  process.exit(1);
}

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_CONFIG = {
  output: 'exported-sessions.json',
  anonymize: true,
};

function parseArgs() {
  const config = { ...DEFAULT_CONFIG };

  for (const arg of process.argv.slice(2)) {
    const [key, value] = arg.replace(/^--/, '').split('=');
    switch (key) {
      case 'output':
        config.output = value;
        break;
      case 'anonymize':
        config.anonymize = value !== 'false';
        break;
      case 'help':
        console.log(`
Export Database Sessions to JSON

Usage:
  node scripts/export-sessions.js [options]

Options:
  --output=FILE     Output JSON file (default: exported-sessions.json)
  --anonymize=BOOL  Anonymize user IDs (default: true)
  --help            Show this help
`);
        process.exit(0);
    }
  }

  return config;
}

// ============================================================================
// Database Queries
// ============================================================================

async function fetchAllData(supabase) {
  console.log('Fetching data from database...');

  // Fetch papers
  const { data: papers, error: papersError } = await supabase
    .from('papers')
    .select('id, title, conference_or_journal, created_at');

  if (papersError) throw new Error(`Failed to fetch papers: ${papersError.message}`);
  console.log(`  Papers: ${papers.length}`);

  // Fetch reviews with decrypted draft content
  const { data: reviews, error: reviewsError } = await supabase
    .from('reviews')
    .select('id, paper_id, reviewer_user_id, is_locked, created_at, updated_at');

  if (reviewsError) throw new Error(`Failed to fetch reviews: ${reviewsError.message}`);
  console.log(`  Reviews: ${reviews.length}`);

  // Fetch review items with scores and interactions
  const { data: reviewItems, error: itemsError } = await supabase
    .from('review_items')
    .select(`
      id,
      review_id,
      paragraph_id,
      version,
      is_deleted,
      created_at,
      updated_at,
      review_item_scores (
        dimension,
        score,
        created_at
      ),
      review_item_interactions (
        dimension,
        comment_viewed,
        comment_viewed_at,
        comment_dismissed,
        comment_dismissed_at
      )
    `)
    .order('review_id')
    .order('paragraph_id')
    .order('version');

  if (itemsError) throw new Error(`Failed to fetch review items: ${itemsError.message}`);
  console.log(`  Review items: ${reviewItems.length}`);

  return { papers, reviews, reviewItems };
}

// ============================================================================
// Data Transformation
// ============================================================================

/**
 * Create anonymized user ID mapping
 */
function createUserIdMap(reviews) {
  const userIds = [...new Set(reviews.map(r => r.reviewer_user_id))];
  const map = new Map();
  userIds.forEach((id, idx) => {
    map.set(id, `user-${String(idx + 1).padStart(4, '0')}`);
  });
  return map;
}

/**
 * Transform database data into session format
 */
function transformToSessions(data, config) {
  const { papers, reviews, reviewItems } = data;

  // Create lookup maps
  const paperMap = new Map(papers.map(p => [p.id, p]));
  const userIdMap = config.anonymize ? createUserIdMap(reviews) : null;

  // Group review items by review
  const itemsByReview = new Map();
  for (const item of reviewItems) {
    if (!itemsByReview.has(item.review_id)) {
      itemsByReview.set(item.review_id, []);
    }
    itemsByReview.get(item.review_id).push(item);
  }

  const sessions = [];

  for (const review of reviews) {
    const paper = paperMap.get(review.paper_id);
    if (!paper) continue;

    const items = itemsByReview.get(review.id) || [];
    if (items.length === 0) continue;

    // Group items by version to create version snapshots
    const itemsByVersion = new Map();
    for (const item of items) {
      if (!itemsByVersion.has(item.version)) {
        itemsByVersion.set(item.version, []);
      }
      itemsByVersion.get(item.version).push(item);
    }

    // Build versions array
    const versions = [];
    const sortedVersionNums = [...itemsByVersion.keys()].sort((a, b) => a - b);

    for (const versionNum of sortedVersionNums) {
      const versionItems = itemsByVersion.get(versionNum);

      // Get paragraphs for this version
      const paragraphs = versionItems
        .filter(item => !item.is_deleted)
        .map(item => ({
          paragraph_id: item.paragraph_id,
          content: null, // Content is encrypted, we'd need decrypt_text() RPC
        }))
        .sort((a, b) => a.paragraph_id - b.paragraph_id);

      // Get scores for this version
      const scores = versionItems
        .filter(item => !item.is_deleted && item.review_item_scores?.length > 0)
        .map(item => {
          const scoreObj = { paragraph_id: item.paragraph_id };
          for (const score of item.review_item_scores) {
            scoreObj[score.dimension] = {
              score: score.score,
              comment: null, // Comment is encrypted
            };
          }
          return scoreObj;
        })
        .sort((a, b) => a.paragraph_id - b.paragraph_id);

      // Find earliest created_at for this version
      const versionCreatedAt = versionItems
        .map(item => new Date(item.created_at))
        .sort((a, b) => a - b)[0];

      versions.push({
        version: versionNum,
        paragraphs,
        scores,
        created_at: versionCreatedAt?.toISOString() || null,
      });
    }

    // Build interactions array from interaction records
    const interactions = [];

    for (const item of items) {
      if (!item.review_item_interactions) continue;

      for (const interaction of item.review_item_interactions) {
        // View interaction
        if (interaction.comment_viewed && interaction.comment_viewed_at) {
          interactions.push({
            type: 'view',
            paragraph_id: item.paragraph_id,
            version: item.version,
            timestamp: interaction.comment_viewed_at,
          });
        }

        // Dismiss interaction
        if (interaction.comment_dismissed && interaction.comment_dismissed_at) {
          interactions.push({
            type: 'dismiss',
            paragraph_id: item.paragraph_id,
            dimension: interaction.dimension,
            version: item.version,
            timestamp: interaction.comment_dismissed_at,
          });
        }
      }
    }

    // Infer edit interactions from version creation (version > 1 means an edit occurred)
    for (let i = 1; i < sortedVersionNums.length; i++) {
      const fromVersion = sortedVersionNums[i - 1];
      const toVersion = sortedVersionNums[i];
      const toItems = itemsByVersion.get(toVersion);

      // Find which paragraphs changed in this version
      const changedParagraphs = new Set(toItems.map(item => item.paragraph_id));

      for (const paragraphId of changedParagraphs) {
        const item = toItems.find(i => i.paragraph_id === paragraphId);
        if (item) {
          interactions.push({
            type: 'edit',
            paragraph_id: paragraphId,
            from_version: fromVersion,
            to_version: toVersion,
            timestamp: item.created_at,
          });
        }
      }
    }

    // Sort interactions by timestamp
    interactions.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    // Calculate stats
    const stats = {
      total_interactions: interactions.length,
      total_versions: versions.length,
      edits: interactions.filter(i => i.type === 'edit').length,
      dismissals: interactions.filter(i => i.type === 'dismiss').length,
      views: interactions.filter(i => i.type === 'view').length,
      final_scores: versions.length > 0
        ? versions[versions.length - 1].scores.flatMap(s =>
            Object.entries(s)
              .filter(([k]) => k !== 'paragraph_id')
              .map(([, v]) => v.score)
          )
        : [],
      completed: false, // Can't determine without knowing all scores
    };

    sessions.push({
      id: review.id,
      user_id: config.anonymize ? userIdMap.get(review.reviewer_user_id) : review.reviewer_user_id,
      created_at: review.created_at,
      paper: {
        id: paper.id,
        title: paper.title,
        conference: paper.conference_or_journal,
      },
      review: {
        id: review.id,
        versions,
        interactions,
      },
      stats,
    });
  }

  return sessions;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const config = parseArgs();

  console.log('Exporting database sessions...');
  console.log(`  Output: ${config.output}`);
  console.log(`  Anonymize: ${config.anonymize}`);
  console.log();

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  try {
    // Fetch all data
    const data = await fetchAllData(supabase);

    // Transform to session format
    console.log('\nTransforming data...');
    const sessions = transformToSessions(data, config);
    console.log(`  Sessions: ${sessions.length}`);

    // Calculate summary stats
    const totalInteractions = sessions.reduce((sum, s) => sum + s.stats.total_interactions, 0);
    const totalEdits = sessions.reduce((sum, s) => sum + s.stats.edits, 0);
    const totalDismissals = sessions.reduce((sum, s) => sum + s.stats.dismissals, 0);
    const totalViews = sessions.reduce((sum, s) => sum + s.stats.views, 0);

    // Build output
    const output = {
      metadata: {
        source: 'database',
        generated_at: new Date().toISOString(),
        anonymized: config.anonymize,
        summary: {
          total_sessions: sessions.length,
          total_interactions: totalInteractions,
          total_edits: totalEdits,
          total_dismissals: totalDismissals,
          total_views: totalViews,
        },
      },
      sessions,
    };

    // Write output
    const outputPath = path.resolve(config.output);
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

    console.log('\nSummary:');
    console.log(`  Total sessions: ${sessions.length}`);
    console.log(`  Total interactions: ${totalInteractions}`);
    console.log(`  - Views: ${totalViews}`);
    console.log(`  - Edits: ${totalEdits}`);
    console.log(`  - Dismissals: ${totalDismissals}`);
    console.log();
    console.log(`Output written to: ${outputPath}`);

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
