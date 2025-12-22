# Revas - Review Assistant

An interactive React application for editing and reviewing academic papers with intelligent comment annotations.

## Features

- **Interactive Text Editing**: Edit review text in a responsive textarea that auto-adjusts height
- **Paragraph-Aligned Comments**: Visual comment bars that align with specific paragraphs
- **Color-Coded Severity**: Red bars for critical comments, yellow for suggestions
- **Click to Expand**: Click comment bars to view detailed feedback
- **Smart Update Button**: Activates (turns blue) when text is modified, allowing you to update comments
- **Smooth Interactions**: Animated transitions for opening/closing comment panels

## Technologies

- React 18
- Tailwind CSS
- Vite

## Prerequisites

Before running this project, make sure you have the following installed:

1. **Node.js (v18 or higher) and npm**:
```bash
# Check if Node.js is installed
node --version

# Check if npm is installed
npm --version
```
If not installed, download from [nodejs.org](https://nodejs.org/)

2. **Supabase local instance**: This app uses Supabase for authentication. Ensure you have Supabase running locally (see Authentication Setup below)

## Installation

1. Navigate to the project directory:
```bash
cd revas-app
```

2. Install dependencies (this includes a local installation of supabase):
```bash
npm install
```

## Authentication Setup

This app uses Supabase for authentication. You need a local Supabase instance running.
Because Supabase uses docker, you need permission to connect to the docker socket
(don't use sudo!).

Supabase is not currently installable as a global executable. The workaround is to prefix
its commands with `npx`.

### Get Supabase Credentials

1. Ensure your local Supabase is running:
   ```bash
   npx supabase status
   ```

2. Copy the **API URL** and Publishable Authentication key (aka the **anon key**) from the output.

3. Create a `.env` file in the project root (a default one is provided, but you may need to update it):
   ```bash
   # The .env file should contain:
   VITE_SUPABASE_URL=http://127.0.0.1:54321
   VITE_SUPABASE_ANON_KEY=<your-anon-key-from-supabase-status>
   ```

   **Note**: A `.env` file with default local Supabase credentials is already included. If your Supabase instance uses different credentials, update the file accordingly.

4. If your Supabase is not running, start it. The first time you do this, docker images will be downloaded and installed:
   ```bash
   npx supabase start
   ```

## Running the Application

Start the development server:
```bash
npm run dev
```

The application will be available at `http://localhost:5173`

## Building for Production

There is not much different about a production run than a local dev run.
You need to have a .env file in this directory that contains the public address of the host machine.
And you have to add an encryption key to a migration.
For our test host, .env looks like this:
```
# VITE_SUPABASE_URL=http://127.0.0.1:54321 # this is in the local .env file
VITE_SUPABASE_URL=http://10.127.105.10:54321 # the production host
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0

# Encryption key for review content (change in production)
# Note: because supabase wont let us set postgres config while in local mode without being superuser,
# an encryption key had to be hard-wired into the code as a default fallback key. So you have
# to remember to change the key in this file AND in the migration.
# To change the encryption key for production:
#  1. Edit .env: Update ENCRYPTION_KEY=your-new-production-key
#  2. Edit supabase/migrations/20251214000005_fix_encryption_key.sql: Update line 21 and 43 to match
#  3. Run: npx supabase db reset
ENCRYPTION_KEY=local-dev-key-change-in-production-12345
```
To create a production build:
```bash
npm run build
```
This will bake the VITE_SUPABASE_URL into the javascript UI -- if you forget to change from 127.* all your UI backend calls will fail.

To preview the production build:
```bash
npm run preview
```

## Testing

The application includes comprehensive automated tests:

```bash
# Run unit tests
npm test

# Run integration tests (backend API format validation)
npm run test:integration

# Run E2E tests
npm run test:e2e

# Run smoke tests (deployment verification)
npm run test:smoke

# View coverage
npm run test:coverage
```

**Test Documentation:**
- [TESTING.md](TESTING.md) - Complete testing guide (automated + manual)
- [SMOKE-TESTS.md](SMOKE-TESTS.md) - Deployment/smoke test guide

**Test Categories:**
- **Unit Tests** - Component and function tests (Vitest + React Testing Library)
- **Integration Tests** - Backend API connectivity and response format validation
- **E2E Tests** - Full user journeys (Playwright)
- **Smoke Tests** - Critical deployment verification (< 5 min)

**Integration Tests:**
Backend API tests verify the comments API is accessible and returns correctly formatted responses. These tests:
- Check API connectivity and availability
- Validate response structure (all 4 dimensions present)
- Verify each dimension has `score` (1-5) and `text` fields
- Test multi-paragraph handling
- Confirm test markers (XXXA, YYYH, etc.) work correctly
- Skip automatically if backend is unavailable (set `SKIP_INTEGRATION_TESTS=true`)

## Component Interactions

### Text Area
- Type to edit the review text
- Paragraphs are separated by blank lines
- Height adjusts automatically to fit content

### Comment Bars
- Appear on the right edge of the text area
- Aligned with paragraph boundaries
- Color indicates severity: Red (critical) or Yellow (suggestions)
- Click to open/close comments

### Comments Panel
- Shows detailed feedback when a comment bar is clicked
- Red-labeled comments appear first
- Vertically centered on the associated comment bar
- Only one comment bar can be open at a time

### UPDATE Button
- Inactive (grey) when no changes are made
- Active (blue) when text is modified
- Click to process updated text and refresh comments
- Returns to inactive state after updating

## Comment System

**Comment Evaluation:**
- Evaluates paragraphs on four dimensions: **Actionability**, **Helpfulness**, **Grounding**, and **Verifiability**
- Scores range from 1-5 for each dimension
- Score 1-2 (Red): Critical issues requiring attention
- Score 3 (Yellow): Suggestions for improvement
- Score 4-5: Good (comments hidden from reviewer)

**Test Markers:**
For development/testing, you can force specific scores by adding markers to paragraph text:
- `XXX[A/H/G/V]` → Score 1 (Red)
- `YYY[A/H/G/V]` → Score 3 (Yellow)
- `ZZZ[A/H/G/V]` → Score 5 (Hidden)

Example: `This is a test. XXXA YYYH` gives Actionability score 1 (red) and Helpfulness score 3 (yellow).

See [TESTING.md](TESTING.md) for complete testing guide including all test markers.

### Integrating a Real API

Comment generation is handled by `src/commentsClient.js`. See that file for:
- API endpoint configuration
- Expected API request/response formats
- Batch processing and retry logic

### Backend Proxy Architecture

The app uses a Supabase Edge Function as a secure proxy to the comment service:

**Architecture:**
```
Frontend → Supabase Edge Function → Comment Service
```

**Security:**
- Comment service URL is hidden from frontend (stored as Edge Function secret)
- Requests require authentication (Supabase JWT token)
- Edge Function validates and forwards requests

**Changing the Backend URL:**

To point to a different comment service backend:

1. Edit `supabase/functions/get-comments/index.ts`
2. Update the `BACKEND_URL` constant (around line 21)
3. Restart Supabase: `npx supabase stop && npx supabase start`

**Local Development:**
1. Ensure Supabase is running: `npx supabase status`
2. Edge Function runs automatically with local Supabase
3. See [TESTING.md](TESTING.md#edge-function-testing) for manual testing procedures

## Account Management

### User Profile & GDPR Compliance

The app implements GDPR-compliant account management features:

**During Signup:**
- First name and last name collection
- Consent checkbox for terms/privacy policy
- Consent timestamp recorded

**Account Settings:**
- Access via account dropdown (upper right)
- Edit first name and last name
- Change password (requires current password verification)
- Export all your data (JSON format) - GDPR Right to Access
- Delete account permanently - GDPR Right to Erasure

**Privacy Features:**
- Last login tracking
- Profile data stored with Row Level Security (RLS)
- All user data can be exported or deleted

For detailed testing procedures, see [TESTING.md](TESTING.md).

## Interaction Logging & Reporting

The app tracks how authors interact with AI-generated feedback to understand revision patterns.

### What's Tracked

- **Views**: When an author opens a comment bar to see feedback (paragraph-level)
- **Dismissals**: When an author dismisses a specific dimension's comment (dimension-level)
- **Edits**: When an author modifies paragraph text and clicks UPDATE (creates new version)
- **Score changes**: How scores evolve across versions (computed from version history)

### Viewing Interaction Data

Access **My Tables** from the account dropdown to see:
- All review versions with scores and interaction indicators
- 👁 (blue) - Comment was viewed
- ✕ (gray) - Comment was dismissed
- 👁✕ (orange) - Comment hidden due to dismissal in earlier version
- Expandable version history for each paragraph

### Exporting Session Data

Export all review sessions from the database to JSON:

```bash
# Export to default file (sessions.json)
npm run export:sessions

# Export to custom file
npm run export:sessions -- --output=my-sessions.json
```

The export includes all papers, reviews, versions, scores, and interactions in a unified JSON format.

### Generating Interaction Reports

Analyze exported sessions to understand author behavior:

```bash
# Generate report from exported data
npm run report:interactions -- --input=sessions.json

# Output to file instead of console
npm run report:interactions -- --input=sessions.json --output=report.txt
```

Reports include:
- Session completion rates
- Comment viewing rates by score
- Post-view behavior (edit, dismiss, both, nothing)
- Score improvement tracking
- Finished review score distribution

### Synthetic Data for Testing

Generate synthetic sessions for report development:

```bash
# Generate 50 synthetic sessions with reproducible seed
npm run generate:sessions -- --sessions=50 --seed=12345

# Generate to custom output file
npm run generate:sessions -- --sessions=100 --output=test-sessions.json
```

Synthetic sessions simulate realistic author behavior patterns for testing the reporting pipeline.

## Database Schema

The app uses Supabase with the following tables:

**`auth.users`** (Supabase managed):
- User authentication data
- Email, password hash, created timestamps

**`public.profiles`** (custom table):
- `id` - UUID, foreign key to auth.users
- `first_name` - TEXT
- `last_name` - TEXT
- `last_sign_in_at` - TIMESTAMP (GDPR compliance)
- `terms_accepted_at` - TIMESTAMP (GDPR compliance)
- `created_at` - TIMESTAMP
- `updated_at` - TIMESTAMP

**Row Level Security (RLS):**
- Users can only view/update their own profile
- Auto-creation via database trigger on signup

**Migrations:**
- Located in `supabase/migrations/`
- Apply with: `npx supabase db reset`

**Applying Schema Changes (Local Development):**

When you modify migration files or add new ones, you have two options:

1. **`npx supabase db push --local`** (Recommended for most cases)
   - Applies pending migrations without destroying data
   - Preserves existing users and review data
   - Fast - only runs new/changed migrations
   - Use this during normal development

2. **`npm run db:reset:keep-users`**
   - Full reset that recreates all tables
   - Preserves user accounts but clears all other data
   - Use when migrations are broken or you need a clean slate

3. **`npx supabase db reset`**
   - Nuclear option: destroys everything including users
   - Use only when you need a completely fresh database

## Project Structure

```
revas-app/
├── src/
│   ├── ReviewComponent.jsx  # Main component with all interactions
│   ├── AuthContext.jsx      # Authentication state management
│   ├── AuthComponent.jsx    # Login/signup UI
│   ├── AccountSettings.jsx  # Account management UI
│   ├── supabaseClient.js    # Supabase client initialization
│   ├── commentsClient.js    # API client for comments
│   ├── App.jsx              # Application entry point with view management
│   ├── main.jsx             # React DOM rendering
│   └── index.css            # Tailwind CSS imports
├── supabase/
│   └── migrations/          # Database schema migrations
├── .env                     # Environment variables (not committed)
├── .env.example             # Environment template
├── index.html               # HTML template
├── package.json             # Project dependencies
├── vite.config.js           # Vite configuration
├── tailwind.config.js       # Tailwind configuration
└── postcss.config.js        # PostCSS configuration
```

## Some other things Revas might mean:
-  Rescue, Evacuation, Ventilation, Attack, and Salvage (firefighting tactical priorities)
-  Business simulation game (Revas.online)
-  Real Estate Virtual Assistant (revas.us)
-  A medication for high blood pressure (Revas 25mg)
-  Reinforcing Vasal Suture (a vasectomy-reversing surgery)
-  River Edge Volunteer Ambulance Service (Revas.org)
