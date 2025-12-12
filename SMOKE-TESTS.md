# Smoke Tests for Production Deployment

## Overview

Smoke tests are a **critical subset of E2E tests** that verify core functionality after deployment. They are designed to:
- Run quickly (< 5 minutes)
- Test only the most critical user paths
- Catch deployment issues early
- Be reliable and stable (no flaky tests)

## When to Run Smoke Tests

1. **After every production deployment**
2. **Before releasing to users** (staging environment)
3. **As part of deployment pipeline** (automated)
4. **Manual verification** of critical fixes

## Smoke Test Suite

The smoke tests are marked with `@smoke` tag in the E2E test files. Run them with:

```bash
npm run test:smoke
```

### Included Tests

#### 1. Authentication Flow (`e2e/auth.spec.js`)
- ✅ User signup → login → logout flow

**What it verifies:**
- New users can create accounts
- Account creation properly saves to database
- Users can login with credentials
- Session management works
- Logout properly clears session

**Expected duration:** 30-45 seconds

#### 2. Profile Management (`e2e/account-settings.spec.js`)
- ✅ Edit profile information
- ✅ Export user data (GDPR)
- ✅ Delete account flow

**What it verifies:**
- Users can edit their profiles
- Profile changes persist to database
- GDPR data export generates valid JSON
- Account deletion removes all user data
- Deletion properly logs out user

**Expected duration:** 60-90 seconds per test

#### 3. Review Functionality (`e2e/review.spec.js`)
- ✅ Load review and update comments

**What it verifies:**
- Main review interface loads
- Users can enter text
- Comment update system works
- API communication is functional

**Expected duration:** 30-45 seconds

### Total Suite Duration
Expected: **3-4 minutes** for all smoke tests

## Running Smoke Tests

### Local Environment
```bash
# Start local Supabase (if not running)
supabase start

# Run smoke tests
npm run test:smoke
```

### Staging/Production Environment
```bash
# Set base URL to staging/production
BASE_URL=https://staging.yourapp.com npm run test:smoke

# Or modify playwright.config.js:
# use: { baseURL: 'https://staging.yourapp.com' }
```

## Deployment Checklist

When deploying a new version:

- [ ] **Build passes** - `npm run build` completes without errors
- [ ] **Unit tests pass** - `npm run test:run`
- [ ] **Deploy to staging**
- [ ] **Run smoke tests on staging** - `npm run test:smoke`
- [ ] **Verify smoke test results** - All tests green
- [ ] **Deploy to production**
- [ ] **Run smoke tests on production** - `npm run test:smoke`
- [ ] **Monitor for errors** - Check logs and error tracking

## Smoke Test Success Criteria

All smoke tests must:
- ✅ Pass consistently (< 1% failure rate)
- ✅ Complete within expected time
- ✅ Not show any error messages in browser console
- ✅ Successfully interact with database

## What Smoke Tests DON'T Cover

Smoke tests are intentionally limited. They do NOT test:
- ❌ Edge cases and error scenarios
- ❌ All form validations
- ❌ Performance under load
- ❌ Cross-browser compatibility
- ❌ Mobile responsiveness
- ❌ All GDPR edge cases

For comprehensive testing, run the **full test suite**:
```bash
npm run test:e2e
```

## Interpreting Results

### All Tests Pass ✅
- Safe to release to users
- Core functionality verified
- Proceed with deployment

### Some Tests Fail ❌
- **DO NOT deploy to production**
- Investigate failures immediately
- Check:
  - Database connectivity
  - API endpoints
  - Authentication service
  - Environment variables
  - Network configuration

### Tests Timeout ⏱️
- Check API response times
- Verify database is accessible
- Check network latency
- May need to adjust timeouts in playwright.config.js

## Debugging Failed Smoke Tests

### View Test Output
```bash
# Run with UI for debugging
npm run test:e2e:ui -- --grep @smoke

# Run with debug mode
npm run test:e2e:debug -- --grep @smoke
```

### Check Screenshots
Failed tests automatically capture screenshots:
```
test-results/
  ├── auth-User-signup-login-logout-flow-chromium/
  │   └── test-failed-1.png
```

### Check Videos
Failed tests save videos:
```
test-results/
  └── videos/
      └── auth-spec-js-chromium.webm
```

### View HTML Report
```bash
npx playwright show-report
```

## CI/CD Integration Example

```yaml
# Example GitHub Actions workflow snippet
deployment:
  runs-on: ubuntu-latest
  steps:
    - name: Deploy to Staging
      run: ./deploy-staging.sh

    - name: Run Smoke Tests on Staging
      run: |
        BASE_URL=${{ secrets.STAGING_URL }} npm run test:smoke

    - name: Deploy to Production
      if: success()
      run: ./deploy-production.sh

    - name: Run Smoke Tests on Production
      run: |
        BASE_URL=${{ secrets.PRODUCTION_URL }} npm run test:smoke

    - name: Rollback on Failure
      if: failure()
      run: ./rollback.sh
```

## Adding New Smoke Tests

When adding a new critical feature:

1. Write E2E test in appropriate spec file
2. Mark test with `@smoke` tag:
   ```javascript
   test('@smoke New critical feature', async ({ page }) => {
     // Test implementation
   })
   ```
3. Verify test is:
   - Fast (< 60 seconds)
   - Stable (no flakiness)
   - Tests core functionality only
4. Update this document with the new test

## Best Practices

### DO:
- ✅ Keep smoke tests fast and focused
- ✅ Test happy paths only
- ✅ Use stable selectors (testid preferred)
- ✅ Clean up test data after tests
- ✅ Run smoke tests before every production deployment

### DON'T:
- ❌ Test edge cases in smoke tests
- ❌ Include slow/flaky tests
- ❌ Test every feature
- ❌ Skip smoke tests "just this once"
- ❌ Ignore failing smoke tests

## Smoke Test Maintenance

### Weekly:
- Review smoke test duration
- Check for flaky tests
- Update selectors if UI changed

### Monthly:
- Review test coverage
- Add tests for new critical features
- Remove tests for deprecated features
- Optimize slow tests

### After Major Changes:
- Review and update smoke tests
- Verify tests still cover critical paths
- Add tests for new critical functionality

## Contact for Test Issues

If smoke tests are failing and blocking deployment:
1. Check this document for debugging steps
2. Review test output and screenshots
3. Check application logs
4. Verify infrastructure (database, API)
5. Consult development team if issue persists

## Appendix: Environment-Specific Configuration

### Local Development
```javascript
// playwright.config.js
use: {
  baseURL: 'http://localhost:5173'
}
```

### Staging
```javascript
use: {
  baseURL: 'https://staging.revas.app'
}
```

### Production
```javascript
use: {
  baseURL: 'https://revas.app'
}
```

Set via environment variable:
```bash
BASE_URL=https://staging.revas.app npm run test:smoke
```
