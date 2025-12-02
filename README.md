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
cd revas
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

## Project Structure

```
revas/
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
