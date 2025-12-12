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

## Mock Comment Generation & Test Markers

### Comment Generation System

The application includes a mock `getComments()` function that simulates an API endpoint for generating review comments. This function:

- Evaluates paragraphs on four dimensions: **Actionability**, **Helpfulness**, **Grounding**, and **Verifiability**
- Assigns scores from 1-5 for each dimension (equal probability for each score)
- Converts scores to severity levels:
  - **Score 1-2**: Red (critical issues)
  - **Score 3-4**: Yellow (suggestions for improvement)
  - **Score 5**: None (hidden - perfect score)

### Monotonic Score Behavior

Comments follow a monotonically non-decreasing score system:
- When a paragraph is re-evaluated, each label's score becomes the **maximum** of its previous and new scores
- Once a label reaches score 5, it stays there permanently
- This encourages iterative improvement toward perfect scores
- Paragraphs with all score 5 labels appear "clean" with no comment bars

### Test Markers for Development

You can force specific scores by adding special markers to paragraph text:

| Marker | Label | Score | Severity | Effect |
|--------|-------|-------|----------|--------|
| `XXXA` | Actionability | 1 | Red | Critical actionability issue |
| `YYYA` | Actionability | 3 | Yellow | Moderate actionability concern |
| `ZZZA` | Actionability | 5 | None | Perfect actionability (hidden) |
| `XXXH` | Helpfulness | 1 | Red | Critical helpfulness issue |
| `YYYH` | Helpfulness | 3 | Yellow | Moderate helpfulness concern |
| `ZZZH` | Helpfulness | 5 | None | Perfect helpfulness (hidden) |
| `XXXG` | Grounding | 1 | Red | Critical grounding issue |
| `YYYG` | Grounding | 3 | Yellow | Moderate grounding concern |
| `ZZZG` | Grounding | 5 | None | Perfect grounding (hidden) |
| `XXXV` | Verifiability | 1 | Red | Critical verifiability issue |
| `YYYV` | Verifiability | 3 | Yellow | Moderate verifiability concern |
| `ZZZV` | Verifiability | 5 | None | Perfect verifiability (hidden) |

**Important**: Test markers **override monotonic behavior**. A marker will force its score even if the previous score was higher.

**Example Usage**:
```
This paragraph has poor actionability and helpfulness. XXXA XXXH
→ Shows red comment bar with Actionability and Helpfulness both at score 1

This one is moderate across all dimensions. YYYA YYYH YYYG YYYV
→ Shows yellow comment bar with all four labels at score 3

Perfect paragraph! ZZZA ZZZH ZZZG ZZZV
→ No comment bar (all scores are 5, hidden)
```

### Replacing the Mock Function

To integrate with a real API endpoint, simply replace the `getComments()` function in `src/ReviewComponent.jsx`:

```javascript
const getComments = async (paragraphs) => {
  const response = await fetch('YOUR_API_ENDPOINT', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paragraphs })
  });
  return await response.json();
};
```

The API should return an object with this structure:
```javascript
{
  paragraphId: {
    Actionability: { score: 1-5, text: "feedback text" },
    Helpfulness: { score: 1-5, text: "feedback text" },
    Grounding: { score: 1-5, text: "feedback text" },
    Verifiability: { score: 1-5, text: "feedback text" }
  }
}
```

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

### Testing Account Features

- **Sign Up**: Create account with first/last name and accept terms
  - Email must be valid format
  - Password must be at least 6 characters
  - Must accept terms checkbox
  - Successful signup automatically logs you in

- **Login**: Use existing credentials to sign in
  - Invalid credentials will show an error message
  - Last login timestamp updated

- **Account Settings**: Click account dropdown → Account Settings
  - Edit profile information
  - Change password
  - Download your data (GDPR export)
  - Delete account (requires typing DELETE to confirm)

- **Logout**: Click account dropdown → Logout
  - You'll be returned to the login screen

- **Session Persistence**:
  - Refresh the page while logged in - you stay logged in
  - Close and reopen the browser - session persists (within JWT expiry time)

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

## Future Enhancements

- API integration for real-time comment generation
- Support for multiple review types
- Export to various formats
- Collaborative editing features

## Some other things Revas might mean:
-  Rescue, Evacuation, Ventilation, Attack, and Salvage (firefighting tactical priorities)
-  Business simulation game (Revas.online)
-  Real Estate Virtual Assistant (revas.us)
-  A medication for high blood pressure (Revas 25mg)
-  Reinforcing Vasal Suture (a vasectomy-reversing surgery)
-  River Edge Volunteer Ambulance Service (Revas.org)
