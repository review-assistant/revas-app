#!/usr/bin/env node

/**
 * Export My Tables view for all accounts as a standalone HTML file
 *
 * Usage:
 *   npm run export:mytables
 *   npm run export:mytables -- --output=custom-name.html
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in environment or .env file
 */

import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';
import { config } from 'dotenv';

// Load environment variables
config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Error: Missing required environment variables');
  console.error('  VITE_SUPABASE_URL:', SUPABASE_URL ? 'set' : 'MISSING');
  console.error('  SUPABASE_SERVICE_ROLE_KEY:', SERVICE_ROLE_KEY ? 'set' : 'MISSING');
  console.error('\nGet the service role key from: npx supabase status');
  process.exit(1);
}

// Parse command line arguments
const args = process.argv.slice(2);
let outputFile = 'mytables-export.html';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--output' && args[i + 1]) {
    outputFile = args[i + 1];
    i++;
  } else if (args[i].startsWith('--output=')) {
    outputFile = args[i].split('=')[1];
  }
}

// Create Supabase client with service role key (bypasses RLS)
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

/**
 * Fetch all data for all users using admin RPC (returns decrypted content)
 */
async function fetchAllData() {
  console.log('Fetching all data via admin_view_all_tables RPC...');

  const { data, error } = await supabase.rpc('admin_view_all_tables');

  if (error) {
    if (error.message.includes('function') && error.message.includes('does not exist')) {
      console.error('\nError: admin_view_all_tables function not found.');
      console.error('Run: npm run db:reset to apply the migration.\n');
    }
    throw error;
  }

  // Handle null/empty response
  if (!data || !data.papers) {
    return { papers: [] };
  }

  return data;
}

/**
 * Check if dimension was dismissed in an earlier version
 */
function wasDismissedInEarlierVersion(versions, currentVersion, dimension) {
  for (const item of versions) {
    if (item.version < currentVersion) {
      const interaction = item.interactions?.find(i => i.dimension === dimension);
      if (interaction?.comment_dismissed) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Group review items by paragraph_id
 */
function groupByParagraph(reviewItems) {
  const groups = {};
  for (const item of reviewItems) {
    if (!groups[item.paragraph_id]) {
      groups[item.paragraph_id] = [];
    }
    groups[item.paragraph_id].push(item);
  }
  // Sort each group by version descending
  for (const pid of Object.keys(groups)) {
    groups[pid].sort((a, b) => b.version - a.version);
  }
  return groups;
}

/**
 * Get score color class
 */
function getScoreColor(score) {
  if (score <= 2) return 'bg-red-100 text-red-800';
  if (score <= 4) return 'bg-yellow-100 text-yellow-800';
  return 'bg-green-100 text-green-800';
}

/**
 * Format date
 */
function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleString();
}

/**
 * Escape HTML
 */
function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Generate HTML for a score item
 */
function renderScore(score, interaction, hiddenByPriorDismiss) {
  const colorClass = getScoreColor(score.score);

  let interactionHtml = '';

  if (hiddenByPriorDismiss) {
    interactionHtml += `
      <span class="px-1.5 py-0.5 rounded text-xs bg-orange-100 text-orange-700 relative" title="Hidden due to dismissal in earlier version">
        <span>&#x1F441;</span>
        <span class="absolute inset-0 flex items-center justify-center text-orange-700 font-bold text-sm">&#x2715;</span>
      </span>`;
  }

  if (interaction?.comment_viewed) {
    interactionHtml += `
      <span class="px-1.5 py-0.5 rounded text-xs bg-blue-100 text-blue-700" title="Viewed: ${formatDate(interaction.comment_viewed_at)}">
        &#x1F441;
      </span>`;
  }

  if (interaction?.comment_dismissed) {
    interactionHtml += `
      <span class="px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-600" title="Dismissed: ${formatDate(interaction.comment_dismissed_at)}">
        &#x2715;
      </span>`;
  }

  return `
    <div class="bg-white border border-yellow-100 rounded p-2 text-sm mb-1">
      <div class="flex justify-between items-center mb-1">
        <span class="font-medium text-yellow-900">${escapeHtml(score.dimension)}</span>
        <div class="flex items-center gap-2">
          ${interactionHtml}
          <span class="px-2 py-1 rounded text-xs font-bold ${colorClass}">
            ${score.score}/5
          </span>
        </div>
      </div>
      ${score.comment ? `<div class="text-gray-600 text-xs mt-1">${escapeHtml(score.comment)}</div>` : ''}
    </div>`;
}

/**
 * Generate HTML for a review item (paragraph version)
 */
function renderReviewItem(item, versions, isLatest = true) {
  const scoresHtml = (item.scores || []).map(score => {
    const interaction = item.interactions?.find(i => i.dimension === score.dimension);
    const hiddenByPriorDismiss = !interaction && wasDismissedInEarlierVersion(versions, item.version, score.dimension);
    return renderScore(score, interaction, hiddenByPriorDismiss);
  }).join('');

  if (isLatest) {
    return `
      <div class="text-sm text-gray-700 mb-3 bg-white border border-yellow-100 rounded p-2 whitespace-pre-wrap">
        ${escapeHtml(item.content || '(No content)')}
      </div>
      ${scoresHtml ? `
        <div class="mt-2">
          <div class="text-xs font-semibold text-yellow-800 mb-1">Scores:</div>
          ${scoresHtml}
        </div>
      ` : ''}`;
  } else {
    // Previous version display with comment text
    const scoresWithComments = (item.scores || []).map(score => {
      const interaction = item.interactions?.find(i => i.dimension === score.dimension);
      const hiddenByPriorDismiss = !interaction && wasDismissedInEarlierVersion(versions, item.version, score.dimension);
      const colorClass = getScoreColor(score.score);

      let icons = '';
      if (hiddenByPriorDismiss) {
        icons += `<span class="relative text-orange-600" title="Hidden">&#x1F441;<span class="absolute inset-0 flex items-center justify-center font-bold">&#x2715;</span></span>`;
      }
      if (interaction?.comment_viewed) {
        icons += `<span class="text-blue-600" title="Viewed">&#x1F441;</span>`;
      }
      if (interaction?.comment_dismissed) {
        icons += `<span class="text-gray-500" title="Dismissed">&#x2715;</span>`;
      }

      const commentHtml = score.comment
        ? `<div class="text-gray-500 mt-0.5 ml-2 pl-2 border-l border-purple-200">${escapeHtml(score.comment)}</div>`
        : '';

      return `
        <div class="text-xs mb-2">
          <div class="flex items-center gap-2">
            <span class="text-purple-800">${escapeHtml(score.dimension)}:</span>
            <span class="px-1.5 py-0.5 rounded font-bold ${colorClass}">${score.score}/5</span>
            ${icons}
          </div>
          ${commentHtml}
        </div>`;
    }).join('');

    return `
      <div class="mt-3 ml-4 border-l-2 border-purple-300 pl-3 opacity-75">
        <div class="text-xs text-purple-700 font-medium mb-1">
          v${item.version} - ${formatDate(item.created_at)}
        </div>
        <div class="text-sm text-gray-600 mb-2 bg-purple-50 border border-purple-100 rounded p-2 whitespace-pre-wrap">
          ${escapeHtml(item.content || '(No content)')}
        </div>
        ${scoresWithComments ? `<div class="space-y-1">${scoresWithComments}</div>` : ''}
      </div>`;
  }
}

/**
 * Generate full HTML document
 */
function generateHtml(data) {
  const timestamp = new Date().toISOString();

  let papersHtml = '';

  if (!data.papers || data.papers.length === 0) {
    papersHtml = `
      <div class="bg-white rounded-lg shadow-md p-12 text-center">
        <div class="text-gray-500 text-lg">No papers found</div>
      </div>`;
  } else {
    for (const paper of data.papers) {
      let reviewsHtml = '';

      for (const review of paper.reviews) {
        const grouped = groupByParagraph(review.review_items || []);
        const paragraphIds = Object.keys(grouped).map(Number).sort((a, b) => a - b);

        let itemsHtml = '';
        for (let i = 0; i < paragraphIds.length; i++) {
          const paragraphId = paragraphIds[i];
          const versions = grouped[paragraphId];
          const latestItem = versions[0];
          const hasHistory = versions.length > 1;

          itemsHtml += `
            <div class="bg-yellow-50 border border-yellow-200 rounded p-3 mb-3">
              <div class="flex justify-between items-start mb-2">
                <div class="font-medium text-yellow-900">
                  Paragraph ${i + 1} (ID: ${latestItem.paragraph_id}, v${latestItem.version})
                  ${hasHistory ? `<span class="text-xs text-purple-600 ml-2">${versions.length - 1} previous version(s)</span>` : ''}
                </div>
                <div class="text-xs text-yellow-700">
                  ${latestItem.is_deleted ? '&#x1F5D1; Deleted' : '&#x2713; Active'}
                </div>
              </div>
              ${renderReviewItem(latestItem, versions, true)}
              ${versions.slice(1).map(oldItem => renderReviewItem(oldItem, versions, false)).join('')}
            </div>`;
        }

        reviewsHtml += `
          <div class="border border-gray-200 rounded-lg p-4 mb-4">
            <div class="bg-green-50 border-b border-green-200 px-4 py-3 mb-4 -m-4 mb-4 rounded-t-lg">
              <h3 class="font-bold text-green-800">
                Review by ${escapeHtml(review.reviewer_name)}
              </h3>
              <div class="text-sm text-green-700 mt-1 space-y-1">
                <div>ID: ${review.id}</div>
                <div>Locked: ${review.is_locked ? 'Yes' : 'No'}</div>
                <div>Created: ${formatDate(review.created_at)}</div>
                <div>Updated: ${formatDate(review.updated_at)}</div>
              </div>
            </div>
            ${itemsHtml || '<div class="text-gray-500 text-sm italic">No review items</div>'}
          </div>`;
      }

      papersHtml += `
        <div class="bg-white rounded-lg shadow-md overflow-hidden mb-6">
          <div class="bg-blue-600 text-white px-6 py-4">
            <h2 class="text-xl font-bold">${escapeHtml(paper.title || '(No title)')}</h2>
            <p class="text-sm opacity-90 mt-1">${escapeHtml(paper.conference_or_journal || '(No conference/journal)')}</p>
            <div class="flex gap-4 mt-2 text-sm">
              <span>ID: ${paper.id}</span>
              <span>Embargo: ${paper.embargo_active ? 'Active' : 'Lifted'}</span>
              <span>Created: ${formatDate(paper.created_at)}</span>
            </div>
          </div>
          <div class="p-6">
            ${reviewsHtml}
          </div>
        </div>`;
    }
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My Tables Export - ${timestamp}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    /* Ensure emoji icons display correctly */
    .relative { position: relative; }
    .absolute { position: absolute; }
    .inset-0 { top: 0; right: 0; bottom: 0; left: 0; }
  </style>
</head>
<body class="min-h-screen bg-gray-50 p-8">
  <div class="max-w-7xl mx-auto">
    <div class="flex justify-between items-center mb-6">
      <h1 class="text-3xl font-bold text-gray-900">My Tables Export (All Accounts)</h1>
      <div class="text-sm text-gray-500">Generated: ${timestamp}</div>
    </div>

    <div class="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm">
      <strong>Legend:</strong>
      <span class="ml-4">&#x1F441; (blue) = Viewed</span>
      <span class="ml-4">&#x2715; (gray) = Dismissed</span>
      <span class="ml-4">&#x1F441;&#x2715; (orange) = Hidden due to prior dismissal</span>
    </div>

    ${papersHtml}

    <div class="mt-8 text-center text-gray-400 text-sm">
      Exported from Revas Review Assistant
    </div>
  </div>
</body>
</html>`;
}

/**
 * Main function
 */
async function main() {
  try {
    console.log('Exporting My Tables for all accounts...\n');

    const data = await fetchAllData();

    console.log(`\nFound ${data.papers.length} papers with reviews`);

    const html = generateHtml(data);

    writeFileSync(outputFile, html);
    console.log(`\nExported to: ${outputFile}`);

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
