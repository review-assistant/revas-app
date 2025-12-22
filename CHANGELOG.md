# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2025-12-22

### Added
- My Reviews feature with review management and discard functionality
- My Tables view with version history and interaction indicators (viewed/dismissed)
- HTML export for My Tables data (`npm run export:mytables`)
- Interaction logging and reporting tools
- Warning when navigating away during UPDATE (browser beforeunload + in-app modal)
- Versioning and changelog

### Changed
- Score 4 comments are now hidden like score 5 (only scores 1-3 are shown to reviewers)

### Fixed
- Comment text corruption when editing paragraphs: The monotonic scoring logic was incorrectly reconstructing comment text by prepending a score prefix and stripping sentences
- My Reviews navigation from standalone My Tables now works correctly (navigates to main page where modal auto-shows)

### Removed
- Monotonic scoring behavior: Scores now reflect the backend's assessment of current content rather than being artificially kept at their historical maximum
