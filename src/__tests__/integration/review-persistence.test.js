import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'

/**
 * Review Persistence Integration Tests
 *
 * Tests the review persistence functionality implemented in Phase 2.
 * These tests verify that reviews can be created, saved, loaded, and scored
 * correctly through the database RPC functions.
 *
 * Tests covered:
 * - Paper creation and matching
 * - Review creation for papers
 * - Saving review content with paragraphs
 * - Loading review content
 * - Saving scores after updates
 * - Review state persistence across sessions
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

// Skip these tests if SKIP_PERSISTENCE_TESTS env var is set
const skipTests = process.env.SKIP_PERSISTENCE_TESTS === 'true'
const testFn = skipTests ? it.skip : it

// Test user and client
let testUser = null
let supabase = null

describe('Review Persistence Tests', () => {
  beforeAll(async () => {
    // Create test user
    const email = `test-persistence-${Date.now()}@example.com`
    const password = 'TestPassword123!'

    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    })

    expect(error).toBeNull()
    expect(data.user).not.toBeNull()
    testUser = data.user
  })

  afterAll(async () => {
    // Clean up test user
    if (testUser && supabase) {
      try {
        const { error } = await supabase.rpc('delete_user_gdpr')
        if (error) console.error('Failed to cleanup user:', error)
      } catch (e) {
        console.error('Error cleaning up user:', e)
      }
    }
  })

  describe('Paper Management', () => {
    testFn('creates new paper with title and conference', async () => {
      const { data: paperId, error } = await supabase.rpc('get_or_create_paper', {
        p_title: 'Test Paper for Persistence',
        p_conference: 'Test Conference 2025'
      })

      expect(error).toBeNull()
      expect(paperId).toBeTruthy()
      expect(typeof paperId).toBe('string')
    }, 10000)

    testFn('returns existing paper on exact match', async () => {
      const title = `Unique Paper ${Date.now()}`
      const conference = 'ICML 2025'

      // Create first
      const { data: paperId1 } = await supabase.rpc('get_or_create_paper', {
        p_title: title,
        p_conference: conference
      })

      // Create again - should return same ID
      const { data: paperId2 } = await supabase.rpc('get_or_create_paper', {
        p_title: title,
        p_conference: conference
      })

      expect(paperId1).toBe(paperId2)
    }, 10000)

    testFn('creates paper with null values', async () => {
      const { data: paperId, error } = await supabase.rpc('get_or_create_paper', {
        p_title: null,
        p_conference: null
      })

      expect(error).toBeNull()
      expect(paperId).toBeTruthy()
    }, 10000)
  })

  describe('Review Creation', () => {
    testFn('creates review for paper', async () => {
      // Create paper first
      const { data: paperId } = await supabase.rpc('get_or_create_paper', {
        p_title: 'Review Test Paper',
        p_conference: 'Test 2025'
      })

      // Create review
      const { data: reviewId, error } = await supabase.rpc('get_or_create_review', {
        p_paper_id: paperId
      })

      expect(error).toBeNull()
      expect(reviewId).toBeTruthy()

      // Verify review exists
      const { data: review } = await supabase
        .from('reviews')
        .select('*')
        .eq('id', reviewId)
        .single()

      expect(review.paper_id).toBe(paperId)
      expect(review.reviewer_user_id).toBe(testUser.id)
      expect(review.is_locked).toBe(false)
    }, 10000)

    testFn('returns existing review for same paper and user', async () => {
      const { data: paperId } = await supabase.rpc('get_or_create_paper', {
        p_title: `Unique Review Paper ${Date.now()}`,
        p_conference: 'Test 2025'
      })

      // Create first time
      const { data: reviewId1 } = await supabase.rpc('get_or_create_review', {
        p_paper_id: paperId
      })

      // Create again - should return same ID
      const { data: reviewId2 } = await supabase.rpc('get_or_create_review', {
        p_paper_id: paperId
      })

      expect(reviewId1).toBe(reviewId2)
    }, 10000)
  })

  describe('Review Content Persistence', () => {
    testFn('saves draft and creates version with paragraphs', async () => {
      const { data: paperId } = await supabase.rpc('get_or_create_paper', {
        p_title: 'Content Save Test',
        p_conference: 'Test 2025'
      })

      const { data: reviewId } = await supabase.rpc('get_or_create_review', {
        p_paper_id: paperId
      })

      const reviewContent = 'First paragraph of my review.\n\nSecond paragraph with more details.\n\nThird paragraph concluding the review.'

      // Save draft (autosave)
      const { error: draftError } = await supabase.rpc('save_draft', {
        p_review_id: reviewId,
        p_content: reviewContent
      })

      expect(draftError).toBeNull()

      // Create version from draft (simulates UPDATE)
      const paragraphs = [
        { paragraph_id: 0, content: 'First paragraph of my review.' },
        { paragraph_id: 1, content: 'Second paragraph with more details.' },
        { paragraph_id: 2, content: 'Third paragraph concluding the review.' }
      ]

      const { data: version, error: versionError } = await supabase.rpc('create_version_from_draft', {
        p_review_id: reviewId,
        p_paragraphs: paragraphs
      })

      expect(versionError).toBeNull()
      expect(version).toBe(1)

      // Verify review_items were created
      const { data: items } = await supabase
        .from('review_items')
        .select('*')
        .eq('review_id', reviewId)

      expect(items).toHaveLength(3)
      expect(items.every(item => item.content_encrypted)).toBe(true)
      expect(items.every(item => item.version === 1)).toBe(true)
    }, 10000)

    testFn('creates new version only on UPDATE, not on autosave', async () => {
      const { data: paperId } = await supabase.rpc('get_or_create_paper', {
        p_title: 'Versioning Test',
        p_conference: 'Test 2025'
      })

      const { data: reviewId } = await supabase.rpc('get_or_create_review', {
        p_paper_id: paperId
      })

      // Autosave draft multiple times (should NOT create versions)
      await supabase.rpc('save_draft', {
        p_review_id: reviewId,
        p_content: 'Draft v1\n\nOriginal content'
      })

      await supabase.rpc('save_draft', {
        p_review_id: reviewId,
        p_content: 'Draft v2\n\nOriginal content - edited'
      })

      // No versions should exist yet
      const { data: itemsBefore } = await supabase
        .from('review_items')
        .select('*')
        .eq('review_id', reviewId)

      expect(itemsBefore).toHaveLength(0)

      // Create first version (UPDATE)
      const { data: v1 } = await supabase.rpc('create_version_from_draft', {
        p_review_id: reviewId,
        p_paragraphs: [
          { paragraph_id: 0, content: 'Original content - edited' }
        ]
      })

      expect(v1).toBe(1)

      // Edit draft again (autosave - should NOT create version)
      await supabase.rpc('save_draft', {
        p_review_id: reviewId,
        p_content: 'Draft v3\n\nModified content'
      })

      // Create second version (UPDATE)
      const { data: v2 } = await supabase.rpc('create_version_from_draft', {
        p_review_id: reviewId,
        p_paragraphs: [
          { paragraph_id: 0, content: 'Modified content' }
        ]
      })

      expect(v2).toBe(2)

      // Verify we have exactly 2 versions
      const { data: items } = await supabase
        .from('review_items')
        .select('*')
        .eq('review_id', reviewId)
        .eq('paragraph_id', 0)
        .order('version', { ascending: true })

      expect(items).toHaveLength(2)
      expect(items[0].version).toBe(1)
      expect(items[1].version).toBe(2)
    }, 10000)

    testFn('loads draft and scored versions correctly', async () => {
      const { data: paperId } = await supabase.rpc('get_or_create_paper', {
        p_title: 'Load Test Paper',
        p_conference: 'Test 2025'
      })

      const { data: reviewId } = await supabase.rpc('get_or_create_review', {
        p_paper_id: paperId
      })

      // Save draft
      await supabase.rpc('save_draft', {
        p_review_id: reviewId,
        p_content: 'Load test paragraph 1\n\nLoad test paragraph 2 - modified'
      })

      // Create version (scored snapshot)
      await supabase.rpc('create_version_from_draft', {
        p_review_id: reviewId,
        p_paragraphs: [
          { paragraph_id: 0, content: 'Load test paragraph 1' },
          { paragraph_id: 1, content: 'Load test paragraph 2' }
        ]
      })

      // Edit draft again (simulates editing after UPDATE)
      await supabase.rpc('save_draft', {
        p_review_id: reviewId,
        p_content: 'Load test paragraph 1\n\nLoad test paragraph 2 - modified'
      })

      // Load review with draft
      const { data: review, error } = await supabase.rpc('load_review_with_draft', {
        p_review_id: reviewId
      })

      expect(error).toBeNull()
      expect(review).toBeTruthy()
      expect(review.draft_content).toBe('Load test paragraph 1\n\nLoad test paragraph 2 - modified')
      expect(review.paragraphs).toHaveLength(2)
      expect(review.paragraphs[0].content).toBe('Load test paragraph 1') // Last scored
      expect(review.paragraphs[1].content).toBe('Load test paragraph 2') // Last scored
      expect(review.is_locked).toBe(false)
    }, 10000)
  })

  describe('Score Persistence', () => {
    testFn('saves scores for review items', async () => {
      const { data: paperId } = await supabase.rpc('get_or_create_paper', {
        p_title: 'Score Save Test',
        p_conference: 'Test 2025'
      })

      const { data: reviewId } = await supabase.rpc('get_or_create_review', {
        p_paper_id: paperId
      })

      // Save draft
      await supabase.rpc('save_draft', {
        p_review_id: reviewId,
        p_content: 'Test review for scoring\n\nParagraph to score'
      })

      // Create version (UPDATE)
      await supabase.rpc('create_version_from_draft', {
        p_review_id: reviewId,
        p_paragraphs: [
          { paragraph_id: 0, content: 'Paragraph to score' }
        ]
      })

      // Save scores
      const scores = [
        {
          paragraph_id: 0,
          dimension: 'Actionability',
          score: 4,
          previous_score: null,
          score_change: null,
          comment: 'Good actionable feedback'
        },
        {
          paragraph_id: 0,
          dimension: 'Helpfulness',
          score: 5,
          previous_score: null,
          score_change: null,
          comment: 'Very helpful'
        }
      ]

      const { error } = await supabase.rpc('save_review_scores', {
        p_review_id: reviewId,
        p_scores: scores
      })

      expect(error).toBeNull()

      // Verify scores were saved
      const { data: items } = await supabase
        .from('review_items')
        .select('*, review_item_scores(*)')
        .eq('review_id', reviewId)

      expect(items[0].review_item_scores).toHaveLength(2)

      const actionability = items[0].review_item_scores.find(s => s.dimension === 'Actionability')
      expect(actionability.score).toBe(4)

      const helpfulness = items[0].review_item_scores.find(s => s.dimension === 'Helpfulness')
      expect(helpfulness.score).toBe(5)
    }, 10000)

    testFn('updates existing scores when called again', async () => {
      const { data: paperId } = await supabase.rpc('get_or_create_paper', {
        p_title: 'Score Update Test',
        p_conference: 'Test 2025'
      })

      const { data: reviewId } = await supabase.rpc('get_or_create_review', {
        p_paper_id: paperId
      })

      // Save draft and create first version
      await supabase.rpc('save_draft', {
        p_review_id: reviewId,
        p_content: 'Test\n\nTest paragraph'
      })

      await supabase.rpc('create_version_from_draft', {
        p_review_id: reviewId,
        p_paragraphs: [
          { paragraph_id: 0, content: 'Test paragraph' }
        ]
      })

      // Save initial score
      await supabase.rpc('save_review_scores', {
        p_review_id: reviewId,
        p_scores: [{
          paragraph_id: 0,
          dimension: 'Actionability',
          score: 3,
          previous_score: null,
          score_change: null,
          comment: 'Initial score'
        }]
      })

      // Edit draft and create second version
      await supabase.rpc('save_draft', {
        p_review_id: reviewId,
        p_content: 'Test\n\nTest paragraph - improved'
      })

      await supabase.rpc('create_version_from_draft', {
        p_review_id: reviewId,
        p_paragraphs: [
          { paragraph_id: 0, content: 'Test paragraph - improved' }
        ]
      })

      // Update score for new version
      await supabase.rpc('save_review_scores', {
        p_review_id: reviewId,
        p_scores: [{
          paragraph_id: 0,
          dimension: 'Actionability',
          score: 5,
          previous_score: 3,
          score_change: 'improved',
          comment: 'Updated score'
        }]
      })

      // Verify latest version has updated score
      const { data: items } = await supabase
        .from('review_items')
        .select('*, review_item_scores(*)')
        .eq('review_id', reviewId)
        .eq('version', 2)

      expect(items).toHaveLength(1)
      const scores = items[0].review_item_scores.filter(s => s.dimension === 'Actionability')
      expect(scores).toHaveLength(1)
      expect(scores[0].score).toBe(5)
      expect(scores[0].previous_score).toBe(3)
      expect(scores[0].score_change).toBe('improved')
    }, 10000)
  })

  describe('Review State Persistence', () => {
    testFn('review draft and versions persist across sessions', async () => {
      const uniqueTitle = `Session Test ${Date.now()}`

      // Session 1: Create and save review
      const { data: paperId } = await supabase.rpc('get_or_create_paper', {
        p_title: uniqueTitle,
        p_conference: 'Test 2025'
      })

      const { data: reviewId } = await supabase.rpc('get_or_create_review', {
        p_paper_id: paperId
      })

      // Save draft
      await supabase.rpc('save_draft', {
        p_review_id: reviewId,
        p_content: 'Session test content\n\nPersisted paragraph - edited'
      })

      // Create version
      await supabase.rpc('create_version_from_draft', {
        p_review_id: reviewId,
        p_paragraphs: [
          { paragraph_id: 0, content: 'Persisted paragraph' }
        ]
      })

      // Edit draft again
      await supabase.rpc('save_draft', {
        p_review_id: reviewId,
        p_content: 'Session test content\n\nPersisted paragraph - edited'
      })

      // Session 2: Load same review (simulate page refresh)
      const { data: paperId2 } = await supabase.rpc('get_or_create_paper', {
        p_title: uniqueTitle,
        p_conference: 'Test 2025'
      })

      expect(paperId2).toBe(paperId) // Should get same paper

      const { data: reviewId2 } = await supabase.rpc('get_or_create_review', {
        p_paper_id: paperId2
      })

      expect(reviewId2).toBe(reviewId) // Should get same review

      // Load review with draft
      const { data: review } = await supabase.rpc('load_review_with_draft', {
        p_review_id: reviewId2
      })

      expect(review.draft_content).toBe('Session test content\n\nPersisted paragraph - edited')
      expect(review.paragraphs).toHaveLength(1)
      expect(review.paragraphs[0].content).toBe('Persisted paragraph')
    }, 10000)

    // Note: Locked review test requires admin privileges to set is_locked=true
    // This will be tested in Phase 4 when embargo management is implemented
    testFn.skip('locked review prevents modifications (requires admin)', async () => {
      // This test is skipped because RLS policies prevent users from locking their own reviews
      // Lock functionality will be tested when admin/embargo features are implemented
      expect(true).toBe(true)
    }, 10000)
  })

  describe('Option A: Draft/Version Separation', () => {
    testFn('draft exists independently of versions', async () => {
      const { data: paperId } = await supabase.rpc('get_or_create_paper', {
        p_title: 'Draft Independence Test',
        p_conference: 'Test 2025'
      })

      const { data: reviewId } = await supabase.rpc('get_or_create_review', {
        p_paper_id: paperId
      })

      // Save draft without creating version
      await supabase.rpc('save_draft', {
        p_review_id: reviewId,
        p_content: 'This is just a draft, no version created yet'
      })

      // Load review
      const { data: review } = await supabase.rpc('load_review_with_draft', {
        p_review_id: reviewId
      })

      // Draft exists but no versions
      expect(review.draft_content).toBe('This is just a draft, no version created yet')
      expect(review.paragraphs).toBeNull() // Or empty array depending on implementation

      // Verify no review_items exist
      const { data: items } = await supabase
        .from('review_items')
        .select('*')
        .eq('review_id', reviewId)

      expect(items).toHaveLength(0)
    }, 10000)

    testFn('draft can differ from latest version', async () => {
      const { data: paperId } = await supabase.rpc('get_or_create_paper', {
        p_title: 'Draft Divergence Test',
        p_conference: 'Test 2025'
      })

      const { data: reviewId } = await supabase.rpc('get_or_create_review', {
        p_paper_id: paperId
      })

      // Save draft and create version
      await supabase.rpc('save_draft', {
        p_review_id: reviewId,
        p_content: 'Original paragraph content'
      })

      await supabase.rpc('create_version_from_draft', {
        p_review_id: reviewId,
        p_paragraphs: [
          { paragraph_id: 0, content: 'Original paragraph content' }
        ]
      })

      // Edit draft (but don't create new version)
      await supabase.rpc('save_draft', {
        p_review_id: reviewId,
        p_content: 'EDITED paragraph content - not yet scored'
      })

      // Load review
      const { data: review } = await supabase.rpc('load_review_with_draft', {
        p_review_id: reviewId
      })

      // Draft is different from latest version
      expect(review.draft_content).toBe('EDITED paragraph content - not yet scored')
      expect(review.paragraphs[0].content).toBe('Original paragraph content')
    }, 10000)

    testFn('multiple autosaves overwrite draft without creating versions', async () => {
      const { data: paperId } = await supabase.rpc('get_or_create_paper', {
        p_title: 'Multiple Autosaves Test',
        p_conference: 'Test 2025'
      })

      const { data: reviewId } = await supabase.rpc('get_or_create_review', {
        p_paper_id: paperId
      })

      // Autosave 5 times
      for (let i = 1; i <= 5; i++) {
        await supabase.rpc('save_draft', {
          p_review_id: reviewId,
          p_content: `Draft iteration ${i}`
        })
      }

      // Load review
      const { data: review } = await supabase.rpc('load_review_with_draft', {
        p_review_id: reviewId
      })

      // Only latest draft exists
      expect(review.draft_content).toBe('Draft iteration 5')

      // No versions created
      const { data: items } = await supabase
        .from('review_items')
        .select('*')
        .eq('review_id', reviewId)

      expect(items).toHaveLength(0)
    }, 10000)

    testFn('load_review_with_draft returns both draft and scored versions', async () => {
      const { data: paperId } = await supabase.rpc('get_or_create_paper', {
        p_title: 'Load Both Test',
        p_conference: 'Test 2025'
      })

      const { data: reviewId } = await supabase.rpc('get_or_create_review', {
        p_paper_id: paperId
      })

      // Create first version with scores
      await supabase.rpc('save_draft', {
        p_review_id: reviewId,
        p_content: 'Para 1\n\nPara 2'
      })

      await supabase.rpc('create_version_from_draft', {
        p_review_id: reviewId,
        p_paragraphs: [
          { paragraph_id: 0, content: 'Para 1' },
          { paragraph_id: 1, content: 'Para 2' }
        ]
      })

      await supabase.rpc('save_review_scores', {
        p_review_id: reviewId,
        p_scores: [{
          paragraph_id: 0,
          dimension: 'Actionability',
          score: 4,
          previous_score: null,
          score_change: null,
          comment: 'Good'
        }]
      })

      // Edit draft again
      await supabase.rpc('save_draft', {
        p_review_id: reviewId,
        p_content: 'Para 1 - edited\n\nPara 2 - also edited'
      })

      // Load review
      const { data: review } = await supabase.rpc('load_review_with_draft', {
        p_review_id: reviewId
      })

      // Draft has edited content
      expect(review.draft_content).toBe('Para 1 - edited\n\nPara 2 - also edited')

      // Paragraphs have original scored content
      expect(review.paragraphs).toHaveLength(2)
      expect(review.paragraphs[0].content).toBe('Para 1')
      expect(review.paragraphs[0].scores.Actionability.score).toBe(4)
    }, 10000)

    testFn('version numbers increment only on create_version_from_draft', async () => {
      const { data: paperId } = await supabase.rpc('get_or_create_paper', {
        p_title: 'Version Increment Test',
        p_conference: 'Test 2025'
      })

      const { data: reviewId } = await supabase.rpc('get_or_create_review', {
        p_paper_id: paperId
      })

      // Create 3 versions with drafts in between
      for (let i = 1; i <= 3; i++) {
        // Multiple autosaves before UPDATE
        await supabase.rpc('save_draft', {
          p_review_id: reviewId,
          p_content: `Version ${i} - draft 1`
        })

        await supabase.rpc('save_draft', {
          p_review_id: reviewId,
          p_content: `Version ${i} - draft 2`
        })

        // UPDATE creates version
        const { data: version } = await supabase.rpc('create_version_from_draft', {
          p_review_id: reviewId,
          p_paragraphs: [
            { paragraph_id: 0, content: `Version ${i} content` }
          ]
        })

        expect(version).toBe(i)
      }

      // Verify we have exactly 3 versions
      const { data: items } = await supabase
        .from('review_items')
        .select('*')
        .eq('review_id', reviewId)
        .eq('paragraph_id', 0)

      expect(items).toHaveLength(3)
      expect(items.map(i => i.version).sort()).toEqual([1, 2, 3])
    }, 10000)
  })
})
