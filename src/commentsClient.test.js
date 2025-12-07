/**
 * Test Suite for Comments Client
 *
 * This test suite includes:
 * 1. Functional tests - Verify the client works with backend/mock
 * 2. Benchmark tests - Measure timing performance across batch sizes
 *
 * Usage:
 *   node src/commentsClient.test.js --test functional
 *   node src/commentsClient.test.js --test benchmark
 *   node src/commentsClient.test.js --test all
 */

import { getComments, SAMPLE_REVIEW_TEXT } from './commentsClient.js';

// ============================================================================
// TEST CONFIGURATION
// ============================================================================

const TEST_CONFIG = {
  // Batch sizes to test in benchmark
  BATCH_SIZES: [1, 2, 4, 8, 16, 32],

  // Total number of paragraphs to process in benchmark
  // Each batch size test will process this same total (repeating paragraphs as needed)
  // This allows fair comparison of completion time across batch sizes
  BENCHMARK_TOTAL_PARAGRAPHS: 32,

  // Number of times to run each batch size for averaging
  BENCHMARK_RUNS: 1,

  // Use sample review text from commentsClient
  USE_SAMPLE_DATA: true
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Parse review text into paragraphs
 */
function parseReviewText(text) {
  const paragraphTexts = text
    .split(/\n\n+/)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  return paragraphTexts.map((content, index) => ({
    id: index + 1,
    content
  }));
}

/**
 * Format time in milliseconds to human readable
 */
function formatTime(ms) {
  if (ms < 1000) {
    return `${ms.toFixed(0)}ms`;
  } else if (ms < 60000) {
    return `${(ms / 1000).toFixed(2)}s`;
  } else {
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(2);
    return `${minutes}m ${seconds}s`;
  }
}

/**
 * Calculate statistics from array of numbers
 */
function calculateStats(values) {
  if (values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((a, b) => a + b, 0);

  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: sum / values.length,
    median: sorted[Math.floor(sorted.length / 2)],
    count: values.length
  };
}

/**
 * Print a divider line
 */
function printDivider(char = '=', length = 80) {
  console.log(char.repeat(length));
}

/**
 * Print a section header
 */
function printHeader(title) {
  console.log('\n');
  printDivider();
  console.log(title);
  printDivider();
  console.log('');
}

// ============================================================================
// FUNCTIONAL TEST
// ============================================================================

/**
 * Test basic functionality of the comments client
 */
async function runFunctionalTest() {
  printHeader('FUNCTIONAL TEST - Backend Verification');

  console.log('Test Configuration:');
  console.log(`  Using sample data: ${TEST_CONFIG.USE_SAMPLE_DATA}`);
  console.log('');

  // Parse sample data
  const paragraphs = parseReviewText(SAMPLE_REVIEW_TEXT);
  console.log(`Test Data:`);
  console.log(`  Total paragraphs: ${paragraphs.length}`);
  console.log(`  Average paragraph length: ${Math.round(paragraphs.reduce((sum, p) => sum + p.content.length, 0) / paragraphs.length)} chars`);
  console.log('');

  try {
    console.log('Starting API call...\n');
    const startTime = Date.now();

    const results = await getComments(paragraphs);

    const endTime = Date.now();
    const duration = endTime - startTime;

    // Analyze results
    const commentedParagraphs = Object.keys(results).length;
    const totalComments = Object.values(results).reduce((sum, comments) => {
      return sum + Object.keys(comments).length;
    }, 0);

    // Count by severity (based on scores)
    let criticalCount = 0;
    let moderateCount = 0;
    let goodCount = 0;

    Object.values(results).forEach(comments => {
      Object.values(comments).forEach(comment => {
        if (comment.score <= 2) criticalCount++;
        else if (comment.score <= 4) moderateCount++;
        else goodCount++;
      });
    });

    // Print results
    printHeader('TEST RESULTS');

    console.log('✅ Test completed successfully!\n');
    console.log('Performance:');
    console.log(`  Total time: ${formatTime(duration)}`);
    console.log(`  Time per paragraph: ${formatTime(duration / paragraphs.length)}`);
    console.log('');

    console.log('Results Summary:');
    console.log(`  Paragraphs analyzed: ${commentedParagraphs}/${paragraphs.length}`);
    console.log(`  Total comments: ${totalComments}`);
    console.log(`  Comments per paragraph: ${(totalComments / commentedParagraphs).toFixed(1)}`);
    console.log('');

    console.log('Comment Severity Distribution:');
    console.log(`  🔴 Critical (score 1-2): ${criticalCount}`);
    console.log(`  🟡 Moderate (score 3-4): ${moderateCount}`);
    console.log(`  🟢 Good (score 5):      ${goodCount}`);
    console.log('');

    // Sample results
    console.log('Sample Comments (first paragraph):');
    const firstParagraphId = Object.keys(results)[0];
    if (firstParagraphId) {
      const firstComments = results[firstParagraphId];
      Object.entries(firstComments).forEach(([aspect, data]) => {
        const emoji = data.score <= 2 ? '🔴' : data.score <= 4 ? '🟡' : '🟢';
        console.log(`  ${emoji} ${aspect}: ${data.score}/5`);
        console.log(`     ${data.text.substring(0, 100)}...`);
      });
    }

    return { success: true, duration, results };

  } catch (error) {
    console.error('\n❌ Test FAILED!');
    console.error(`Error: ${error.message}`);
    console.error('');
    if (error.stack) {
      console.error('Stack trace:');
      console.error(error.stack);
    }
    return { success: false, error: error.message };
  }
}

// ============================================================================
// BENCHMARK TEST
// ============================================================================

/**
 * Replicate paragraphs to reach target total
 */
function replicateParagraphs(baseParagraphs, targetTotal) {
  const replicated = [];
  let currentId = 1;

  while (replicated.length < targetTotal) {
    for (const para of baseParagraphs) {
      if (replicated.length >= targetTotal) break;
      replicated.push({
        id: currentId++,
        content: para.content
      });
    }
  }

  return replicated;
}

/**
 * Run benchmark across different batch sizes
 */
async function runBenchmarkTest() {
  printHeader('BENCHMARK TEST - Batch Size Performance');

  const baseParagraphs = parseReviewText(SAMPLE_REVIEW_TEXT);
  const targetTotal = TEST_CONFIG.BENCHMARK_TOTAL_PARAGRAPHS;

  console.log('Benchmark Configuration:');
  console.log(`  Base paragraphs available: ${baseParagraphs.length}`);
  console.log(`  Target total paragraphs per test: ${targetTotal}`);
  console.log(`  Batch sizes to test: ${TEST_CONFIG.BATCH_SIZES.join(', ')}`);
  console.log(`  Runs per batch size: ${TEST_CONFIG.BENCHMARK_RUNS}`);
  console.log(`  (Paragraphs will be repeated to reach target total)`);
  console.log('');

  const results = [];

  for (const batchSize of TEST_CONFIG.BATCH_SIZES) {
    // Create test dataset with target total paragraphs
    const testParagraphs = replicateParagraphs(baseParagraphs, targetTotal);
    const numBatches = Math.ceil(testParagraphs.length / batchSize);

    console.log(`\nTesting batch size: ${batchSize}`);
    console.log(`  Total paragraphs: ${testParagraphs.length}`);
    console.log(`  Number of batches: ${numBatches}`);
    printDivider('-', 40);

    const runTimes = [];

    for (let run = 0; run < TEST_CONFIG.BENCHMARK_RUNS; run++) {
      console.log(`  Run ${run + 1}/${TEST_CONFIG.BENCHMARK_RUNS}...`);

      try {
        const startTime = Date.now();

        // Create batches manually to control batch size
        const batches = [];
        for (let i = 0; i < testParagraphs.length; i += batchSize) {
          batches.push(testParagraphs.slice(i, i + batchSize));
        }

        // Process batches in parallel (simulating the actual behavior)
        const batchPromises = batches.map(async (batch) => {
          return await getComments(batch);
        });

        await Promise.all(batchPromises);

        const endTime = Date.now();
        const totalTime = endTime - startTime;

        runTimes.push(totalTime);

        console.log(`    Completed in ${formatTime(totalTime)}`);

      } catch (error) {
        console.error(`    ❌ Failed: ${error.message}`);
      }
    }

    // Calculate statistics for this batch size
    const stats = calculateStats(runTimes);

    if (stats) {
      results.push({
        batchSize,
        stats,
        numBatches,
        totalParagraphs: testParagraphs.length
      });

      console.log(`\n  Results for batch size ${batchSize}:`);
      console.log(`    Number of batches: ${numBatches}`);
      console.log(`    Average time: ${formatTime(stats.avg)}`);
      console.log(`    Min time: ${formatTime(stats.min)}`);
      console.log(`    Max time: ${formatTime(stats.max)}`);
    }
  }

  // Print final comparison
  printHeader('BENCHMARK SUMMARY');

  console.log(`All tests processed ${targetTotal} paragraphs total\n`);
  console.log('Batch Size | # Batches | Avg Time    | Min Time    | Max Time    | Throughput');
  printDivider('-', 80);

  results.forEach(({ batchSize, stats, numBatches, totalParagraphs }) => {
    const throughput = (totalParagraphs / (stats.avg / 1000)).toFixed(2);
    console.log(
      `${String(batchSize).padStart(10)} | ` +
      `${String(numBatches).padStart(9)} | ` +
      `${formatTime(stats.avg).padStart(11)} | ` +
      `${formatTime(stats.min).padStart(11)} | ` +
      `${formatTime(stats.max).padStart(11)} | ` +
      `${throughput} para/s`
    );
  });

  console.log('');

  // Find best and worst
  if (results.length > 0) {
    const fastest = results.reduce((best, curr) =>
      curr.stats.avg < best.stats.avg ? curr : best
    );
    const slowest = results.reduce((worst, curr) =>
      curr.stats.avg > worst.stats.avg ? curr : worst
    );

    console.log('Key Findings:');
    console.log(`  🏆 Fastest batch size: ${fastest.batchSize} (${formatTime(fastest.stats.avg)})`);
    console.log(`  🐌 Slowest batch size: ${slowest.batchSize} (${formatTime(slowest.stats.avg)})`);

    if (fastest.batchSize !== slowest.batchSize) {
      const improvement = ((slowest.stats.avg - fastest.stats.avg) / slowest.stats.avg * 100).toFixed(1);
      console.log(`  📊 Speed improvement: ${improvement}% faster with optimal batch size`);
    }
  }

  console.log('');

  return { success: true, results };
}

// ============================================================================
// MAIN CLI
// ============================================================================

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.length === 0) {
    console.log(`
Comments Client Test Suite

Usage:
  node src/commentsClient.test.js --test <type>

Test Types:
  functional  - Verify backend connectivity and basic functionality
  benchmark   - Measure performance across different batch sizes (1, 2, 4, 8, 16, 32)
  all         - Run all tests

Examples:
  node src/commentsClient.test.js --test functional
  node src/commentsClient.test.js --test benchmark
  node src/commentsClient.test.js --test all
`);
    process.exit(0);
  }

  let testType = 'all';
  const testIndex = args.indexOf('--test');
  if (testIndex !== -1 && testIndex + 1 < args.length) {
    testType = args[testIndex + 1];
  }

  console.log(`
╔════════════════════════════════════════════════════════════════════════════╗
║                    COMMENTS CLIENT TEST SUITE                              ║
╚════════════════════════════════════════════════════════════════════════════╝
`);

  const startTime = Date.now();

  try {
    if (testType === 'functional' || testType === 'all') {
      const result = await runFunctionalTest();
      if (!result.success) {
        process.exit(1);
      }
    }

    if (testType === 'benchmark' || testType === 'all') {
      if (testType === 'all') {
        console.log('\n\n');
      }
      const result = await runBenchmarkTest();
      if (!result.success) {
        process.exit(1);
      }
    }

    const totalTime = Date.now() - startTime;

    printHeader('ALL TESTS COMPLETED');
    console.log(`✅ Total test time: ${formatTime(totalTime)}\n`);

  } catch (error) {
    console.error('\n❌ Test suite failed with error:');
    console.error(error);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
