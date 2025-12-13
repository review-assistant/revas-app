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
    testFn('saves review content with paragraphs', async () => {
      const { data: paperId } = await supabase.rpc('get_or_create_paper', {
        p_title: 'Content Save Test',
        p_conference: 'Test 2025'
      })

      const { data: reviewId } = await supabase.rpc('get_or_create_review', {
        p_paper_id: paperId
      })

      const reviewContent = 'This is my full review text with multiple paragraphs.'
      const paragraphs = [
        { paragraph_id: 0, content: 'First paragraph of my review.', is_deleted: false },
        { paragraph_id: 1, content: 'Second paragraph with more details.', is_deleted: false },
        { paragraph_id: 2, content: 'Third paragraph concluding the review.', is_deleted: false }
      ]

      const { error } = await supabase.rpc('save_review_content', {
        p_review_id: reviewId,
        p_content: reviewContent,
        p_paragraphs: paragraphs
      })

      expect(error).toBeNull()

      // Verify review_items were created
      const { data: items } = await supabase
        .from('review_items')
        .select('*')
        .eq('review_id', reviewId)

      expect(items).toHaveLength(3)
      expect(items.every(item => item.content_encrypted)).toBe(true)
      expect(items.every(item => item.version === 1)).toBe(true)
    }, 10000)

    testFn('creates new version when paragraph is modified', async () => {
      const { data: paperId } = await supabase.rpc('get_or_create_paper', {
        p_title: 'Versioning Test',
        p_conference: 'Test 2025'
      })

      const { data: reviewId } = await supabase.rpc('get_or_create_review', {
        p_paper_id: paperId
      })

      // Save first version
      await supabase.rpc('save_review_content', {
        p_review_id: reviewId,
        p_content: 'Version 1',
        p_paragraphs: [
          { paragraph_id: 0, content: 'Original content', is_deleted: false }
        ]
      })

      // Save second version (modified)
      await supabase.rpc('save_review_content', {
        p_review_id: reviewId,
        p_content: 'Version 2',
        p_paragraphs: [
          { paragraph_id: 0, content: 'Modified content', is_deleted: false }
        ]
      })

      // Verify we have 2 versions
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

    testFn('loads review content correctly', async () => {
      const { data: paperId } = await supabase.rpc('get_or_create_paper', {
        p_title: 'Load Test Paper',
        p_conference: 'Test 2025'
      })

      const { data: reviewId } = await supabase.rpc('get_or_create_review', {
        p_paper_id: paperId
      })

      // Save some content
      const paragraphs = [
        { paragraph_id: 0, content: 'Load test paragraph 1', is_deleted: false },
        { paragraph_id: 1, content: 'Load test paragraph 2', is_deleted: false }
      ]

      await supabase.rpc('save_review_content', {
        p_review_id: reviewId,
        p_content: 'Load test',
        p_paragraphs: paragraphs
      })

      // Load review
      const { data: review } = await supabase
        .from('reviews')
        .select(`
          *,
          review_items (*)
        `)
        .eq('id', reviewId)
        .single()

      expect(review).toBeTruthy()
      expect(review.review_items).toHaveLength(2)
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

      // Save content first
      await supabase.rpc('save_review_content', {
        p_review_id: reviewId,
        p_content: 'Test review for scoring',
        p_paragraphs: [
          { paragraph_id: 0, content: 'Paragraph to score', is_deleted: false }
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

      // Save content
      await supabase.rpc('save_review_content', {
        p_review_id: reviewId,
        p_content: 'Test',
        p_paragraphs: [
          { paragraph_id: 0, content: 'Test paragraph', is_deleted: false }
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

      // Update score
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

      // Verify score was updated (not duplicated)
      const { data: items } = await supabase
        .from('review_items')
        .select('*, review_item_scores(*)')
        .eq('review_id', reviewId)

      const scores = items[0].review_item_scores.filter(s => s.dimension === 'Actionability')
      expect(scores).toHaveLength(1) // Should only have one score, not two
      expect(scores[0].score).toBe(5) // Should be updated value
      expect(scores[0].previous_score).toBe(3)
      expect(scores[0].score_change).toBe('improved')
    }, 10000)
  })

  describe('Review State Persistence', () => {
    testFn('review persists across sessions', async () => {
      const uniqueTitle = `Session Test ${Date.now()}`

      // Session 1: Create and save review
      const { data: paperId } = await supabase.rpc('get_or_create_paper', {
        p_title: uniqueTitle,
        p_conference: 'Test 2025'
      })

      const { data: reviewId } = await supabase.rpc('get_or_create_review', {
        p_paper_id: paperId
      })

      await supabase.rpc('save_review_content', {
        p_review_id: reviewId,
        p_content: 'Session test content',
        p_paragraphs: [
          { paragraph_id: 0, content: 'Persisted paragraph', is_deleted: false }
        ]
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

      // Verify content persisted
      const { data: review } = await supabase
        .from('reviews')
        .select('*, review_items(*)')
        .eq('id', reviewId2)
        .single()

      expect(review.review_items).toHaveLength(1)
    }, 10000)

    // Note: Locked review test requires admin privileges to set is_locked=true
    // This will be tested in Phase 4 when embargo management is implemented
    testFn.skip('locked review prevents modifications (requires admin)', async () => {
      // This test is skipped because RLS policies prevent users from locking their own reviews
      // Lock functionality will be tested when admin/embargo features are implemented
      expect(true).toBe(true)
    }, 10000)
  })
})
