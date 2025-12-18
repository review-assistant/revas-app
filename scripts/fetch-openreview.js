/**
 * Fetch ICLR 2024 reviews from OpenReview and extract weaknesses
 *
 * Usage: node scripts/fetch-openreview.js
 *
 * Output: data/ICLR-2024.json
 */

const VENUE = 'ICLR.cc/2024/Conference';
const TARGET_PAPERS = 20;
const OUTPUT_FILE = 'data/ICLR-2024.json';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const response = await fetch(url);

    if (response.ok) {
      return response.json();
    }

    if (response.status === 429) {
      const waitTime = attempt * 5000; // 5s, 10s, 15s
      console.log(`  Rate limited, waiting ${waitTime / 1000}s...`);
      await sleep(waitTime);
      continue;
    }

    throw new Error(`HTTP ${response.status}`);
  }
  throw new Error('Max retries exceeded');
}

async function fetchPapers(limit = 100) {
  const url = `https://api2.openreview.net/notes?invitation=${VENUE}/-/Submission&limit=${limit}`;
  console.log(`Fetching papers from: ${url}`);

  const data = await fetchWithRetry(url);
  return data.notes || [];
}

async function fetchReviews(forumId) {
  const url = `https://api2.openreview.net/notes?forum=${forumId}`;

  const data = await fetchWithRetry(url);
  const notes = data.notes || [];

  // Filter to only Official_Review notes
  return notes.filter(note =>
    note.invitation && note.invitation.includes('Official_Review')
  );
}

function extractWeaknesses(reviews) {
  const weaknesses = [];

  for (const review of reviews) {
    const content = review.content;
    if (content && content.weaknesses && content.weaknesses.value) {
      // Split by numbered items or paragraphs
      const text = content.weaknesses.value;

      // Try to split by numbered patterns (1., 2., etc.) or double newlines
      const paragraphs = text
        .split(/(?:\n\n+|\n(?=\d+\.\s)|\n(?=-\s))/)
        .map(p => p.trim())
        .filter(p => p.length > 20); // Filter very short items

      weaknesses.push(...paragraphs);
    }
  }

  return weaknesses;
}

async function main() {
  console.log(`Fetching ${TARGET_PAPERS} papers from ${VENUE}...\n`);

  // Fetch more papers than needed since some may not have reviews
  const papers = await fetchPapers(TARGET_PAPERS * 3);
  console.log(`Found ${papers.length} papers\n`);

  const results = [];
  let papersWithReviews = 0;

  for (const paper of papers) {
    if (papersWithReviews >= TARGET_PAPERS) break;

    const paperId = paper.id;
    const title = paper.content?.title?.value || 'Untitled';

    console.log(`Checking: ${title.substring(0, 60)}...`);

    try {
      const reviews = await fetchReviews(paperId);

      if (reviews.length === 0) {
        console.log(`  → No reviews yet, skipping`);
        continue;
      }

      const weaknesses = extractWeaknesses(reviews);

      if (weaknesses.length === 0) {
        console.log(`  → No weaknesses found, skipping`);
        continue;
      }

      console.log(`  → Found ${reviews.length} reviews, ${weaknesses.length} weakness paragraphs`);

      results.push({
        paperId,
        title,
        conference: 'ICLR 2024',
        reviewCount: reviews.length,
        weaknesses
      });

      papersWithReviews++;

      // Rate limiting - be nice to the API
      await sleep(2000); // 2 seconds between papers

    } catch (error) {
      console.log(`  → Error: ${error.message}`);
    }
  }

  console.log(`\nCollected data from ${results.length} papers`);

  // Write to file
  const fs = await import('fs');
  const path = await import('path');

  const outputPath = path.join(process.cwd(), OUTPUT_FILE);
  const outputDir = path.dirname(outputPath);

  // Create data directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\nSaved to ${OUTPUT_FILE}`);

  // Summary stats
  const totalWeaknesses = results.reduce((sum, r) => sum + r.weaknesses.length, 0);
  console.log(`\nSummary:`);
  console.log(`  Papers: ${results.length}`);
  console.log(`  Total weakness paragraphs: ${totalWeaknesses}`);
  console.log(`  Avg per paper: ${(totalWeaknesses / results.length).toFixed(1)}`);
}

main().catch(console.error);
