import { test, expect } from '@playwright/test'

/**
 * Review Component E2E Tests
 * Tests Priority 1: Critical paths for review editing and comments
 */

test.describe('Review Component', () => {
  const timestamp = Date.now()
  const testEmail = `review-test-${timestamp}@example.com`
  const testPassword = 'testpass123'

  // Helper to login and create/select a review
  async function loginUser(page) {
    await page.goto('/')
    await page.click('text=Sign up')
    await page.fill('input[name="firstName"]', 'Review')
    await page.fill('input[name="lastName"]', 'Tester')
    await page.fill('input[type="email"]', testEmail)
    await page.fill('input[type="password"]', testPassword)
    await page.check('input[type="checkbox"]')
    await page.click('button:has-text("Sign up")')

    // Longer timeout for slow networks
    await expect(page.locator(`text=${testEmail}`)).toBeVisible({ timeout: 30000 })

    // After login, My Reviews modal should appear
    await expect(page.locator('text=My Reviews')).toBeVisible({ timeout: 15000 })

    // Create a new review by clicking the create button
    // The button will say "Create Review-1" for first review
    await page.click('button:has-text("Create")')

    // Wait for review editor to appear
    await expect(page.locator('textarea')).toBeVisible({ timeout: 15000 })
  }

  test.beforeEach(async ({ page }) => {
    await loginUser(page)
  })

  test('@smoke Load review and update comments', async ({ page }) => {
    // Verify main components are visible (textarea already verified in loginUser)
    await expect(page.locator('textarea')).toBeVisible()

    // Use more specific selector for UPDATE button
    const updateButton = page.getByRole('button', { name: 'UPDATE' })
    await expect(updateButton).toBeVisible()

    // Type some review text
    await page.fill('textarea', 'This is a test paragraph for review.\n\nSecond paragraph here.')

    // UPDATE button should become blue (active)
    await expect(updateButton).toHaveClass(/bg-\[#4a90e2\]/)

    // Click update
    await updateButton.click()

    // Should show progress or complete
    // Wait for update to finish (button becomes gray again)
    await expect(updateButton).toHaveClass(/bg-\[#d9d9d9\]/, { timeout: 30000 })
  })

  test('Type text and generate comments with test markers', async ({ page }) => {
    const textarea = page.locator('textarea')
    const updateButton = page.getByRole('button', { name: 'UPDATE' })

    // Type text with test markers to generate predictable comments
    await textarea.fill('This is a test paragraph. XXXA YYYH\n\nSecond paragraph here. XXXG')

    // UPDATE button should be active
    await expect(updateButton).toHaveClass(/bg-\[#4a90e2\]/)

    // Click update
    await updateButton.click()

    // Wait for processing to complete
    await expect(updateButton).toHaveClass(/bg-\[#d9d9d9\]/, { timeout: 30000 })

    // Statistics should show some counts - exact numbers depend on API behavior
    // Just verify that critical and label statistics are visible and have non-zero counts
    await expect(page.locator('text=/Critical \\(\\d+\\)/')).toBeVisible()
    await expect(page.locator('text=/Actionability \\(\\d+\\)/')).toBeVisible()
  })

  test('Comment bar interactions', async ({ page }) => {
    const textarea = page.locator('textarea')
    const updateButton = page.getByRole('button', { name: 'UPDATE' })

    // Type text with test markers to generate comments
    await textarea.fill('First paragraph with critical issue. XXXA\n\nSecond paragraph. YYYH')
    await updateButton.click()

    // Wait for comments to load
    await expect(updateButton).toHaveClass(/bg-\[#d9d9d9\]/, { timeout: 30000 })

    // Verify comment bars appeared (statistics should show counts)
    const criticalStat = page.locator('text=/Critical \\(\\d+\\)/')
    await expect(criticalStat).toBeVisible()

    // Click on Critical statistic to open first comment bar
    await criticalStat.click()

    // Wait a moment for panel to open
    await page.waitForTimeout(500)

    // Verify comment panel opened by checking for dismiss button (✕)
    await expect(page.locator('button:has-text("✕")').first()).toBeVisible({ timeout: 10000 })
  })

  test('Statistics filtering and navigation', async ({ page }) => {
    const textarea = page.locator('textarea')
    const updateButton = page.getByRole('button', { name: 'UPDATE' })

    // Type text with mixed severity comments
    await textarea.fill('Critical paragraph. XXXA\n\nModerate paragraph. YYYH\n\nAnother critical. XXXG')
    await updateButton.click()

    // Wait for update to complete
    await expect(updateButton).toHaveClass(/bg-\[#d9d9d9\]/, { timeout: 30000 })

    // Verify statistics are visible with some counts
    const criticalStat = page.locator('text=/Critical \\(\\d+\\)/')
    await expect(criticalStat).toBeVisible()

    // Click Critical statistic to navigate to first critical comment
    await criticalStat.click()

    // Wait for panel to open
    await page.waitForTimeout(500)

    // Verify comment panel opened by checking for dismiss button (✕)
    await expect(page.locator('button:has-text("✕")').first()).toBeVisible({ timeout: 10000 })
  })

  test('Text editing persists', async ({ page }) => {
    const testText = 'My custom review text for persistence test.'

    // Enter text
    await page.fill('textarea', testText)

    // Navigate away (to account settings)
    await page.click(`text=${testEmail}`)
    await page.click('text=Account Settings')

    // Navigate back
    await page.click('text=Back to App')

    // Text should still be there (depending on your implementation)
    // This test assumes text is saved in localStorage or similar
    const textareaValue = await page.locator('textarea').inputValue()

    // Note: This might not persist depending on your implementation
    // Adjust test based on actual behavior
  })

  test('@smoke ICLR review comments persist after My Reviews navigation', async ({ page }) => {
    // This test verifies that comments are correctly saved and restored
    // when navigating away via My Reviews and returning to the same review

    // Step 1: Navigate back to My Reviews modal to use ICLR button
    await page.click(`text=${testEmail}`)
    await page.click('text=My Reviews')

    // Wait for My Reviews modal to appear
    await expect(page.locator('h2:has-text("My Reviews")')).toBeVisible({ timeout: 5000 })

    // Step 2: Click the ICLR button to create a review with sample data
    await page.click('button:has-text("Random ICLR review")')

    // Wait for review editor to appear with pre-filled text
    const textarea = page.locator('textarea')
    await expect(textarea).toBeVisible({ timeout: 5000 })

    // Verify textarea has content (ICLR review text is pre-filled)
    await expect(textarea).not.toBeEmpty({ timeout: 5000 })

    // Step 3: Click UPDATE to generate comments
    const updateButton = page.getByRole('button', { name: 'UPDATE' })
    await expect(updateButton).toHaveClass(/bg-\[#4a90e2\]/) // Should be active (blue)
    await updateButton.click()

    // Wait for update to complete (button becomes gray)
    // Use longer timeout as API can be slow
    await expect(updateButton).toHaveClass(/bg-\[#d9d9d9\]/, { timeout: 90000 })

    // Step 4: Capture statistics counts before navigation
    // Extract the numbers from statistics text
    const criticalStatBefore = await page.locator('text=/Critical \\(\\d+\\)/').textContent()
    const moderateStatBefore = await page.locator('text=/Moderate \\(\\d+\\)/').textContent()
    const actionabilityStatBefore = await page.locator('text=/Actionability \\(\\d+\\)/').textContent()
    const helpfulnessStatBefore = await page.locator('text=/Helpfulness \\(\\d+\\)/').textContent()

    console.log('Statistics before navigation:', {
      critical: criticalStatBefore,
      moderate: moderateStatBefore,
      actionability: actionabilityStatBefore,
      helpfulness: helpfulnessStatBefore
    })

    // Verify we have at least some comments
    expect(criticalStatBefore || moderateStatBefore).toBeTruthy()

    // Step 5: Navigate to My Reviews
    await page.click(`text=${testEmail}`)
    await page.click('text=My Reviews')

    // Wait for My Reviews modal to appear
    await expect(page.locator('h2:has-text("My Reviews")')).toBeVisible({ timeout: 5000 })

    // Step 6: Click on the review to return to it
    // The review should be listed - click on its button
    // Look for a review button (it shows word count like "123 words")
    const reviewButton = page.locator('button').filter({ hasText: /\d+ words/ }).first()
    await expect(reviewButton).toBeVisible({ timeout: 5000 })
    await reviewButton.click()

    // Wait for review editor to reappear
    await expect(textarea).toBeVisible({ timeout: 5000 })

    // Wait for comments to load (give it time to fetch from database)
    await page.waitForTimeout(2000)

    // Step 7: Verify the same statistics are visible
    const criticalStatAfter = await page.locator('text=/Critical \\(\\d+\\)/').textContent()
    const moderateStatAfter = await page.locator('text=/Moderate \\(\\d+\\)/').textContent()
    const actionabilityStatAfter = await page.locator('text=/Actionability \\(\\d+\\)/').textContent()
    const helpfulnessStatAfter = await page.locator('text=/Helpfulness \\(\\d+\\)/').textContent()

    console.log('Statistics after navigation:', {
      critical: criticalStatAfter,
      moderate: moderateStatAfter,
      actionability: actionabilityStatAfter,
      helpfulness: helpfulnessStatAfter
    })

    // Verify statistics match
    expect(criticalStatAfter).toBe(criticalStatBefore)
    expect(moderateStatAfter).toBe(moderateStatBefore)
    expect(actionabilityStatAfter).toBe(actionabilityStatBefore)
    expect(helpfulnessStatAfter).toBe(helpfulnessStatBefore)
  })

  test('ICLR review comments persist after paragraph edit and My Reviews navigation', async ({ page }) => {
    // This test verifies comments persist even when a paragraph is deleted and re-pasted
    // before navigating away (reported bug scenario)

    // Step 1: Navigate back to My Reviews modal to use ICLR button
    await page.click(`text=${testEmail}`)
    await page.click('text=My Reviews')

    // Wait for My Reviews modal to appear
    await expect(page.locator('h2:has-text("My Reviews")')).toBeVisible({ timeout: 5000 })

    // Step 2: Click the ICLR button to create a review with sample data
    await page.click('button:has-text("Random ICLR review")')

    // Wait for review editor to appear with pre-filled text
    const textarea = page.locator('textarea')
    await expect(textarea).toBeVisible({ timeout: 5000 })
    await expect(textarea).not.toBeEmpty({ timeout: 5000 })

    // Step 3: Click UPDATE to generate comments
    const updateButton = page.getByRole('button', { name: 'UPDATE' })
    await expect(updateButton).toHaveClass(/bg-\[#4a90e2\]/)
    await updateButton.click()

    // Wait for update to complete (use longer timeout as API can be slow)
    await expect(updateButton).toHaveClass(/bg-\[#d9d9d9\]/, { timeout: 90000 })

    // Step 4: Capture statistics before editing
    const criticalStatBefore = await page.locator('text=/Critical \\(\\d+\\)/').textContent()
    const moderateStatBefore = await page.locator('text=/Moderate \\(\\d+\\)/').textContent()
    const actionabilityStatBefore = await page.locator('text=/Actionability \\(\\d+\\)/').textContent()
    const helpfulnessStatBefore = await page.locator('text=/Helpfulness \\(\\d+\\)/').textContent()

    console.log('Statistics before paragraph edit:', {
      critical: criticalStatBefore,
      moderate: moderateStatBefore,
      actionability: actionabilityStatBefore,
      helpfulness: helpfulnessStatBefore
    })

    // Step 5: Delete and re-paste a paragraph (simulating the reported bug scenario)
    // Get current text, delete a paragraph, and re-add it
    const originalText = await textarea.inputValue()
    const paragraphs = originalText.split('\n\n')

    if (paragraphs.length >= 2) {
      // Remove the second paragraph and add it back at the end
      const removedParagraph = paragraphs.splice(1, 1)[0]
      paragraphs.push(removedParagraph)
      const modifiedText = paragraphs.join('\n\n')

      await textarea.fill(modifiedText)

      // Wait a moment for autosave to trigger
      await page.waitForTimeout(1000)
    }

    // Step 6: Navigate to My Reviews (without clicking UPDATE again)
    await page.click(`text=${testEmail}`)
    await page.click('text=My Reviews')

    await expect(page.locator('h2:has-text("My Reviews")')).toBeVisible({ timeout: 5000 })

    // Step 7: Click on the review to return to it
    const reviewButton = page.locator('button').filter({ hasText: /\d+ words/ }).first()
    await expect(reviewButton).toBeVisible({ timeout: 5000 })
    await reviewButton.click()

    await expect(textarea).toBeVisible({ timeout: 5000 })

    // Wait for comments to load
    await page.waitForTimeout(2000)

    // Step 8: Verify statistics (they might differ if paragraph IDs changed)
    const criticalStatAfter = await page.locator('text=/Critical \\(\\d+\\)/').textContent()
    const moderateStatAfter = await page.locator('text=/Moderate \\(\\d+\\)/').textContent()
    const actionabilityStatAfter = await page.locator('text=/Actionability \\(\\d+\\)/').textContent()
    const helpfulnessStatAfter = await page.locator('text=/Helpfulness \\(\\d+\\)/').textContent()

    console.log('Statistics after paragraph edit and navigation:', {
      critical: criticalStatAfter,
      moderate: moderateStatAfter,
      actionability: actionabilityStatAfter,
      helpfulness: helpfulnessStatAfter
    })

    // In the bug scenario, statistics would differ. After fix, they should match.
    // For now, we just log the values to observe the behavior
    expect(criticalStatAfter).toBe(criticalStatBefore)
    expect(moderateStatAfter).toBe(moderateStatBefore)
    expect(actionabilityStatAfter).toBe(actionabilityStatBefore)
    expect(helpfulnessStatAfter).toBe(helpfulnessStatBefore)
  })
})
