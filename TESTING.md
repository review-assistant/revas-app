# Testing Guide for Revas

This guide provides comprehensive testing procedures for all features of the Revas application, including both automated and manual testing.

## Quick Start

### Run All Tests
```bash
# Unit tests
npm test

# Unit tests with coverage
npm run test:coverage

# E2E tests
npm run test:e2e

# Smoke tests only (deployment verification)
npm run test:smoke
```

### Test Categories

1. **Unit Tests** - Fast component and function tests
2. **Integration Tests** - Tests with real Supabase interactions
3. **E2E Tests** - Full user journey tests in browser
4. **Smoke Tests** - Critical deployment verification tests

## Prerequisites

- Node.js 18+ and npm
- Local Supabase instance running (`supabase start`)
- For E2E tests: Playwright browsers installed (`npx playwright install`)

---

# Automated Testing

## Unit Tests

Unit tests use **Vitest** and **React Testing Library** to test components in isolation.

### Running Unit Tests

```bash
# Run tests in watch mode
npm test

# Run tests once
npm run test:run

# Run with UI
npm run test:ui

# Run with coverage
npm run test:coverage
```

### Writing Unit Tests

Tests are located next to their source files with `.test.jsx` extension:
```
src/
  ├── AuthComponent.jsx
  ├── AuthComponent.test.jsx
  ├── AccountSettings.jsx
  └── AccountSettings.test.jsx
```

Example:
```javascript
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import MyComponent from './MyComponent'

describe('MyComponent', () => {
  it('renders correctly', () => {
    render(<MyComponent />)
    expect(screen.getByText('Hello')).toBeInTheDocument()
  })
})
```

### Test Coverage

View coverage report:
```bash
npm run test:coverage
open coverage/index.html
```

**Coverage Goals:**
- Critical paths: 80-90%
- Components: 70-80%
- Utilities: 90%+

## Integration Tests

Integration tests verify interactions with real Supabase database.

### Prerequisites
- Local Supabase running: `supabase start`
- Test database should be isolated from development data

### Running Integration Tests

```bash
# Run all tests including integration
npm test

# Skip integration tests (faster for development)
SKIP_INTEGRATION_TESTS=true npm test
```

### Integration Test Locations

Integration tests are marked with `.integration.test.jsx`:
```
src/
  ├── AuthContext.jsx
  └── AuthContext.integration.test.jsx
```

**Note:** Integration tests are slower and require Supabase to be running.

## E2E Tests

E2E tests use **Playwright** to test complete user workflows in a real browser.

### Setup

Install Playwright browsers (first time only):
```bash
npx playwright install
```

### Running E2E Tests

```bash
# Run all E2E tests
npm run test:e2e

# Run with UI (interactive mode)
npm run test:e2e:ui

# Run in debug mode
npm run test:e2e:debug

# Run only smoke tests
npm run test:smoke
```

### E2E Test Locations

E2E tests are in the `e2e/` directory:
```
e2e/
  ├── auth.spec.js
  ├── account-settings.spec.js
  └── review.spec.js
```

### Writing E2E Tests

Example:
```javascript
import { test, expect } from '@playwright/test'

test('user can login', async ({ page }) => {
  await page.goto('/')
  await page.fill('input[type="email"]', 'test@example.com')
  await page.fill('input[type="password"]', 'password123')
  await page.click('button:has-text("Sign in")')

  await expect(page.locator('text=Edit your review')).toBeVisible()
})
```

### Debugging E2E Tests

**View test output:**
```bash
npx playwright show-report
```

**Screenshots and videos:**
Failed tests automatically save:
- Screenshots: `test-results/[test-name]/test-failed-1.png`
- Videos: `test-results/videos/[test-name].webm`

**Debug mode:**
```bash
npm run test:e2e:debug
```
Opens browser with Playwright Inspector for step-through debugging.

## Smoke Tests for Deployment

**Critical subset of E2E tests** that verify core functionality after deployment.

See [SMOKE-TESTS.md](SMOKE-TESTS.md) for complete guide.

### Quick Reference

```bash
# Run smoke tests
npm run test:smoke

# Run against staging
BASE_URL=https://staging.yourapp.com npm run test:smoke

# Run against production
BASE_URL=https://production.yourapp.com npm run test:smoke
```

### Smoke Tests Include:
- ✅ User signup → login → logout
- ✅ Edit profile information
- ✅ Export user data (GDPR)
- ✅ Delete account
- ✅ Load review and update comments

**Expected duration:** 3-4 minutes

---

# Manual Testing

The sections below provide detailed manual testing procedures for comprehensive verification.

## Authentication Testing

### Sign Up

1. Navigate to the application (should show login/signup screen)
2. Click "Don't have an account? Sign up"
3. Enter test credentials:
   - First Name: Test
   - Last Name: User
   - Email: test@example.com (must be valid format)
   - Password: password123 (minimum 6 characters)
4. Check the terms acceptance checkbox
5. Click "Sign up"
6. **Expected Result:**
   - Success message appears
   - Automatically logged in and redirected to main app
   - Account dropdown appears in upper right with email

**Error Cases to Test:**
- Empty fields → "Please enter your first and last name"
- Invalid email → "Please enter a valid email address"
- Password < 6 chars → "Password must be at least 6 characters"
- Unchecked terms → "You must accept the terms and privacy policy"

### Login

1. If logged in, logout first
2. Enter existing credentials
3. Click "Sign in"
4. **Expected Result:**
   - Logged in successfully
   - Redirected to main app
   - Last login timestamp updated in database

**Error Cases to Test:**
- Wrong password → "Invalid login credentials"
- Non-existent email → "Invalid login credentials"

### Session Persistence

1. Login to the application
2. Refresh the page
3. **Expected Result:** Still logged in
4. Close browser tab
5. Reopen application
6. **Expected Result:** Still logged in (within JWT expiry)

### Logout

1. While logged in, click account dropdown (upper right)
2. Click "Logout"
3. **Expected Result:**
   - Returned to login screen
   - Session cleared

## Account Management Testing

### Access Account Settings

1. Login to application
2. Click account dropdown in upper right
3. Click "Account Settings"
4. **Expected Result:**
   - Account Settings page appears
   - First name, last name, and email are pre-filled
   - Email field is disabled (read-only)

### Edit Profile

1. In Account Settings, modify first name and/or last name
2. Click "Save Changes"
3. **Expected Result:**
   - Success message: "Profile updated successfully!"
   - Database updated (verify in Supabase Studio)
4. Click "← Back to App"
5. Return to Account Settings
6. **Expected Result:** Changes persisted

**Error Cases to Test:**
- Clear both name fields → "Please enter both first and last name"

### Change Password

1. In Account Settings, scroll to "Change Password" section
2. Enter current password
3. Enter new password (min 6 chars)
4. Enter same password in confirm field
5. Click "Change Password"
6. **Expected Result:**
   - Success message: "Password changed successfully!"
   - Password fields cleared
   - Still logged in
7. Logout and login with new password
8. **Expected Result:** Login succeeds

**Error Cases to Test:**
- Wrong current password → "Current password is incorrect"
- New password < 6 chars → "New password must be at least 6 characters"
- Passwords don't match → "New passwords do not match"
- Empty fields → "Please fill in all password fields"

### Export Data (GDPR)

1. In Account Settings, scroll to "Export Your Data" section
2. Click "Download My Data"
3. **Expected Result:**
   - JSON file downloads: `revas-data-export-YYYY-MM-DD.json`
   - File contains user email, profile data, export timestamp
4. Open JSON file and verify structure:
   ```json
   {
     "user": {
       "id": "...",
       "email": "...",
       "created_at": "..."
     },
     "profile": {
       "first_name": "...",
       "last_name": "...",
       ...
     },
     "export_date": "..."
   }
   ```

### Delete Account (GDPR)

⚠️ **Warning:** This permanently deletes the account. Use test accounts only.

1. In Account Settings, scroll to "Danger Zone"
2. Click "Delete My Account"
3. **Expected Result:** Confirmation modal appears
4. Try clicking "Delete Account" without typing → Button is disabled
5. Type "DELETE" in the input field
6. **Expected Result:** Delete button becomes enabled
7. Click "Delete Account"
8. **Expected Result:**
   - Account deleted from database
   - Profile deleted (cascade)
   - Automatically logged out
   - Redirected to login screen
9. Try to login with deleted credentials
10. **Expected Result:** Login fails

**Error Cases to Test:**
- Type something other than "DELETE" → "Please type DELETE to confirm"
- Cancel button → Modal closes, account not deleted

## Review Component Testing

### Text Editing

1. Type or paste text into the textarea
2. **Expected Result:**
   - Height adjusts automatically
   - UPDATE button turns blue when text is modified
   - Paragraphs are separated by blank lines

### Update Comments

1. Modify text in textarea
2. Click blue "UPDATE" button
3. **Expected Result:**
   - Comments refresh based on new text
   - Button returns to gray (inactive)
   - Comment bars realign with new paragraphs
   - Statistics update

### Comment Bars

1. Observe comment bars on right edge of textarea
2. **Expected Result:**
   - Red bars for critical issues (scores 1-2)
   - Yellow bars for suggestions (scores 3-4)
   - Green indicator for paragraphs with no visible comments (all scores 5)
   - Closed comment bars show crosshatch pattern (50% opacity)
   - Aligned with paragraph boundaries

### View Comments

1. Click on a comment bar
2. **Expected Result:**
   - Comment panel slides out from right
   - Shows all feedback labels for that paragraph
   - Red-labeled comments appear first, then yellow
   - Panel is vertically centered on the comment bar
3. Click another comment bar
4. **Expected Result:**
   - First panel closes
   - New panel opens (only one open at a time)
5. Click the open comment bar again
6. **Expected Result:** Panel closes

### Comment Dismissal

1. Open a comment panel
2. Click the "×" on individual comment labels
3. **Expected Result:**
   - Comment label is hidden
   - Persists across updates (dismissed comments stay hidden)
   - If all comments dismissed, paragraph shows green indicator
4. Refresh page
5. **Expected Result:** Dismissed comments remain hidden (persisted)

### Test Markers

Test the special marker system for forcing specific scores:

1. Type a paragraph with test marker: `This is a test. XXXA`
2. Click UPDATE
3. **Expected Result:**
   - Paragraph gets red comment bar
   - Actionability score is 1 (critical)
4. Try other markers:
   - `YYYA` → Yellow bar, Actionability score 3
   - `ZZZA` → No comment bar, Actionability score 5 (hidden)
5. Combine markers: `Test paragraph. XXXA XXXH YYYG ZZZV`
6. **Expected Result:**
   - Red bar (worst score determines color)
   - Actionability: 1 (red), Helpfulness: 1 (red), Grounding: 3 (yellow), Verifiability: 5 (hidden)

See README.md for complete marker reference table.

### Monotonic Score Behavior

1. Type paragraph: `Initial text. XXXA` (Actionability score 1)
2. Click UPDATE → Red bar appears
3. Edit to: `Improved text. YYYA` (Actionability score 3)
4. Click UPDATE
5. **Expected Result:**
   - Actionability score stays at **max(1, 3) = 3**
   - Bar color may change based on highest remaining score
6. Edit to: `Perfect text. ZZZA` (Actionability score 5)
7. Click UPDATE
8. **Expected Result:**
   - Actionability reaches score 5 (hidden)
   - Score stays at 5 permanently

**Note:** Test markers override monotonic behavior

## Database Verification

Use Supabase Studio to verify data integrity:

1. Open Supabase Studio: `http://127.0.0.1:54323`
2. Navigate to Table Editor → profiles
3. Verify:
   - User profiles created on signup
   - first_name and last_name populated correctly
   - terms_accepted_at timestamp recorded
   - last_sign_in_at updates on login
   - updated_at changes when profile is edited
4. Test account deletion:
   - Note user ID before deletion
   - Delete account via UI
   - Verify user removed from auth.users
   - Verify profile removed from profiles (cascade delete)

## Performance Testing

### Profile Loading Race Condition

This tests the fix for the race condition between profile updates and loading:

1. Create new account with first name "Race" and last name "Test"
2. After signup completes, immediately navigate to Account Settings
3. **Expected Result:**
   - First name shows "Race"
   - Last name shows "Test"
   - No blank fields (race condition is fixed)

### Session Restoration

1. Login to application
2. Open DevTools → Application → Storage → Local Storage
3. Note the session data
4. Refresh page multiple times quickly
5. **Expected Result:**
   - Session restores correctly each time
   - No flicker between logged in/out states
   - Profile data loads consistently

## Error Handling Testing

### Network Errors

1. Stop Supabase instance: `supabase stop`
2. Try to login
3. **Expected Result:** Error message appears
4. Try to update profile while logged in (if session still valid)
5. **Expected Result:** Error message appears

### Invalid Data

1. Try to signup with email "notanemail"
2. **Expected Result:** Validation error before API call
3. Use browser DevTools to modify disabled email field in Account Settings
4. Try to submit
5. **Expected Result:** Should handle gracefully (email updates require separate flow)

## Browser Compatibility

Test in multiple browsers:
- Chrome/Chromium
- Firefox
- Safari (if on macOS)

Verify:
- All UI elements render correctly
- Auth flows work
- Session persistence works
- Local storage accessible

## Accessibility Testing

1. Navigate application using only keyboard (Tab, Enter, Escape)
2. **Expected Result:**
   - All interactive elements focusable
   - Forms submittable with Enter
   - Modals closable with Escape
3. Use screen reader (if available)
4. Verify form labels are readable

## Test Data Cleanup

After testing, clean up test accounts:

1. Option A: Delete via UI (Account Settings → Delete Account)
2. Option B: Use Supabase Studio to manually delete from auth.users
3. Option C: Reset entire database: `supabase db reset`

## Benchmarking Tests

### Comment API Performance

Test the performance and scalability of comment generation with various paragraph counts.

**Prerequisites:**
- Backend API running and accessible
- Set `MODE: 'backend'` in `src/commentsClient.js`
- Node.js for CLI testing

**Test 1: Single Paragraph Baseline**
```bash
node src/commentsClient.js --text "This is a short test paragraph for benchmarking."
```
**Expected:**
- Time to complete: ~10-30 seconds (depends on API)
- All 4 aspects returned (Actionability, Grounding, Verifiability, Helpfulness)
- Scores in range 1-5

**Test 2: Small Review (5 paragraphs)**
```bash
node src/commentsClient.js --file test-data/small-review.txt
```
Create `test-data/small-review.txt` with 5 paragraphs (sample from SAMPLE_REVIEW_TEXT).

**Metrics to track:**
- Total time to completion
- Time per paragraph
- Number of retries (if any)
- Memory usage

**Test 3: Medium Review (10 paragraphs)**
```bash
node src/commentsClient.js --file test-data/medium-review.txt --log-level DEBUG
```
**Expected:**
- Batches processed in parallel (check DEBUG logs)
- Progress updates showing batch completion
- Retry logic handling (if network issues occur)

**Test 4: Large Review (50+ paragraphs)**
Create a large review file by duplicating sample paragraphs.

```bash
# Generate large test file
node -e "const {SAMPLE_REVIEW_TEXT} = require('./src/commentsClient.js'); const fs = require('fs'); fs.writeFileSync('test-data/large-review.txt', (SAMPLE_REVIEW_TEXT + '\\n\\n').repeat(10));"

# Run benchmark
time node src/commentsClient.js --file test-data/large-review.txt
```

**Metrics to track:**
- Total processing time
- Average time per paragraph
- API throughput (paragraphs/minute)
- Retry count and retry time
- Memory consumption

**Test 5: Batch Size Optimization**

Test different batch sizes to find optimal configuration:

1. Edit `CONFIG.API_BATCH_SIZE` in commentsClient.js
2. Test with same input file at different batch sizes: 1, 5, 10, 20, 50
3. Record total time and errors for each

**Expected findings:**
- Batch size 1: Slowest, but best progress granularity
- Larger batches: Faster overall, but less progress updates
- Server max (128): Fastest if server handles it, but risky for timeouts

**Test 6: Retry Logic**

Test retry behavior under failure conditions:

1. Set `CONFIG.MAX_RETRIES = 3` and `CONFIG.RETRY_DELAY_MS = 1000`
2. Temporarily stop backend API
3. Run client
4. **Expected:** 3 retries with 1-second delays, then failure
5. Restart API mid-retry
6. **Expected:** Recovery on next retry

**Test 7: Concurrent Requests**

Test parallel processing from multiple instances:

```bash
# Terminal 1
node src/commentsClient.js --file test1.txt &

# Terminal 2
node src/commentsClient.js --file test2.txt &

# Terminal 3
node src/commentsClient.js --file test3.txt &

# Wait for all to complete
wait
```

**Expected:**
- All requests complete successfully
- Server handles concurrent load
- No rate limiting errors (or appropriate handling if rate limited)

**Test 8: Timeout Handling**

Test timeout behavior with very large inputs:

1. Create file with 200+ paragraphs
2. Check calculated timeout: `BASE_TIMEOUT_SEC + (count * TIMEOUT_PER_PARAGRAPH_SEC)`
3. Run test
4. **Expected:** Either completes within timeout or fails with timeout error

### Browser Performance Tests

**Test 9: UI Responsiveness During Update**

1. Load application with large review text (50+ paragraphs)
2. Click UPDATE button
3. Observe UI during processing

**Metrics:**
- UI remains responsive (not frozen)
- Progress feedback visible
- Can click other elements during update
- Memory usage stays reasonable

**Test 10: Comment Panel Rendering**

1. Load review with many comments
2. Rapidly click different comment bars
3. **Expected:**
   - Smooth animations (<100ms)
   - No visual glitches
   - Memory doesn't leak on repeated opens/closes

**Test 12: Large Document Handling**

1. Paste very long review (100+ paragraphs)
2. Click UPDATE
3. **Expected:**
   - Textarea remains responsive
   - Scrolling is smooth
   - Comment bars render correctly
   - No browser crashes or freezes

### Benchmark Results Template

Document your benchmark results:

```markdown
## Benchmark Results - [Date]

**Environment:**
- OS: [macOS/Linux/Windows]
- Node.js: [version]
- Backend API: [URL/version]
- Network: [local/remote]

**Test Results:**

| Test | Paragraphs | Batch Size | Total Time | Time/Para | Retries | Notes |
|------|------------|------------|------------|-----------|---------|-------|
| Single | 1 | 1 | 15s | 15s | 0 | Baseline |
| Small | 5 | 1 | 75s | 15s | 0 | Linear scaling |
| Medium | 10 | 1 | 145s | 14.5s | 1 | One network retry |
| Large | 50 | 1 | 720s | 14.4s | 0 | Consistent |
| Batch-5 | 10 | 5 | 90s | 9s | 0 | 37% faster |
| Batch-10 | 10 | 10 | 75s | 7.5s | 0 | 48% faster |

**Observations:**
- Average processing time per paragraph: ~14s
- Batch size 5-10 provides best balance of speed and reliability
- Network retries needed for ~5% of requests
- Memory usage stable across all test sizes
```

### Performance Optimization Checklist

After benchmarking, consider these optimizations:

- [ ] Adjust `API_BATCH_SIZE` based on results
- [ ] Tune `POLL_INTERVAL_MS` (faster polling = quicker results, more API load)
- [ ] Adjust `TIMEOUT_PER_PARAGRAPH_SEC` based on observed times
- [ ] Implement request caching for repeated paragraphs
- [ ] Add request deduplication for identical paragraphs
- [ ] Consider WebSocket for real-time progress vs. polling
- [ ] Add connection pooling for concurrent requests
- [ ] Implement progressive loading (show results as they arrive)

## Automated Testing (Future)

This guide currently covers manual and benchmark testing. Consider adding:
- Unit tests for components (Jest + React Testing Library)
- Integration tests for auth flows (Cypress/Playwright)
- API tests for Supabase operations
- E2E tests for critical user journeys
- Automated performance regression tests
- Load testing for concurrent users
