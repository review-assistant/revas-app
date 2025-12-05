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

Before running this project, make sure you have Node.js (v18 or higher) and npm installed:

```bash
# Check if Node.js is installed
node --version

# Check if npm is installed
npm --version
```

If not installed, download from [nodejs.org](https://nodejs.org/)

## Installation

1. Navigate to the project directory:
```bash
cd revas-app
```

2. Install dependencies:
```bash
npm install
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

## Project Structure

```
revas-app/
├── src/
│   ├── ReviewComponent.jsx  # Main component with all interactions
│   ├── App.jsx              # Application entry point
│   ├── main.jsx             # React DOM rendering
│   └── index.css            # Tailwind CSS imports
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
