/**
 * Comments Client Module
 *
 * This module provides functionality to fetch review comments from the backend API.
 * It can be used both as an importable module and as a standalone CLI utility.
 *
 * Usage as module:
 *   import { getComments } from './commentsClient.js';
 *   const results = await getComments([{id: 1, content: "Review text..."}]);
 *
 * Usage as CLI:
 *   node src/commentsClient.js --text "Review text to analyze"
 *   node src/commentsClient.js --file path/to/review.txt
 */

// ============================================================================
// CONFIGURATION
// ============================================================================
// TODO: Move to separate configuration file in future versions

const CONFIG = {
  // Mode configuration
  // Set to 'mock' for local testing without backend, 'backend' for real API calls
  MODE: 'backend',             // 'mock' or 'backend'

  // API endpoint configuration
  API_BASE_URL: 'http://10.127.105.10:8888',

  // Batch processing configuration
  // Server maximum is 128, we use a smaller batch size for better parallelism
  API_BATCH_SIZE: 32,

  // Polling configuration
  POLL_INTERVAL_MS: 2000,      // 2 seconds between status checks
  MAX_POLLS: 150,                      // Max 5 minutes of polling per job

  // Retry configuration
  MAX_RETRIES: 3,              // Number of retries for failed requests
  RETRY_DELAY_MS: 2000,        // Delay before retrying (2 second)

  // Logging configuration
  // Levels: 'DEBUG', 'INFO', 'WARN', 'ERROR'
  LOG_LEVEL: 'INFO',

  // Mock mode configuration
  MOCK_DELAY_MS: 500           // Simulated API delay in mock mode
};

// ============================================================================
// TEST DATA
// ============================================================================
// Sample review text from ReviewComponent - used for testing
// TODO: Will be removed from ReviewComponent in future versions

export const SAMPLE_REVIEW_TEXT = `Limited insights from the analysis. I appreciate the attempt of the authors to propose a new algorithm to analyze the impact of the context to reasoning path of LLMs, however, beyond the algorithm itself I don't see much new insights from the analysis. For example, one main finding from the paper is "good context can lead to incorrect answers and bad context can lead to correct answers,", this is not new and has been revealed from previous work (e.g., [1]). I would like to see the authors do more in-depth analysis with their method.



Lack of experiments. One of the main contribution claimed by the authors is the proposed methods leading to more accurate reasoning of LLMs, however, it is not well supported by the experiment:- The paper only compares with self-consistency method, but doesn't compare with other state-of-the-art baselines such as Tree of Thoughts or Graph of Thoughts.- The method improves over self-consistency (Table 2) but it is quite marginal (<=2%). Is that statistical significant? Even if so, how do we justify the significantly increased complexity introduced by the method (tree constructing and maintenance etc)? It is worth mentioning in the paper.- If the claim is about improvement of reasoning correctness on the reasoning path, there is no evaluation results to verify whether the reasoning path quality has improved.






I think the paper need improvement on the writing, here are a few examples:- Long sequences in the paper are not easy to follow. For example, line 13-17 in the abstract;- Fix the citation in line 62-64, and line 256.- Figure 3, it is not clear what is the difference between 3 plots on the same row. I think caption should be added to emphasize that.- As mentioned above, section 3.3 should be expanded to include more details, e.g., what metrics are used? How should we interpret the results? reference:[1] Language Models Don't Always Say What They Think: Unfaithful Explanations in Chain-of-Thought Prompting

What's the motivation for calculating the upperbound of variations for uncertainty quantification? As shown in Eq 1. The objective is to estimate the variance given an different parameters initializations. To solve this, the DNN is first linearized locally with the NTK theory and the upperbound for introducing the changes are calculated with the NTK theory. The paradox is if the parameters can be already be perturbed, why NTK is needed for calculating the upperbound. Besides, calculating the upperbound will bring biased estimations of uncertainty. Another simple way to achieve this might be directly apply random perturbations to the network parameters (like random noises injection, dropout parameters), can easily get ensemble of neural network parameters. What is the advantage over these methods?

Given that $\\lambda \\in\\{\\sqrt{o}, 3 \\sqrt{o}\\}$, where $o$ represents the number of output dimensions, why does Figure 4 only explore the range of $\\lambda$ values between 0 and 3 on ImageNet-200? The authors should consider exploring a broader range of this hyperparameter.

The authors mention that TULiP is over three times faster than ViM, noting that ViM takes more than 30 minutes just to extract ID information on a recent GPU machine. However, it appears that the proposed method requires $M=10$ forward passes per sample for OOD detection. Compared to classic OOD detectors like EBO, does this imply that the detection speed of the proposed method is relatively slower?

In the experiments, the authors calculated Equation 8 using 256 samples from the ID dataset (ImageNet-1K) and 128 samples per OOD dataset. However, the authors do not clarify how these 256 ID samples and 128 OOD samples were selected or whether OOD samples align with test samples. Additionally, did the authors know beforehand which samples were ID and OOD when using these samples?

Have the authors considered the impact of different types of OOD data? For example, have the authors considered situations where OOD data is very far from ID data to improve detection of far-OOD.`;

// ============================================================================
// LOGGING UTILITIES
// ============================================================================

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

const currentLogLevel = LOG_LEVELS[CONFIG.LOG_LEVEL] || LOG_LEVELS.INFO;

function log(level, message, data = null) {
  if (LOG_LEVELS[level] >= currentLogLevel) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level}]`;

    if (data) {
      console.log(`${prefix} ${message}`, data);
    } else {
      console.log(`${prefix} ${message}`);
    }
  }
}

function logDebug(message, data) {
  log('DEBUG', message, data);
}

function logInfo(message, data) {
  log('INFO', message, data);
}

function logWarn(message, data) {
  log('WARN', message, data);
}

function logError(message, data) {
  log('ERROR', message, data);
}

// ============================================================================
// MOCK IMPLEMENTATION
// ============================================================================

/**
 * Generate random scores with equal probability (for mock mode)
 */
function generateWeightedScore() {
  return Math.floor(Math.random() * 5) + 1; // 1-5, each with 20% probability
}

/**
 * Mock implementation of getComments for testing without backend
 * Mimics the behavior of the ReviewComponent's original mock function
 */
async function getCommentsMock(paragraphs) {
  logInfo(`[MOCK MODE] Simulating API call for ${paragraphs.length} paragraphs`);

  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, CONFIG.MOCK_DELAY_MS));

  const results = {};

  paragraphs.forEach(para => {
    const labels = ['Actionability', 'Helpfulness', 'Grounding', 'Verifiability'];
    const comment = {};

    // Map label to marker suffix
    const labelMarkers = {
      'Actionability': 'A',
      'Helpfulness': 'H',
      'Grounding': 'G',
      'Verifiability': 'V'
    };

    labels.forEach(label => {
      const marker = labelMarkers[label];
      let score;

      // Check for special markers in text to override score
      if (para.content.includes(`XXX${marker}`)) {
        score = 1;
        logDebug(`Found marker XXX${marker} in paragraph ${para.id}, setting ${label} score to 1`);
      } else if (para.content.includes(`YYY${marker}`)) {
        score = 3;
        logDebug(`Found marker YYY${marker} in paragraph ${para.id}, setting ${label} score to 3`);
      } else if (para.content.includes(`ZZZ${marker}`)) {
        score = 5;
        logDebug(`Found marker ZZZ${marker} in paragraph ${para.id}, setting ${label} score to 5`);
      } else {
        // Generate random score as usual
        score = generateWeightedScore();
      }

      comment[label] = {
        score: score,
        text: `${label} feedback for paragraph: Score ${score}/5. ${para.content.substring(0, 50)}...`
      };
    });

    results[para.id] = comment;
  });

  logInfo(`[MOCK MODE] Generated mock comments for ${Object.keys(results).length} paragraphs`);

  return results;
}

// ============================================================================
// API CLIENT FUNCTIONS
// ============================================================================

/**
 * Create a job to get comments for the given weakness points
 * @param {Array<string>} points - Array of weakness point texts
 * @returns {Promise<{job_id: string, status: string}>}
 */
async function createCommentsJob(points) {
  const url = `${CONFIG.API_BASE_URL}/get_comments/v1/jobs`;

  logDebug(`POST ${url}`, { pointsCount: points.length });
  logDebug('Request body:', { points });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ points })
  });

  logDebug(`Response status: ${response.status} ${response.statusText}`);

  if (!response.ok) {
    const errorText = await response.text();
    logError(`Failed to create job: ${response.status} ${response.statusText}`, { errorText });
    throw new Error(`Failed to create job: ${response.status} ${response.statusText}`);
  }

  const result = await response.json();
  logDebug('Response body:', result);

  return result;
}

/**
 * Poll for job results
 * @param {string} jobId - The job ID to poll
 * @returns {Promise<Object>} - The job result
 */
async function pollJobResult(jobId) {
  const url = `${CONFIG.API_BASE_URL}/get_comments/v1/jobs/${jobId}`;

  logDebug(`GET ${url}`);

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'accept': 'application/json'
    }
  });

  logDebug(`Response status: ${response.status} ${response.statusText}`);

  if (!response.ok) {
    const errorText = await response.text();
    logError(`Failed to get job status: ${response.status} ${response.statusText}`, { errorText });
    throw new Error(`Failed to get job status: ${response.status} ${response.statusText}`);
  }

  const result = await response.json();
  logDebug('Response body:', result);

  return result;
}

/**
 * Wait for job to complete by polling
 * @param {string} jobId - The job ID to wait for
 * @returns {Promise<Object>} - The completed job result
 */
async function waitForJobCompletion(jobId) {
  let polls = 0;

  logInfo(`Waiting for job ${jobId} to complete...`);

  while (polls < CONFIG.MAX_POLLS) {
    const result = await pollJobResult(jobId);

    logDebug(`Job ${jobId} status: ${result.status} (poll ${polls + 1}/${CONFIG.MAX_POLLS})`);

    if (result.status === 'completed') {
      logInfo(`Job ${jobId} completed successfully`);
      return result;
    } else if (result.status === 'failed') {
      const errorMsg = result.error || 'Unknown error';
      logError(`Job ${jobId} failed:`, { error: errorMsg });
      throw new Error(`Job failed: ${errorMsg}`);
    }

    // Status is 'queued' or 'running', wait and poll again
    await new Promise(resolve => setTimeout(resolve, CONFIG.POLL_INTERVAL_MS));
    polls++;
  }

  logError(`Job ${jobId} timed out after ${CONFIG.MAX_POLLS} polls`);
  throw new Error(`Job timed out after ${CONFIG.MAX_POLLS} polls`);
}

/**
 * Process a single batch of paragraphs with retry logic
 * @param {Array<{id: number|string, content: string}>} batch - Batch of paragraphs
 * @param {number} batchIndex - Index of this batch
 * @returns {Promise<Object>} - Results for this batch
 */
async function processBatch(batch, batchIndex) {
  let retries = 0;

  while (retries <= CONFIG.MAX_RETRIES) {
    try {
      logInfo(`Processing batch ${batchIndex + 1} (${batch.length} paragraphs)${retries > 0 ? ` - Retry ${retries}/${CONFIG.MAX_RETRIES}` : ''}`);

      // Extract content strings for API
      const points = batch.map(p => p.content);

      // Step 1: Create the job
      const jobInfo = await createCommentsJob(points);
      logInfo(`Batch ${batchIndex + 1}: Job created ${jobInfo.job_id} (status: ${jobInfo.status})`);

      // Step 2: Wait for completion
      const result = await waitForJobCompletion(jobInfo.job_id);

      // Step 3: Return the result with batch info
      return {
        batchIndex,
        batch,
        result
      };

    } catch (error) {
      retries++;

      if (retries <= CONFIG.MAX_RETRIES) {
        logWarn(`Batch ${batchIndex + 1} failed, retrying in ${CONFIG.RETRY_DELAY_MS}ms...`, { error: error.message });
        await new Promise(resolve => setTimeout(resolve, CONFIG.RETRY_DELAY_MS));
      } else {
        logError(`Batch ${batchIndex + 1} failed after ${CONFIG.MAX_RETRIES} retries`, { error: error.message });
        throw error;
      }
    }
  }
}

/**
 * Transform API response format to ReviewComponent expected format
 *
 * API format:
 * {
 *   results: [{
 *     index: 1,
 *     text: "...",
 *     aspects: {
 *       actionability: { score: "1", rationale: "..." },
 *       grounding_specificity: { score: "1", rationale: "..." },
 *       verifiability: { score: "X", rationale: "..." },
 *       helpfulness: { score: "1", rationale: "..." }
 *     }
 *   }]
 * }
 *
 * ReviewComponent format:
 * {
 *   paragraphId: {
 *     Actionability: { score: 1-5, text: "..." },
 *     Grounding: { score: 1-5, text: "..." },
 *     Verifiability: { score: 1-5, text: "..." },
 *     Helpfulness: { score: 1-5, text: "..." }
 *   }
 * }
 */
function transformApiResponse(paragraphs, apiResponse) {
  const results = {};

  if (!apiResponse.response || !apiResponse.response.results) {
    logWarn('API response missing results field');
    return results;
  }

  logDebug(`Transforming ${apiResponse.response.results.length} results`);

  apiResponse.response.results.forEach((result, index) => {
    // Get the paragraph from the batch
    const paragraph = paragraphs[index];
    if (!paragraph) {
      logWarn(`No paragraph found for result index ${index}`);
      return;
    }

    if (result.error) {
      logWarn(`Error in result for paragraph ${paragraph.id}:`, { error: result.error });
      return;
    }

    const { aspects } = result;

    // Transform each aspect to the expected format
    const comments = {};

    // Actionability
    if (aspects.actionability) {
      const score = parseInt(aspects.actionability.score);
      if (!isNaN(score)) {
        comments.Actionability = {
          score: score,
          text: aspects.actionability.rationale
        };
      }
    }

    // Grounding (maps to grounding_specificity)
    if (aspects.grounding_specificity) {
      const score = parseInt(aspects.grounding_specificity.score);
      if (!isNaN(score)) {
        comments.Grounding = {
          score: score,
          text: aspects.grounding_specificity.rationale
        };
      }
    }

    // Verifiability (may be 'X' for N/A, treat as score 5 to hide it)
    if (aspects.verifiability) {
      let score;
      if (aspects.verifiability.score === 'X') {
        score = 5; // Hide verifiability comments when not applicable
        logDebug(`Paragraph ${paragraph.id}: Verifiability marked as N/A (X), setting score to 5`);
      } else {
        score = parseInt(aspects.verifiability.score);
      }
      if (!isNaN(score)) {
        comments.Verifiability = {
          score: score,
          text: aspects.verifiability.rationale
        };
      }
    }

    // Helpfulness
    if (aspects.helpfulness) {
      const score = parseInt(aspects.helpfulness.score);
      if (!isNaN(score)) {
        comments.Helpfulness = {
          score: score,
          text: aspects.helpfulness.rationale
        };
      }
    }

    // Store using paragraph ID as key
    results[paragraph.id] = comments;

    logDebug(`Transformed paragraph ${paragraph.id}:`, {
      aspectCount: Object.keys(comments).length,
      aspects: Object.keys(comments)
    });
  });

  return results;
}

// ============================================================================
// MAIN API FUNCTION
// ============================================================================

/**
 * Main function to get comments for paragraphs
 * Processes paragraphs in batches asynchronously for better parallelism
 *
 * @param {Array<{id: number|string, content: string}>} paragraphs - Array of paragraphs to analyze
 * @returns {Promise<Object>} - Object keyed by paragraph id with comment data
 *
 * @example
 * const comments = await getComments([
 *   { id: 1, content: "This is a review comment..." },
 *   { id: 2, content: "Another review comment..." }
 * ]);
 * // Returns: { 1: { Actionability: {...}, ... }, 2: { ... } }
 */
export async function getComments(paragraphs) {
  if (!paragraphs || paragraphs.length === 0) {
    logWarn('getComments called with empty paragraphs array');
    return {};
  }

  // Check if we're in mock mode
  if (CONFIG.MODE === 'mock') {
    return getCommentsMock(paragraphs);
  }

  logInfo(`Processing ${paragraphs.length} paragraph(s) in internal batches of at most ${CONFIG.API_BATCH_SIZE}`);

  // Split paragraphs into batches
  const batches = [];
  for (let i = 0; i < paragraphs.length; i += CONFIG.API_BATCH_SIZE) {
    batches.push(paragraphs.slice(i, i + CONFIG.API_BATCH_SIZE));
  }

  logInfo(`Split into ${batches.length} batch(es)`);

  try {
    // Process all batches in parallel
    const batchPromises = batches.map((batch, index) => processBatch(batch, index));
    const batchResults = await Promise.all(batchPromises);

    logInfo('All batches completed successfully');

    // Combine results from all batches
    const combinedResults = {};

    batchResults.forEach(({ batch, result }) => {
      const batchTransformed = transformApiResponse(batch, result);
      Object.assign(combinedResults, batchTransformed);
    });

    logInfo(`Received comments for ${Object.keys(combinedResults).length} paragraph(s)`);

    return combinedResults;

  } catch (error) {
    logError('Error getting comments:', { error: error.message, stack: error.stack });
    throw error;
  }
}

// ============================================================================
// CLI UTILITY
// ============================================================================

function printUsage() {
  console.log(`
Usage: node commentsClient.js [options]

Options:
  --text <text>      Analyze a single text string
  --file <path>      Analyze text from a file
  --log-level <lvl>  Set log level (DEBUG, INFO, WARN, ERROR)
  --help             Show this help message

Examples:
  node commentsClient.js --text "This is a review comment to analyze"
  node commentsClient.js --file review.txt
  node commentsClient.js --file review.txt --log-level DEBUG

Configuration:
  API URL:           ${CONFIG.API_BASE_URL}
  Batch Size:        ${CONFIG.API_BATCH_SIZE}
  Poll Interval:     ${CONFIG.POLL_INTERVAL_MS}ms
  Max Polls:         ${CONFIG.MAX_POLLS}
  Max Retries:       ${CONFIG.MAX_RETRIES}
  Default Log Level: ${CONFIG.LOG_LEVEL}
`);
}

async function runCLI() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    printUsage();
    process.exit(0);
  }

  let text = null;

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--text' && i + 1 < args.length) {
      text = args[i + 1];
    } else if (args[i] === '--file' && i + 1 < args.length) {
      const fs = await import('fs/promises');
      try {
        text = await fs.readFile(args[i + 1], 'utf-8');
      } catch (error) {
        console.error(`Error reading file: ${error.message}`);
        process.exit(1);
      }
    } else if (args[i] === '--log-level' && i + 1 < args.length) {
      const level = args[i + 1].toUpperCase();
      if (LOG_LEVELS.hasOwnProperty(level)) {
        CONFIG.LOG_LEVEL = level;
        console.log(`Log level set to: ${level}`);
      } else {
        console.error(`Invalid log level: ${args[i + 1]}`);
        console.error(`Valid levels: DEBUG, INFO, WARN, ERROR`);
        process.exit(1);
      }
    }
  }

  if (!text) {
    console.error('Error: No text provided. Use --text or --file option.');
    printUsage();
    process.exit(1);
  }

  // Split text into paragraphs (simple split by double newline)
  const paragraphTexts = text
    .split(/\n\n+/)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  const paragraphs = paragraphTexts.map((content, index) => ({
    id: index + 1,
    content
  }));

  console.log(`\nAnalyzing ${paragraphs.length} paragraph(s)...\n`);

  try {
    const results = await getComments(paragraphs);

    console.log('\n' + '='.repeat(80));
    console.log('RESULTS');
    console.log('='.repeat(80) + '\n');
    console.log(JSON.stringify(results, null, 2));

    // Print a summary
    console.log('\n' + '='.repeat(80));
    console.log('SUMMARY');
    console.log('='.repeat(80));

    Object.entries(results).forEach(([id, comments]) => {
      console.log(`\nParagraph ${id}:`);
      Object.entries(comments).forEach(([aspect, data]) => {
        const severity = data.score <= 2 ? '🔴' : data.score <= 4 ? '🟡' : '🟢';
        console.log(`  ${severity} ${aspect}: Score ${data.score}/5`);
      });
    });

    console.log('\n');

  } catch (error) {
    console.error(`\nFailed to get comments: ${error.message}`);
    process.exit(1);
  }
}

// Check if this file is being run directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  runCLI();
}
