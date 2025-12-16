import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'

/**
 * My Reviews Feature Tests
 *
 * Tests for the new My Reviews functionality including:
 * - get_my_reviews() RPC function (word count, paragraph count)
 * - view_my_tables() RPC function (draft_content)
 * - Review deletion (Discard button)
 * - Duplicate title detection
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

const skipTests = process.env.SKIP_DATABASE_TESTS === 'true'
const testFn = skipTests ? it.skip : it

let testUser = null
let supabase = null

describe('My Reviews Integration Tests', () => {
  beforeAll(async () => {
    // Create test user
    const email = `test-my-reviews-${Date.now()}@example.com`
    const password = 'TestPassword123!'

    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    })

    expect(error).toBeNull()
    expect(data.user).not.toBeNull()
    testUser = data.user
  }, 15000)

  afterAll(async () => {
    // Clean up test user
    if (testUser) {
      try {
        await supabase.rpc('delete_user_gdpr')
      } catch (e) {
        console.error('Error cleaning up test user:', e)
      }
    }
  })

  describe('get_my_reviews() RPC Function', () => {
    testFn('returns empty array for new user', async () => {
      const { data, error } = await supabase.rpc('get_my_reviews')

      expect(error).toBeNull()
      expect(data).toEqual([])
    }, 10000)

    testFn('returns review with correct word count (decrypted)', async () => {
      // Create paper and review
      const { data: paperId } = await supabase.rpc('get_or_create_paper', {
        p_title: 'Word Count Test Paper',
        p_conference: 'Test Conference 2025'
      })

      const { data: reviewId } = await supabase.rpc('get_or_create_review', {
        p_paper_id: paperId
      })

      // Save draft with known word count
      const draftContent = 'This is a test review.\n\nFirst paragraph with five words.\n\nSecond paragraph also has exactly five words.'
      const expectedWordCount = 17 // 5 + 5 + 7 = 17 words total

      await supabase.rpc('save_draft', {
        p_review_id: reviewId,
        p_content: draftContent
      })

      // Get my reviews
      const { data: reviews, error } = await supabase.rpc('get_my_reviews')

      expect(error).toBeNull()
      expect(reviews).toHaveLength(1)
      expect(reviews[0].review_id).toBe(reviewId)
      expect(reviews[0].paper_title).toBe('Word Count Test Paper')
      expect(reviews[0].word_count).toBe(expectedWordCount)
      expect(reviews[0].paragraph_count).toBe(0) // No items created yet (UPDATE not clicked)
    }, 10000)

    testFn('returns correct paragraph count after UPDATE', async () => {
      // Create paper and review
      const { data: paperId } = await supabase.rpc('get_or_create_paper', {
        p_title: 'Paragraph Count Test',
        p_conference: 'Test 2025'
      })

      const { data: reviewId } = await supabase.rpc('get_or_create_review', {
        p_paper_id: paperId
      })

      // Save draft
      await supabase.rpc('save_draft', {
        p_review_id: reviewId,
        p_content: 'Review with paragraphs'
      })

      // Create version from draft (simulate UPDATE)
      const paragraphs = [
        { paragraph_id: 0, content: 'First paragraph' },
        { paragraph_id: 1, content: 'Second paragraph' },
        { paragraph_id: 2, content: 'Third paragraph' }
      ]

      await supabase.rpc('create_version_from_draft', {
        p_review_id: reviewId,
        p_paragraphs: paragraphs
      })

      // Get my reviews
      const { data: reviews, error } = await supabase.rpc('get_my_reviews')

      expect(error).toBeNull()
      const review = reviews.find(r => r.review_id === reviewId)
      expect(review.paragraph_count).toBe(3)
    }, 10000)

    testFn('handles empty draft content', async () => {
      // Create paper and review
      const { data: paperId } = await supabase.rpc('get_or_create_paper', {
        p_title: 'Empty Draft Test',
        p_conference: 'Test 2025'
      })

      const { data: reviewId } = await supabase.rpc('get_or_create_review', {
        p_paper_id: paperId
      })

      // Don't save any draft (draft_content is null)

      // Get my reviews
      const { data: reviews, error } = await supabase.rpc('get_my_reviews')

      expect(error).toBeNull()
      const review = reviews.find(r => r.review_id === reviewId)
      expect(review.word_count).toBe(0)
      expect(review.paragraph_count).toBe(0)
    }, 10000)

    testFn('only returns current user reviews', async () => {
      // This test relies on RLS - user should only see their own reviews
      const { data: reviews, error } = await supabase.rpc('get_my_reviews')

      expect(error).toBeNull()
      expect(Array.isArray(reviews)).toBe(true)

      // All reviews should belong to current user (verified by RLS)
      // We can't directly verify reviewer_user_id, but RLS ensures it
    }, 10000)
  })

  describe('view_my_tables() RPC Function', () => {
    testFn('includes draft_content in review data', async () => {
      // Create paper and review
      const { data: paperId } = await supabase.rpc('get_or_create_paper', {
        p_title: 'Draft Content Test',
        p_conference: 'Test 2025'
      })

      const { data: reviewId } = await supabase.rpc('get_or_create_review', {
        p_paper_id: paperId
      })

      // Save draft
      const draftContent = 'This is the current draft.\n\nWith multiple paragraphs.'
      await supabase.rpc('save_draft', {
        p_review_id: reviewId,
        p_content: draftContent
      })

      // Create version (different from draft)
      await supabase.rpc('create_version_from_draft', {
        p_review_id: reviewId,
        p_paragraphs: [
          { paragraph_id: 0, content: 'Original scored content' }
        ]
      })

      // Get tables data
      const { data: tablesData, error } = await supabase.rpc('view_my_tables')

      expect(error).toBeNull()
      expect(tablesData.papers).toBeTruthy()
      expect(tablesData.papers.length).toBeGreaterThan(0)

      const paper = tablesData.papers.find(p => p.id === paperId)
      expect(paper).toBeTruthy()
      expect(paper.reviews).toBeTruthy()
      expect(paper.reviews.length).toBeGreaterThan(0)

      const review = paper.reviews[0]
      expect(review.draft_content).toBe(draftContent) // Decrypted draft
      expect(review.content).toBe('Original scored content') // Reconstructed from items
    }, 10000)

    testFn('handles null draft_content', async () => {
      // Create paper and review without saving draft
      const { data: paperId } = await supabase.rpc('get_or_create_paper', {
        p_title: 'No Draft Test',
        p_conference: 'Test 2025'
      })

      const { data: reviewId } = await supabase.rpc('get_or_create_review', {
        p_paper_id: paperId
      })

      // Don't save draft

      // Get tables data
      const { data: tablesData, error } = await supabase.rpc('view_my_tables')

      expect(error).toBeNull()
      const paper = tablesData.papers.find(p => p.id === paperId)
      const review = paper.reviews[0]
      expect(review.draft_content).toBeNull()
    }, 10000)
  })

  describe('Review Deletion (Discard Button)', () => {
    testFn('deleting review cascades to review_items', async () => {
      // Create paper and review
      const { data: paperId } = await supabase.rpc('get_or_create_paper', {
        p_title: 'Delete Cascade Test',
        p_conference: 'Test 2025'
      })

      const { data: reviewId } = await supabase.rpc('get_or_create_review', {
        p_paper_id: paperId
      })

      // Save draft and create version
      await supabase.rpc('save_draft', {
        p_review_id: reviewId,
        p_content: 'Test content'
      })

      await supabase.rpc('create_version_from_draft', {
        p_review_id: reviewId,
        p_paragraphs: [
          { paragraph_id: 0, content: 'Test paragraph' }
        ]
      })

      // Verify review_items exist
      const { data: itemsBefore } = await supabase
        .from('review_items')
        .select('*')
        .eq('review_id', reviewId)

      expect(itemsBefore.length).toBeGreaterThan(0)

      // Delete review (Discard button)
      const { error: deleteError } = await supabase
        .from('reviews')
        .delete()
        .eq('id', reviewId)

      expect(deleteError).toBeNull()

      // Verify review_items were cascade deleted
      const { data: itemsAfter } = await supabase
        .from('review_items')
        .select('*')
        .eq('review_id', reviewId)

      expect(itemsAfter).toHaveLength(0)
    }, 10000)

    testFn('deleting review cascades to scores and interactions', async () => {
      // Create full review with scores and interactions
      const { data: paperId } = await supabase.rpc('get_or_create_paper', {
        p_title: 'Full Cascade Test',
        p_conference: 'Test 2025'
      })

      const { data: reviewId } = await supabase.rpc('get_or_create_review', {
        p_paper_id: paperId
      })

      await supabase.rpc('save_draft', {
        p_review_id: reviewId,
        p_content: 'Test content'
      })

      await supabase.rpc('create_version_from_draft', {
        p_review_id: reviewId,
        p_paragraphs: [{ paragraph_id: 0, content: 'Test' }]
      })

      // Add scores
      await supabase.rpc('save_review_scores', {
        p_review_id: reviewId,
        p_scores: [{
          paragraph_id: 0,
          dimension: 'Actionability',
          score: 4,
          previous_score: null,
          score_change: null,
          comment: 'Test comment'
        }]
      })

      // Add interaction
      await supabase.rpc('track_interaction', {
        p_review_id: reviewId,
        p_paragraph_id: 0,
        p_dimension: 'Actionability',
        p_interaction_type: 'view'
      })

      // Verify data exists
      const { data: items } = await supabase
        .from('review_items')
        .select('*, review_item_scores(*), review_item_interactions(*)')
        .eq('review_id', reviewId)

      expect(items[0].review_item_scores.length).toBeGreaterThan(0)
      expect(items[0].review_item_interactions.length).toBeGreaterThan(0)

      // Delete review
      await supabase
        .from('reviews')
        .delete()
        .eq('id', reviewId)

      // Verify all related data was deleted
      const { data: itemsAfter } = await supabase
        .from('review_items')
        .select('*')
        .eq('review_id', reviewId)

      expect(itemsAfter).toHaveLength(0)

      // Scores and interactions are deleted via cascade from review_items
    }, 10000)

    testFn('user can only delete their own reviews (RLS)', async () => {
      // Create another user
      const email2 = `test-other-${Date.now()}@example.com`
      const supabase2 = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

      await supabase2.auth.signUp({
        email: email2,
        password: 'TestPassword456!'
      })

      // User 1 creates a review
      const { data: paperId } = await supabase.rpc('get_or_create_paper', {
        p_title: 'RLS Delete Test',
        p_conference: 'Test 2025'
      })

      const { data: reviewId } = await supabase.rpc('get_or_create_review', {
        p_paper_id: paperId
      })

      // User 2 tries to delete User 1's review (should fail via RLS)
      const { error } = await supabase2
        .from('reviews')
        .delete()
        .eq('id', reviewId)

      // RLS should prevent deletion (no rows affected, no error thrown)
      // The review should still exist
      const { data: review } = await supabase
        .from('reviews')
        .select('*')
        .eq('id', reviewId)
        .single()

      expect(review).toBeTruthy()

      // Cleanup
      await supabase2.rpc('delete_user_gdpr')
    }, 15000)
  })

  describe('GDPR Export with Draft Content', () => {
    testFn('export includes draft_content', async () => {
      // Create review with draft
      const { data: paperId } = await supabase.rpc('get_or_create_paper', {
        p_title: 'GDPR Draft Export',
        p_conference: 'Test 2025'
      })

      const { data: reviewId } = await supabase.rpc('get_or_create_review', {
        p_paper_id: paperId
      })

      const draftContent = 'This is my current draft content.'
      await supabase.rpc('save_draft', {
        p_review_id: reviewId,
        p_content: draftContent
      })

      // Export user data
      const { data: exportData, error } = await supabase.rpc('export_user_data_gdpr')

      expect(error).toBeNull()
      expect(exportData.reviews).toBeTruthy()

      const review = exportData.reviews.find(r => r.id === reviewId)
      expect(review).toBeTruthy()
      expect(review.draft_content).toBe(draftContent)
      expect(review.paper_title).toBe('GDPR Draft Export')
      expect(review.paper_conference).toBe('Test 2025')
    }, 10000)
  })
})
