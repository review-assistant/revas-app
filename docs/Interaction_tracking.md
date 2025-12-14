# Review Tracking System - Design Document

## Part 1: Requirements

### 1.1 Functional Requirements

#### Paper and Review Management
- Papers are the top-level entity with embargo status
- Reviews are linked to papers (paper can have more than one review)
- Papers include an `is_embargoed` flag
- Create, read, update, delete reviews
- Encrypted storage of review content
- Review versioning and history

#### Interaction Tracking
- Multi-paragraph reviews (each paragraph is a review-item.
- a review-item may be an edit of a previous review item,  and has a stable id across its revisions. A change to review-item text creates a new review-item.
- retain review-item history, with the most recent review-item versions comprising the review.
- review item may be removed from the review in the UI by deleting the text. Retain the history but dont include in assembled review.
- review-items will be scored 1-5 for Actionability, Grounding, Helpfulness, Verifiability, with comments for each category
- track whether the change in the review-item's scores from its previous version.
- track whether the comments have been viewed (the comment bar in the UI was opened for these comments.)
- track whether a comment has been dismissed after viewing. that category will no longer be visible in  future versions of this review-item, and its score and comment will not be tracked in further edits to the review-item text.
- it is possible the final review-items have not been scored, or have no scores because all categories have been dismissed.

#### Interaction reporting
generate a report describing review author's reactions and interactions to review-items being scored:
- How often do authors look / not look at comment text?
- when shown review-item comments, how often do authors revise their text?
- What is the typical number of edits for an item. Does this vary with score?
- Do revisions lead to scores that are improved, worse, or unchanged?
- How often do authors improve the scores to 5, versus abandon the comment by dismissing, vs disregard the comment by leaving the text unchanged?

#### Training Data Pipeline
- Build a separate training database from review and review-items.
- Opt-in consent for using reviews and review-items in training
- Training data created  when paper embargo is lifted (run a periodic job to do this)
- anonymization: dissociate review from reviewer
- anonymization: run an anonymizer over review and comment text that changes possible PII to made-up values.
- Export functionality for ML pipelines

### 1.3 GDPR Compliance Requirements

#### Right to Access
- Users can download all their data in JSON format
- Include all reviews, comments, edits, and audit logs

#### Right to Portability
- Export data in machine-readable format (JSON)
- Include metadata and timestamps

#### Right to Erasure
- Complete deletion of user data from production database
- Anonymization of training data (cannot delete, but must dissociate from user)
- Cascade delete all related records

#### Right to Rectification
- Users can delete a review at any time prior to embargo lift. Finer grained revisions not supported.

#### Consent Management
- Explicit consent required for data processing
- Separate consent for training data usage
- Ability to withdraw consent at any time prior to embargo lift.
- Clear privacy policy and terms of service

#### Data Minimization
- Only collect necessary data
- Automatic deletion of expired sessions
- Regular cleanup of old audit logs (> 2 years)


