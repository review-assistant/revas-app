# Development Backlog

Paused work items intended for future development.

---

## Network Latency & Race Condition Handling

*Context: Items identified after UI bug fixes - potential issues when network latency is experienced, particularly around saving, autosaving, navigation, and comment updates.*

### 1. Save/Autosave Race Conditions

- [x] **Concurrent save operations** - ~~No mutex on `saveReviewDraft()`. If autosave timer fires while UPDATE is running, both could write simultaneously causing out-of-order database updates.~~
  - ADDRESSED: Added `isSavingRef` mutex to prevent concurrent saves. Autosave callback checks `isUpdatingRef` at execution time and skips if UPDATE is in progress.

- [ ] **Fire-and-forget unmount save** - Component unmount calls `saveReviewDraft` but doesn't await completion. Fast navigation could lose data.
  - Location: `ReviewComponent.jsx:899-912`

- [ ] **Autosave timer not cleared on remount** - If component unmounts/remounts quickly, stale timer ref could cause issues.
  - Location: `ReviewComponent.jsx:554-580`

### 2. Navigation During Pending Operations

- [x] **No navigation blocking during UPDATE** - ~~User can click Discard or navigate away while UPDATE API call is in flight. No warning, data could be lost.~~
  - ADDRESSED: Discard button is now disabled during UPDATE (`isUpdating`). Textarea is read-only with Loading overlay.

- [ ] **No "unsaved changes" warning** - Discarding a review with `isModified === true` should warn user (currently handled in App.jsx but may not cover all edge cases)

- [ ] **State reset during in-flight requests** - When `currentReview` changes (line 509-552), state resets. If save/update is in progress, results could arrive after reset.

### 3. Comment Update Arrival Races

- [x] **Stale comments for edited paragraphs** - ~~If user edits text while API call is in flight, returned comments are for old content but get associated with current paragraph IDs.~~
  - ADDRESSED: Textarea is now read-only during UPDATE (`isUpdating`), preventing edits while API call is in flight

- [ ] **Paragraph ID drift during edits** ⚠️ HIGH PRIORITY - Paragraphs naturally evolve over the course of user edits and UPDATE cycles. The fuzzy matcher must reliably track paragraph identity through:
  - Minor text edits (typos, word changes)
  - Sentence additions/removals within a paragraph
  - Paragraph splits and merges
  - Copy/paste of modified content

  **Current issue: Inconsistent thresholds**
  - `matchParagraphs()` at line 169 uses **50%** Jaccard similarity
  - `loadReviewData()` at line 805 uses **70%** Jaccard similarity
  - These should be unified and possibly replaced with character edit-distance metric for more reliable tracking

  Risk: Comments and scores could become associated with wrong paragraphs, breaking the user's editing flow

- [ ] **Interleaved progress callbacks** - Multiple concurrent requests could mix progress updates in the UI.
  - Location: `ReviewComponent.jsx:1018-1026`

### 4. Database Operation Ordering

- [ ] **Non-atomic version + score save** - Version is created (line 1113), then scores saved separately (line 1123). If second call fails, orphaned version exists.
  - Suggested fix: Combine into single RPC transaction

- [ ] **Three-step save sequence** - Draft save → version create → score save. Network failure at any step leaves inconsistent state.
  - Location: `ReviewComponent.jsx:975, 1113, 1123`

### 5. UI State During Slow Operations

- [ ] **No timeout handling for very slow API** - If backend is extremely slow, UI stays in loading state indefinitely. No user feedback or recovery option beyond CANCEL.

- [ ] **Error state not shown to user** - Line 1142 has `// TODO: Consider showing error message to user` - errors are silently swallowed.

---

## Training Permissions (Paper & Review Tables)

*Context: Required for Phase 7 (Training Data Pipeline) but schema changes needed earlier.*

- [ ] **Embargo dates on papers** - Add embargo date field to papers table to control when review data can be used for training
- [ ] **Opt-in per review** - Add training opt-in flag per review (not just per user), allowing granular consent
- [ ] **Prepopulate with most recent choices** - When creating a new review, default embargo date and opt-in to user's most recent selections

---

## Code Cleanup

### Remove Mock Data Generation

- [ ] **Remove mock mode from commentsClient.js** - Mock data generation (`getCommentsMock`, lines 222-281) should be removed from production code. Keep only in benchmark tests (`commentsClient.bench.js`).
  - Location: `commentsClient.js:222-281`, `CONFIG.MODE` at line 120

---

## Suggested Implementation Priority

1. **High**: Paragraph ID drift / fuzzy matcher reliability - core to user experience
2. **High**: Concurrent save mutex - prevents data corruption
3. **High**: Navigation blocking during UPDATE - prevents data loss
4. **Medium**: Atomic database operations - prevents inconsistent state
5. **Medium**: Stale comment handling - prevents wrong comments on paragraphs
6. **Low**: Better error display to user
7. **Low**: Timeout handling for slow API
8. **Low**: Mock data removal (cleanup)

---

## How to Use This File

**When pausing work for later:**
1. Add a new section with a descriptive heading
2. Include context about why the work was paused
3. List specific items as checkboxes `- [ ]`
4. Note relevant file paths and line numbers

**When resuming:**
1. Ask Claude to read this file
2. Mark completed items with `- [x]`
3. Remove sections when fully complete

**To add items during a session:**
- Ask: "Add this to the backlog: [description]"
- Or: "Write these items to BACKLOG.md"
