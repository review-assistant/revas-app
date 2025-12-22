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

- [ ] **Cancel race condition during DB writes** - If user clicks CANCEL after API returns but during database writes, the writes still complete:
  - Request ID check at line 1082 passes before DB writes start
  - User cancels → UI unlocks, user can edit
  - Meanwhile `create_version_from_draft` (line 1144) and `saveScores` (line 1154) complete
  - DB has stale data, UI state may be inconsistent
  - Suggested fix: Add request ID checks before each `await`, or use AbortController
  - Location: `ReviewComponent.jsx:1082-1181`

### 3. Comment Update Arrival Races

- [x] **Stale comments for edited paragraphs** - ~~If user edits text while API call is in flight, returned comments are for old content but get associated with current paragraph IDs.~~
  - ADDRESSED: Textarea is now read-only during UPDATE (`isUpdating`), preventing edits while API call is in flight

- [x] **Paragraph ID drift during edits** - ~~Paragraphs naturally evolve over the course of user edits and UPDATE cycles. The fuzzy matcher must reliably track paragraph identity.~~
  - ADDRESSED: Unified both matchers to use cosine similarity with shared `PARAGRAPH_MATCH_THRESHOLD` (0.7). Added `calculateSimilarity()` utility function used by both `matchParagraphs()` and `loadReviewData()`.

- [ ] **Interleaved progress callbacks** - Multiple concurrent requests could mix progress updates in the UI.
  - Location: `ReviewComponent.jsx:1018-1026`

### 4. Database Operation Ordering

- [ ] **Non-atomic version + score save** - Version is created (line 1113), then scores saved separately (line 1123). If second call fails, orphaned version exists.
  - Suggested fix: Combine into single RPC transaction

- [ ] **Three-step save sequence** - Draft save → version create → score save. Network failure at any step leaves inconsistent state.
  - Location: `ReviewComponent.jsx:975, 1113, 1123`

### 5. UI State During Slow Operations

- [ ] **Page refresh during in-flight UPDATE** - HIGH PRIORITY. If user refreshes during a slow UPDATE:
  - In-flight request may complete after refresh, saving stale scores
  - User doesn't know if update succeeded, failed, or is still processing
  - User might edit text after refresh, then old update overwrites with stale data
  - Suggested fix: Persist "update in progress" flag to localStorage with timestamp and review ID. On page load, check flag and show appropriate warning/status.
  - Complications to consider:
    - localStorage is synchronous and blocks the main thread (but fast for small data)
    - Data persists across tabs - need to scope by review ID
    - Need to clean up stale flags (e.g., if browser crashed)
    - No automatic expiry - must manually check timestamps
  - Location: `ReviewComponent.jsx` - `handleUpdate` function

- [ ] **No timeout handling for very slow API** - If backend is extremely slow, UI stays in loading state indefinitely. No user feedback or recovery option beyond CANCEL.

- [ ] **Error state not shown to user** - Line 1142 has `// TODO: Consider showing error message to user` - errors are silently swallowed.

---

## Interaction Reporting

*Context: Analytics to understand how authors respond to review feedback. See `docs/Interaction_tracking.md` for full requirements.*

### Data Collection (Prerequisites)

- [x] **Wire UI to track_interaction RPC** - The database has `track_interaction` function and `review_item_interactions` table ready. Need to call from UI:
  - Call `track_interaction(..., 'view')` when comment bar opens (`setOpenCommentBar`)
  - Call `track_interaction(..., 'dismiss')` when comment is dismissed (`handleDismissComment`)
  - Location: `ReviewComponent.jsx` - search for `setOpenCommentBar` and `handleDismissComment`
- [x] **Track score changes between versions** - Compare scores before/after text edits (can be computed from `review_item_scores` joined across versions)

### Report Generation

- [ ] **Comment viewing rates** - How often do authors look / not look at comment text?
- [ ] **Revision rates after viewing** - When shown comments, how often do authors revise their text?
- [ ] **Edit count distribution** - Typical number of edits per item, segmented by score
- [ ] **Score improvement tracking** - Do revisions lead to improved, worse, or unchanged scores?
- [ ] **Author response patterns** - Rates of: improving to score 5 vs dismissing vs ignoring

### Implementation Notes

- May require new DB tables for interaction events (views, dismissals, edits)
- Reports could be admin-only dashboard or exportable CSV
- Consider privacy implications - aggregate vs per-user reporting

### Session Data & Reporting Pipeline

*Unified JSON format for synthetic and real data. Reports operate on JSON files, not direct DB queries.*

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Generate       │     │  sessions.json  │     │  Interaction    │
│  Synthetic      │────▶│  (unified       │◀────│  Report         │
│  Sessions       │     │   format)       │     │  Generator      │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               ▲
┌─────────────────┐            │
│  Export from    │────────────┘
│  Database       │
└─────────────────┘
```

#### Interaction Model

- **Scores**: 4 dimensions per paragraph (Actionability, Helpfulness, Grounding, Verifiability)
- **View**: User opens comment bar → sees all dimension scores for that paragraph (paragraph-level)
- **Edit**: User modifies paragraph text → resubmit → new version with all dimensions re-scored (paragraph-level)
- **Dismiss**: User dismisses one dimension's comment (dimension-level)

#### Scripts

- [x] **Generate synthetic sessions** - `scripts/generate-synthetic-sessions.js`
  - Simulates: submit review → loop (view paragraph, then edit or dismiss dimension) → until done
  - Run: `npm run generate:sessions -- --sessions=50 --seed=12345`

- [x] **Export database to JSON** - `scripts/export-sessions.js`
  - Exports real sessions from Supabase into same JSON format
  - Anonymizes user IDs; includes all versions, scores, interactions
  - Run: `npm run export:sessions -- --output=real-sessions.json`

- [x] **Generate interaction report** - `scripts/generate-interaction-report.js`
  - Reads sessions JSON (synthetic or real)
  - Computes: viewing rates, edit vs dismiss ratios, score improvements, completion rates
  - Outputs: console summary, CSV, or JSON

#### JSON Format

```json
{
  "metadata": { "source": "synthetic|database", "generated_at", "summary" },
  "sessions": [{
    "paper": { "id", "title", "conference" },
    "review": {
      "versions": [{
        "version": 1,
        "paragraphs": [{ "paragraph_id": 0, "content": "..." }],
        "scores": [{
          "paragraph_id": 0,
          "Actionability": { "score": 3, "comment": "..." },
          "Helpfulness": { "score": 4, "comment": "..." },
          "Grounding": { "score": 2, "comment": "..." },
          "Verifiability": { "score": 5, "comment": "..." }
        }]
      }],
      "interactions": [
        // View: paragraph-level (user opens comment bar, sees all dimensions)
        { "type": "view", "paragraph_id": 0, "version": 1, "timestamp": "..." },
        // Edit: paragraph-level (creates new version, all dimensions re-scored)
        { "type": "edit", "paragraph_id": 0, "from_version": 1, "to_version": 2, "timestamp": "..." },
        // Dismiss: dimension-level (user dismisses specific dimension's comment)
        { "type": "dismiss", "paragraph_id": 0, "dimension": "Actionability", "version": 1, "timestamp": "..." }
      ]
    }
  }]
}
```

Usage:
```bash
# Development workflow
npm run generate:sessions -- --sessions=100 --seed=12345
npm run report:interactions -- --input=synthetic-sessions.json

# Production workflow
npm run export:sessions -- --output=real-sessions.json
npm run report:interactions -- --input=real-sessions.json
```

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

## Project Management & Documentation (Someday)

*Context: Practices to adopt as the project matures toward user-facing releases.*

- [ ] **GitHub Issues for bug tracking** - Migrate user-facing bugs from BACKLOG.md to GitHub Issues. Link commits/PRs to issues with "Closes #N" syntax.
- [ ] **CHANGELOG.md** - Start tracking user-facing changes by version when releases begin. Follow [Keep a Changelog](https://keepachangelog.com/) format.
- [ ] **GitHub Projects board** - Kanban-style visualization of work (To Do → In Progress → Done). Useful when coordinating with others.
- [ ] **PR templates** - Standardize PR descriptions with checklist (tests, documentation, breaking changes).
- [ ] **ADRs (Architecture Decision Records)** - Document significant technical decisions and their rationale in `docs/adr/` for future reference.

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
