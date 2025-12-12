import { test, expect } from '@playwright/test'

/**
 * Account Settings E2E Tests
 * Tests Priority 1: Critical paths for account management
 */

test.describe('Account Settings', () => {
  const timestamp = Date.now()
  const testEmail = `account-test-${timestamp}@example.com`
  const testPassword = 'testpass123'
  let newPassword = 'newpass456'

  // Helper function to create a test user and login
  async function createAndLoginUser(page) {
    await page.goto('/')
    await page.click('text=Sign up')
    await page.fill('input[name="firstName"]', 'Account')
    await page.fill('input[name="lastName"]', 'Test')
    await page.fill('input[type="email"]', testEmail)
    await page.fill('input[type="password"]', testPassword)
    await page.check('input[type="checkbox"]')
    await page.click('button:has-text("Sign up")')

    // Wait for login to complete
    await expect(page.locator(`text=${testEmail}`)).toBeVisible({ timeout: 10000 })
  }

  test('@smoke Edit profile information', async ({ page }) => {
    await createAndLoginUser(page)

    // Navigate to account settings
    await page.click(`text=${testEmail}`)
    await page.click('text=Account Settings')

    // Verify we're on the settings page
    await expect(page.locator('text=Account Settings')).toBeVisible()

    // Verify current values
    await expect(page.locator('input[id="firstName"]')).toHaveValue('Account')
    await expect(page.locator('input[id="lastName"]')).toHaveValue('Test')

    // Edit profile
    await page.fill('input[id="firstName"]', 'Updated')
    await page.fill('input[id="lastName"]', 'Name')
    await page.click('button:has-text("Save Changes")')

    // Verify success message
    await expect(page.locator('text=Profile updated successfully!')).toBeVisible()

    // Navigate back and return to settings to verify persistence
    await page.click('text=Back to App')
    await page.click(`text=${testEmail}`)
    await page.click('text=Account Settings')

    // Verify changes persisted
    await expect(page.locator('input[id="firstName"]')).toHaveValue('Updated')
    await expect(page.locator('input[id="lastName"]')).toHaveValue('Name')
  })

  test('Change password', async ({ page }) => {
    await createAndLoginUser(page)

    // Navigate to account settings
    await page.click(`text=${testEmail}`)
    await page.click('text=Account Settings')

    // Change password
    await page.fill('input[id="currentPassword"]', testPassword)
    await page.fill('input[id="newPassword"]', newPassword)
    await page.fill('input[id="confirmPassword"]', newPassword)
    await page.click('button:has-text("Change Password")')

    // Verify success
    await expect(page.locator('text=Password changed successfully!')).toBeVisible()

    // Logout
    await page.click('text=Back to App')
    await page.click(`text=${testEmail}`)
    await page.click('text=Logout')

    // Try to login with old password (should fail)
    await page.fill('input[type="email"]', testEmail)
    await page.fill('input[type="password"]', testPassword)
    await page.click('button:has-text("Sign in")')
    await expect(page.locator('text=Invalid login credentials')).toBeVisible()

    // Login with new password (should succeed)
    await page.fill('input[type="email"]', testEmail)
    await page.fill('input[type="password"]', newPassword)
    await page.click('button:has-text("Sign in")')
    await expect(page.locator(`text=${testEmail}`)).toBeVisible({ timeout: 10000 })
  })

  test('Password change validation', async ({ page }) => {
    await createAndLoginUser(page)

    await page.click(`text=${testEmail}`)
    await page.click('text=Account Settings')

    // Try with mismatched passwords
    await page.fill('input[id="currentPassword"]', testPassword)
    await page.fill('input[id="newPassword"]', 'newpass123')
    await page.fill('input[id="confirmPassword"]', 'different123')
    await page.click('button:has-text("Change Password")')

    await expect(page.locator('text=New passwords do not match')).toBeVisible()

    // Try with short password
    await page.fill('input[id="newPassword"]', '12345')
    await page.fill('input[id="confirmPassword"]', '12345')
    await page.click('button:has-text("Change Password")')

    await expect(page.locator('text=New password must be at least 6 characters')).toBeVisible()
  })

  test('@smoke Export user data (GDPR)', async ({ page }) => {
    await createAndLoginUser(page)

    await page.click(`text=${testEmail}`)
    await page.click('text=Account Settings')

    // Start download
    const downloadPromise = page.waitForEvent('download')
    await page.click('text=Download My Data')
    const download = await downloadPromise

    // Verify filename format
    expect(download.suggestedFilename()).toMatch(/revas-data-export-.*\.json/)

    // Could also verify file contents here if needed
    const path = await download.path()
    expect(path).toBeTruthy()
  })

  test('@smoke Delete account flow', async ({ page }) => {
    await createAndLoginUser(page)

    await page.click(`text=${testEmail}`)
    await page.click('text=Account Settings')

    // Open delete modal
    await page.click('text=Delete My Account')
    await expect(page.locator('text=Delete Account')).toBeVisible()

    // Verify confirmation is required
    const modalDeleteButton = page.locator('button:has-text("Delete Account")').nth(1)
    await expect(modalDeleteButton).toBeDisabled()

    // Type DELETE to enable
    await page.fill('input[placeholder="Type DELETE"]', 'DELETE')
    await expect(modalDeleteButton).toBeEnabled()

    // Delete account
    await modalDeleteButton.click()

    // Should be logged out and redirected to login
    await expect(page.locator('text=Sign in to your account')).toBeVisible({ timeout: 10000 })

    // Try to login with deleted account (should fail)
    await page.fill('input[type="email"]', testEmail)
    await page.fill('input[type="password"]', testPassword)
    await page.click('button:has-text("Sign in")')
    await expect(page.locator('text=Invalid login credentials')).toBeVisible()
  })

  test('Cancel account deletion', async ({ page }) => {
    await createAndLoginUser(page)

    await page.click(`text=${testEmail}`)
    await page.click('text=Account Settings')

    // Open delete modal
    await page.click('text=Delete My Account')
    await expect(page.locator('text=Delete Account')).toBeVisible()

    // Cancel
    await page.click('button:has-text("Cancel")')

    // Modal should close
    await expect(page.locator('text=Type DELETE to confirm')).not.toBeVisible()

    // Should still be on settings page and logged in
    await expect(page.locator('text=Account Settings')).toBeVisible()
  })
})
