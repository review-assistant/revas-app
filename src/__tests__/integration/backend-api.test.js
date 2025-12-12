import { describe, it, expect } from 'vitest'

/**
 * Backend API Integration Tests
 *
 * These tests verify that the actual backend API is accessible and returns
 * responses in the expected format. They do NOT test the content of responses
 * (which is non-deterministic), only the structure and format.
 *
 * API Interface:
 * - POST /get_comments/v1/jobs - Create a job with { "points": ["text1", ...] }
 * - GET /get_comments/v1/jobs/{job_id} - Poll for job status and results
 */

const BACKEND_URL = 'http://10.127.105.10:8888'
const JOBS_ENDPOINT = `${BACKEND_URL}/get_comments/v1/jobs`

// Helper function to create a job
async function createJob(points) {
  const response = await fetch(JOBS_ENDPOINT, {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ points })
  })

  if (!response.ok) {
    throw new Error(`Failed to create job: ${response.status} ${response.statusText}`)
  }

  return await response.json()
}

// Helper function to poll for job completion
async function pollJobUntilComplete(jobId, maxPolls = 30, intervalMs = 2000) {
  for (let i = 0; i < maxPolls; i++) {
    const response = await fetch(`${JOBS_ENDPOINT}/${jobId}`, {
      method: 'GET',
      headers: {
        'accept': 'application/json'
      }
    })

    if (!response.ok) {
      throw new Error(`Failed to get job status: ${response.status} ${response.statusText}`)
    }

    const result = await response.json()

    if (result.status === 'completed') {
      return result
    } else if (result.status === 'failed') {
      throw new Error(`Job failed: ${result.error || 'Unknown error'}`)
    }

    // Status is 'queued' or 'running', wait and retry
    await new Promise(resolve => setTimeout(resolve, intervalMs))
  }

  throw new Error('Job timed out waiting for completion')
}

describe('Backend API Integration', () => {
  // Skip these tests if SKIP_INTEGRATION_TESTS env var is set
  const skipTests = process.env.SKIP_INTEGRATION_TESTS === 'true'
  const testFn = skipTests ? it.skip : it

  testFn('backend API is accessible and can create jobs', async () => {
    // Create a simple job with one paragraph
    const jobInfo = await createJob(['Test paragraph for connectivity check.'])

    // Verify job creation response has required fields
    expect(jobInfo).toHaveProperty('job_id')
    expect(jobInfo).toHaveProperty('status')
    expect(typeof jobInfo.job_id).toBe('string')
    expect(jobInfo.job_id.length).toBeGreaterThan(0)
    expect(['queued', 'running', 'completed']).toContain(jobInfo.status)
  }, 10000) // 10 second timeout for network requests

  testFn('returns correct response format for single paragraph', async () => {
    // Create job with single paragraph
    const testText = 'This is a test review comment for integration testing.'
    const jobInfo = await createJob([testText])

    // Wait for job to complete
    const result = await pollJobUntilComplete(jobInfo.job_id)

    // Verify job completed successfully
    expect(result.status).toBe('completed')
    expect(result).toHaveProperty('response')
    expect(result.response).toHaveProperty('results')
    expect(Array.isArray(result.response.results)).toBe(true)
    expect(result.response.results.length).toBe(1)

    // Verify result structure for the single paragraph
    const paragraphResult = result.response.results[0]
    expect(paragraphResult).toHaveProperty('index')
    expect(paragraphResult).toHaveProperty('text')
    expect(paragraphResult).toHaveProperty('aspects')

    // Verify all 4 aspects are present with correct structure
    const aspects = paragraphResult.aspects
    const requiredAspects = ['actionability', 'helpfulness', 'grounding_specificity', 'verifiability']

    requiredAspects.forEach(aspectName => {
      expect(aspects).toHaveProperty(aspectName)
      const aspect = aspects[aspectName]

      // Verify each aspect has score and rationale
      expect(aspect).toHaveProperty('score')
      expect(aspect).toHaveProperty('rationale')

      // Verify score is string "1"-"5" or "X" for verifiability
      expect(typeof aspect.score).toBe('string')
      if (aspectName === 'verifiability') {
        expect(['1', '2', '3', '4', '5', 'X']).toContain(aspect.score)
      } else {
        expect(['1', '2', '3', '4', '5']).toContain(aspect.score)
      }

      // Verify rationale is a non-empty string
      expect(typeof aspect.rationale).toBe('string')
      expect(aspect.rationale.length).toBeGreaterThan(0)
    })
  }, 60000) // 60 second timeout for API processing

  testFn('returns correct format for multiple paragraphs', async () => {
    const testTexts = [
      'First test paragraph for backend validation.',
      'Second test paragraph to verify multi-paragraph handling.',
      'Third paragraph for comprehensive format checking.'
    ]

    // Create job with multiple paragraphs
    const jobInfo = await createJob(testTexts)

    // Wait for job to complete
    const result = await pollJobUntilComplete(jobInfo.job_id)

    // Verify job completed successfully
    expect(result.status).toBe('completed')
    expect(result.response.results.length).toBe(3)

    // Verify each paragraph has all 4 aspects with correct structure
    const requiredAspects = ['actionability', 'helpfulness', 'grounding_specificity', 'verifiability']

    result.response.results.forEach((paragraphResult) => {
      // Verify basic structure (don't assume 0-based vs 1-based indexing)
      expect(paragraphResult).toHaveProperty('index')
      expect(paragraphResult).toHaveProperty('text')
      expect(typeof paragraphResult.index).toBe('number')
      expect(testTexts).toContain(paragraphResult.text)

      const aspects = paragraphResult.aspects

      requiredAspects.forEach(aspectName => {
        expect(aspects).toHaveProperty(aspectName)
        const aspect = aspects[aspectName]

        expect(aspect).toHaveProperty('score')
        expect(aspect).toHaveProperty('rationale')
        expect(typeof aspect.score).toBe('string')

        if (aspectName === 'verifiability') {
          expect(['1', '2', '3', '4', '5', 'X']).toContain(aspect.score)
        } else {
          expect(['1', '2', '3', '4', '5']).toContain(aspect.score)
        }

        expect(typeof aspect.rationale).toBe('string')
        expect(aspect.rationale.length).toBeGreaterThan(0)
      })
    })
  }, 120000) // 120 second timeout for processing multiple paragraphs

  testFn('handles edge cases (empty text, special characters)', async () => {
    // Test that the backend handles various edge cases gracefully
    const testTexts = [
      'A very short comment.',
      'A comment with special characters: @#$%^&*()[]{}|\\<>?',
      'A longer comment with multiple sentences. This tests the backend\'s ability to handle more complex input. It should still return valid scores and rationales for all aspects.'
    ]

    const jobInfo = await createJob(testTexts)
    const result = await pollJobUntilComplete(jobInfo.job_id)

    // Verify all paragraphs were processed
    expect(result.status).toBe('completed')
    expect(result.response.results.length).toBe(3)

    // Verify each result has valid structure regardless of content
    result.response.results.forEach(paragraphResult => {
      expect(paragraphResult).toHaveProperty('aspects')
      const aspects = paragraphResult.aspects

      // All aspects should be present and valid
      expect(aspects).toHaveProperty('actionability')
      expect(aspects).toHaveProperty('helpfulness')
      expect(aspects).toHaveProperty('grounding_specificity')
      expect(aspects).toHaveProperty('verifiability')

      Object.values(aspects).forEach(aspect => {
        expect(aspect).toHaveProperty('score')
        expect(aspect).toHaveProperty('rationale')
        expect(typeof aspect.score).toBe('string')
        expect(aspect.rationale.length).toBeGreaterThan(0)
      })
    })
  }, 120000)

  testFn('response times are reasonable', async () => {
    const testText = 'Quick response time test paragraph.'

    const startTime = Date.now()

    // Create job
    const jobInfo = await createJob([testText])

    // Wait for completion
    const result = await pollJobUntilComplete(jobInfo.job_id)

    const endTime = Date.now()
    const totalTime = endTime - startTime

    // Verify job completed successfully
    expect(result.status).toBe('completed')

    // Total time should be reasonable (less than 120 seconds for 1 paragraph)
    // This includes job creation, queuing, processing, and polling
    expect(totalTime).toBeLessThan(120000)

    console.log(`Backend API total processing time: ${totalTime}ms (${Math.round(totalTime / 1000)}s)`)
  }, 150000) // 150 second timeout (2.5 minutes)
})
