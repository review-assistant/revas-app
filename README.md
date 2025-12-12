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

2. Install dependencies:
```bash
npm install
```

## Authentication Setup

This app uses Supabase for authentication. You need a local Supabase instance running.

### Get Supabase Credentials

1. Ensure your local Supabase is running:
   ```bash
   supabase status
   ```

2. Copy the **API URL** and **anon key** from the output

3. Create a `.env` file in the project root (a default one is provided, but you may need to update it):
   ```bash
   # The .env file should contain:
   VITE_SUPABASE_URL=http://127.0.0.1:54321
   VITE_SUPABASE_ANON_KEY=<your-anon-key-from-supabase-status>
   ```

   **Note**: A `.env` file with default local Supabase credentials is already included. If your Supabase instance uses different credentials, update the file accordingly.

4. If your Supabase is not running, start it:
   ```bash
   supabase start
   ```

## Running the Application

Start the development server:
```bash
npm run dev
```

The application will be available at `http://localhost:5173`

## Building for Production

To create a production build:
```bash
npm run build
```

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
- Score 1-2 (Red): Critical issues
- Score 3-4 (Yellow): Suggestions for improvement
- Score 5: Perfect (comment hidden)

**Monotonic Scoring:**
- Scores can only increase, never decrease
- Encourages iterative improvement toward perfect scores
- Once a dimension reaches score 5, it stays there

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
- Apply with: `supabase db reset`

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
