# User Management and Review Tracking System - Design Document

## Part 1: Requirements

### 1.1 Functional Requirements

#### User Management
- User registration with email verification
- Secure login/logout with JWT tokens
- Password reset functionality
- User profile management
- Account deletion (GDPR right to erasure)

#### Paper and Review Management
- Papers are the top-level entity with embargo status
- Reviews are linked to papers
- Papers include an `is_embargoed` flag
- Create, read, update, delete reviews
- Encrypted storage of review content
- Paragraph-level text editing
- Multi-paragraph review support
- Review versioning and history

#### AI Comment Integration
- Integration with existing AI service at `http://10.127.105.10:8888`
- Real-time comment generation for paragraphs
- Comment display in UI with severity/label
- Comment persistence across sessions
- Comment dismissal functionality
- Each comment is a unique instance from a specific analysis run

#### Interaction Tracking
- Track when paragraphs are edited after receiving comments
- Track when comments are dismissed
- Track when comments are viewed but no action taken
- Track when comment bar is opened (comment viewed)
- Track when UPDATE button is clicked after editing
- Link edits to specific comments for training data

#### Training Data Pipeline
- Opt-in consent for using reviews in training
- Training data created when paper embargo is lifted
- Simple anonymization: dissociate review from reviewer
- Reviews are already written to contain no PII
- Separate training database
- Export functionality for ML pipelines

### 1.2 Technical Requirements

#### Architecture
- Two-service microservices architecture:
  1. User Management Service (port 8889) - handles authentication, storage, GDPR compliance
  2. Existing Comment Analysis Service (port 8888) - unchanged AI service
- User Management Service internally calls existing AI service when comment analysis is needed
- Frontend only communicates with User Management Service (single unified API)
- Reverse proxy (Nginx) for SSL termination and routing

#### Security
- AES-256-GCM encryption for review content at rest
- Bcrypt/Argon2 password hashing
- JWT access tokens (15 min expiry) + refresh tokens (7 day expiry)
- HTTPS/TLS for all communications
- Row-level security (users can only access their data)
- Encryption key rotation support

#### Database
- PostgreSQL 15+ for production data
- Separate PostgreSQL database for training data
- Database migrations for schema evolution
- Daily automated backups with 30-day retention
- Point-in-time recovery capability

#### Performance
- Response time < 200ms for API calls (excluding AI processing)
- Support 10,000 registered users
- Support 2,000 concurrent users
- Handle reviews up to 50,000 words
- Efficient paragraph-level updates

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
- Users can edit their reviews at any time
- Maintain edit history for training purposes

#### Consent Management
- Explicit consent required for data processing
- Separate consent for training data usage
- Ability to withdraw consent at any time
- Clear privacy policy and terms of service

#### Data Minimization
- Only collect necessary data
- Automatic deletion of expired sessions
- Regular cleanup of old audit logs (> 2 years)

## Part 2: System Architecture

### 2.1 Service Communication Flow

```
┌─────────────┐
│   Frontend  │
│   (React)   │
└──────┬──────┘
       │ HTTPS
       ▼
┌─────────────────────────────────────────┐
│          Nginx Reverse Proxy            │
│  - SSL termination                      │
│  - Route /api/* to User Mgmt Service    │
└──────┬──────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────┐
│    User Management Service (8889)       │
│  - Authentication & Authorization       │
│  - Paper & Review Storage (encrypted)   │
│  - Comment Storage                      │
│  - Interaction Tracking                 │
│  - GDPR Compliance                      │
│  - Training Pipeline                    │
└──────┬──────────────────────────────────┘
       │ Internal HTTP
       │ (when AI analysis needed)
       ▼
┌─────────────────────────────────────────┐
│  Existing AI Service (8888)             │
│  - Comment Generation                   │
│  - Paragraph Analysis                   │
│  - UNCHANGED                            │
└─────────────────────────────────────────┘
```

**Key Points:**
- Frontend only knows about User Management Service
- User Management Service calls existing AI service internally when needed
- Existing AI service requires no modifications
- Clean separation of concerns

## Part 3: Database Design

### 3.1 Phase 1: Authentication and User Management

```sql
-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email_verified BOOLEAN DEFAULT FALSE,
    verification_token VARCHAR(255),
    reset_token VARCHAR(255),
    reset_token_expires TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    gdpr_consent_date TIMESTAMP NOT NULL,
    gdpr_consent_version VARCHAR(10) NOT NULL DEFAULT 'v1.0'
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_verification_token ON users(verification_token);
CREATE INDEX idx_users_reset_token ON users(reset_token);

-- Sessions table (for refresh tokens)
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    refresh_token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    last_used_at TIMESTAMP DEFAULT NOW(),
    ip_address INET,
    user_agent TEXT
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_refresh_token ON sessions(refresh_token);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);

-- Audit log for GDPR compliance
CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50),
    resource_id UUID,
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at);
CREATE INDEX idx_audit_log_action ON audit_log(action);
```

**API Endpoints:**
```
POST   /api/auth/register          - Register new user
POST   /api/auth/verify-email      - Verify email with token
POST   /api/auth/login             - Login and get tokens
POST   /api/auth/logout            - Logout (invalidate refresh token)
POST   /api/auth/refresh           - Refresh access token
POST   /api/auth/forgot-password   - Request password reset
POST   /api/auth/reset-password    - Reset password with token
GET    /api/users/me               - Get current user profile
PUT    /api/users/me               - Update user profile
DELETE /api/users/me               - Delete account (GDPR)
```

### 3.2 Phase 2: Paper and Review Management

```sql
-- Encryption keys table
CREATE TABLE encryption_keys (
    key_id VARCHAR(50) PRIMARY KEY,
    created_at TIMESTAMP DEFAULT NOW(),
    rotated_at TIMESTAMP
);

-- Papers table
CREATE TABLE papers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    is_embargoed BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_papers_user_id ON papers(user_id);
CREATE INDEX idx_papers_is_embargoed ON papers(is_embargoed);

-- Reviews table
CREATE TABLE reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    paper_id UUID REFERENCES papers(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    encrypted_content TEXT NOT NULL,
    encryption_key_id VARCHAR(50) REFERENCES encryption_keys(key_id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    last_analyzed_at TIMESTAMP,
    version INT DEFAULT 1
);

CREATE INDEX idx_reviews_paper_id ON reviews(paper_id);
CREATE INDEX idx_reviews_user_id ON reviews(user_id);
CREATE INDEX idx_reviews_updated_at ON reviews(updated_at);

-- Review paragraphs (for granular tracking)
CREATE TABLE review_paragraphs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    review_id UUID REFERENCES reviews(id) ON DELETE CASCADE,
    stable_paragraph_id INT NOT NULL,
    encrypted_text TEXT NOT NULL,
    encryption_key_id VARCHAR(50) REFERENCES encryption_keys(key_id),
    position INT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(review_id, stable_paragraph_id)
);

CREATE INDEX idx_paragraphs_review_id ON review_paragraphs(review_id);
CREATE INDEX idx_paragraphs_position ON review_paragraphs(review_id, position);
```

**API Endpoints:**
```
POST   /api/papers                               - Create new paper
GET    /api/papers                               - List user's papers
GET    /api/papers/{paper_id}                    - Get paper details
PUT    /api/papers/{paper_id}                    - Update paper
DELETE /api/papers/{paper_id}                    - Delete paper
PUT    /api/papers/{paper_id}/embargo            - Update embargo status

POST   /api/papers/{paper_id}/reviews            - Create new review
GET    /api/papers/{paper_id}/reviews            - List reviews for paper
GET    /api/reviews/{review_id}                  - Get review with decrypted content
PUT    /api/reviews/{review_id}                  - Update review
DELETE /api/reviews/{review_id}                  - Delete review
PUT    /api/reviews/{review_id}/paragraphs/{id}  - Update paragraph
```

### 3.3 Phase 3: Comment Storage and AI Integration

```sql
-- Review comments
-- Each row is a unique comment instance from a specific analysis run
-- Dismissing a comment marks THAT instance as dismissed, not all comments with that label
CREATE TABLE review_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    review_id UUID REFERENCES reviews(id) ON DELETE CASCADE,
    stable_paragraph_id INT NOT NULL,
    label VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    score INT NOT NULL,
    comment_text TEXT NOT NULL,
    analysis_run_id UUID,
    created_at TIMESTAMP DEFAULT NOW(),
    interaction_type VARCHAR(20),
    interaction_at TIMESTAMP,
    comment_bar_opened_at TIMESTAMP
);

CREATE INDEX idx_comments_review_id ON review_comments(review_id);
CREATE INDEX idx_comments_paragraph_id ON review_comments(review_id, stable_paragraph_id);
CREATE INDEX idx_comments_interaction_type ON review_comments(interaction_type);
CREATE INDEX idx_comments_analysis_run ON review_comments(analysis_run_id);

-- UPDATE button click tracking
CREATE TABLE update_button_clicks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    review_id UUID REFERENCES reviews(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    paragraphs_modified_count INT NOT NULL,
    had_pending_comments BOOLEAN DEFAULT FALSE,
    clicked_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_update_clicks_review_id ON update_button_clicks(review_id);
CREATE INDEX idx_update_clicks_user_id ON update_button_clicks(user_id);
```

**API Endpoints:**
```
POST   /api/reviews/{review_id}/analyze                  - Trigger AI analysis
GET    /api/reviews/{review_id}/comments                 - Get comments for review
POST   /api/reviews/{review_id}/comments/{id}/dismiss    - Dismiss comment
POST   /api/reviews/{review_id}/comments/mark-viewed     - Mark comment as viewed
POST   /api/reviews/{review_id}/comments/track-ignored   - Mark ignored comments
POST   /api/reviews/{review_id}/update-clicked           - Track UPDATE button click
```

**Comment Analysis Client:**
The User Management Service includes an HTTP client that calls the existing AI service:
- Creates analysis job via `POST http://10.127.105.10:8888/analyze`
- Polls for completion via `GET http://10.127.105.10:8888/jobs/{job_id}`
- Transforms response and stores in `review_comments` table
- Each analysis generates new comment instances with unique `analysis_run_id`

### 3.4 Phase 4: GDPR Compliance Features

```sql
-- Training opt-in tracking
CREATE TABLE training_opt_in (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    opted_in BOOLEAN NOT NULL,
    opted_in_at TIMESTAMP,
    opted_out_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id)
);

CREATE INDEX idx_training_opt_in_user_id ON training_opt_in(user_id);

-- Data export requests
CREATE TABLE data_export_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'pending',
    export_file_path VARCHAR(500),
    requested_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP
);

CREATE INDEX idx_export_requests_user_id ON data_export_requests(user_id);
CREATE INDEX idx_export_requests_status ON data_export_requests(status);
```

**API Endpoints:**
```
POST   /api/gdpr/export-data           - Request data export
GET    /api/gdpr/export-data/{req_id}  - Download exported data
POST   /api/gdpr/training-opt-in       - Opt in to training data
DELETE /api/gdpr/training-opt-in       - Opt out of training data
```

**Data Export Format:**
Exports include complete user data in JSON format:
- User profile and consent records
- All papers and reviews (decrypted)
- All comments and interactions
- Complete audit log

### 3.5 Phase 5: Comment Interaction Tracking

```sql
-- Paragraph edit history
CREATE TABLE paragraph_edit_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    review_id UUID REFERENCES reviews(id) ON DELETE CASCADE,
    stable_paragraph_id INT NOT NULL,
    before_encrypted_text TEXT NOT NULL,
    after_encrypted_text TEXT NOT NULL,
    encryption_key_id VARCHAR(50) REFERENCES encryption_keys(key_id),
    edit_type VARCHAR(20) NOT NULL,
    comment_id UUID REFERENCES review_comments(id) ON DELETE SET NULL,
    edited_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_edit_history_review_id ON paragraph_edit_history(review_id);
CREATE INDEX idx_edit_history_paragraph_id ON paragraph_edit_history(review_id, stable_paragraph_id);

-- Comment score changes (for measuring effectiveness)
CREATE TABLE comment_score_changes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    edit_history_id UUID REFERENCES paragraph_edit_history(id) ON DELETE CASCADE,
    comment_label VARCHAR(50) NOT NULL,
    original_score INT NOT NULL,
    new_score INT,
    score_change INT NOT NULL,
    improvement_category VARCHAR(20) NOT NULL,
    analyzed_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_score_changes_edit_id ON comment_score_changes(edit_history_id);
```

**API Endpoints:**
```
PUT  /api/reviews/{review_id}/paragraphs/{id}/track-edit  - Track paragraph edit with history
```

**Edit Types:**
- `after_comment`: Edit made after receiving a comment
- `no_comment`: Edit made when no comment present
- `ignored_comment`: Comment was viewed but paragraph unchanged

**Interaction Type Values:**
- `edited`: User edited paragraph after viewing comment
- `dismissed`: User dismissed the comment
- `ignored`: User viewed comment but did not edit or dismiss
- `null`: No interaction yet

### 3.6 Phase 6: Training Database and Pipeline

**Training Database Schema (Separate Database):**
```sql
-- Training data table
CREATE TABLE training_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_review_id UUID NOT NULL,
    source_paper_id UUID NOT NULL,
    encrypted_review_text TEXT NOT NULL,
    encryption_key_id VARCHAR(50) NOT NULL,
    stable_paragraph_id INT NOT NULL,
    original_comments JSONB NOT NULL,
    edit_history JSONB,
    score_changes JSONB,
    embargo_released_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_training_source_review ON training_data(source_review_id);
CREATE INDEX idx_training_source_paper ON training_data(source_paper_id);
CREATE INDEX idx_training_embargo ON training_data(embargo_released_at);
```

**Training Pipeline Process:**
1. Daily background job queries for papers where `is_embargoed = FALSE`
2. Finds reviews linked to those papers where user has `training_opt_in.opted_in = TRUE`
3. Copies review data to training database
4. Review content remains encrypted but is dissociated from user identity
5. Includes all comments, edit history, and score changes as JSONB
6. No text transformation needed - reviews are already PII-free

**API Endpoints:**
```
GET  /api/training/ready-reviews     - List reviews ready for training export
POST /api/training/process           - Manually trigger training data processing
GET  /api/training/stats              - Get training data statistics
```

## Part 4: Implementation Phases

### Phase 1: Basic Authentication and User Management
- User registration with email verification
- Login/logout with JWT tokens
- Password reset functionality
- Session management with refresh tokens
- Basic audit logging

**Deliverables:**
- Users table and sessions table
- Auth endpoints functional
- JWT token generation and validation
- Email verification flow

### Phase 2: Paper and Review Management
- Paper CRUD operations
- Review CRUD operations with encryption
- Paragraph-level editing
- Encryption service with key rotation
- Link reviews to papers
- Embargo flag management

**Deliverables:**
- Papers, reviews, and paragraphs tables
- Encryption service implementation
- Paper and review management endpoints
- Frontend forms for paper/review creation

### Phase 3: AI Service Integration
- HTTP client for existing AI service
- Comment storage and retrieval
- Analysis job management
- Comment instance tracking with analysis_run_id
- UI for displaying comments

**Deliverables:**
- Review_comments table
- Comment analysis client
- Analysis endpoints
- Comment display UI

### Phase 4: Comment Interaction Tracking
- Track comment dismissals
- Track comment views (comment bar opening)
- Track UPDATE button clicks
- Track ignored comments
- Link edits to comments

**Deliverables:**
- Update_button_clicks table
- Interaction tracking endpoints
- Frontend instrumentation for tracking

### Phase 5: Edit History and Score Tracking
- Paragraph edit history
- Before/after text storage
- Edit type classification
- Score change tracking
- Re-analysis after edits

**Deliverables:**
- Paragraph_edit_history table
- Comment_score_changes table
- Edit tracking logic
- Score comparison functionality

### Phase 6: GDPR Compliance
- Data export functionality
- Account deletion
- Training opt-in/opt-out
- Consent management
- Privacy policy integration

**Deliverables:**
- Training_opt_in and data_export_requests tables
- GDPR endpoints
- Data export generation
- Consent UI

### Phase 7: Training Data Pipeline
- Training database setup
- Background job for data processing
- Query for non-embargoed papers
- Copy opted-in reviews to training DB
- Export functionality for ML pipeline

**Deliverables:**
- Training database with training_data table
- Scheduled background job
- Training data processing logic
- Export API for ML systems

## Part 5: Deployment and Operations

### 5.1 Infrastructure Requirements

**Server Specifications:**
- CPU: 8+ cores (for 2,000 concurrent users)
- RAM: 32GB minimum
- Storage: 500GB SSD (for encrypted reviews and backups)
- Network: 1Gbps connection

**Software Stack:**
- Ubuntu 22.04 LTS
- PostgreSQL 15+ (two instances: production and training)
- Python 3.11+ with FastAPI
- Nginx as reverse proxy
- Systemd for service management

### 5.2 Deployment Architecture

**Services:**
```
nginx (port 443) → User Management Service (port 8889)
                                    ↓
                    Existing AI Service (port 8888)
```

**Database:**
- Production database on primary server
- Training database on same server (separate PostgreSQL instance)
- Connection pooling for efficient resource use

**Security:**
- SSL certificates via Let's Encrypt
- Firewall rules: Only 443 and 22 exposed
- Internal services on localhost only
- Encryption master key in environment variable (not in code)

### 5.3 Backup Strategy

**Database Backups:**
- Daily automated backups at 2 AM
- 30-day retention
- Point-in-time recovery enabled
- Backup verification weekly

**Backup Location:**
- Local backup directory with restricted permissions
- Optional: Remote backup to S3 or similar

**Recovery Testing:**
- Monthly recovery drills
- Document recovery procedures
- Maintain runbook for disaster recovery

### 5.4 Monitoring and Logging

**Application Logs:**
- Rotating log files (10MB max, 10 files retained)
- Log levels: INFO for normal operations, ERROR for failures
- Structured logging with timestamps and user IDs (where applicable)

**Metrics to Monitor:**
- API response times
- Database connection pool usage
- Failed login attempts
- AI service availability
- Disk space usage
- Memory usage

**Health Checks:**
- `/health` endpoint for monitoring systems
- Checks database connectivity
- Checks AI service availability
- Returns HTTP 200 if healthy, 503 if degraded

### 5.5 Scheduled Jobs

**Daily Tasks:**
- Database backups (2 AM)
- Training data processing (3 AM)
- Session cleanup (4 AM)
- Old audit log cleanup (5 AM)

**Weekly Tasks:**
- Backup verification
- Log rotation
- Security updates

**Monthly Tasks:**
- Encryption key rotation (if needed)
- Recovery testing
- Usage analytics review

### 5.6 Scaling Considerations

**Current Target:**
- 10,000 registered users
- 2,000 concurrent users

**Horizontal Scaling Options (if needed):**
- Multiple User Management Service instances behind load balancer
- Database read replicas for read-heavy operations
- Redis for session storage (instead of database)
- CDN for frontend static assets

**Vertical Scaling Options:**
- Increase server resources (CPU, RAM)
- Optimize database queries
- Implement caching layer
- Database connection pooling tuning

## Part 6: Security Considerations

### 6.1 Data Encryption

**At Rest:**
- Review content encrypted with AES-256-GCM
- Encryption keys derived from master key + key_id
- Master key stored in environment variable
- Key rotation supported via encryption_keys table

**In Transit:**
- All communications over HTTPS/TLS
- Internal service calls can use HTTP (localhost only)
- JWT tokens transmitted in Authorization header

### 6.2 Authentication and Authorization

**Authentication:**
- Password hashing with bcrypt or Argon2
- Minimum password requirements enforced
- Email verification required
- Rate limiting on login attempts

**Authorization:**
- Row-level security: users only access their data
- JWT tokens contain user_id claim
- All endpoints verify ownership before operations
- Admin role not included in initial phases

### 6.3 Input Validation

**Backend Validation:**
- All inputs validated against expected types
- SQL injection prevented via parameterized queries
- XSS prevention via proper escaping
- File upload validation (if added later)

**Rate Limiting:**
- Login attempts: 5 per minute per IP
- API calls: 100 per minute per user
- Analysis requests: 10 per hour per user

### 6.4 Audit Trail

**Logged Actions:**
- User registration, login, logout
- Review creation, updates, deletion
- Comment dismissals and interactions
- GDPR data exports and deletions
- Training opt-in/opt-out

**Audit Log Retention:**
- Retain for 2 years
- Include IP address and user agent
- Cannot be modified or deleted by users
- Admin access only (future phase)

## Part 7: Summary

### Key Features

1. **Two-Service Architecture**: User Management Service handles everything and internally calls existing AI service when needed
2. **Paper-Based Organization**: Reviews linked to papers; papers control embargo status
3. **Security**: AES-256 encryption at rest, JWT auth, HTTPS everywhere
4. **GDPR Compliant**: Data export, right to erasure, consent management, audit logs
5. **Training Pipeline**: Opt-in consent, embargo-based release, simple dissociation (no text modification)
6. **Comment Interaction Tracking**:
   - Edit tracking (after comment, no comment, ignored)
   - Dismissal tracking
   - View tracking (when comment bar opened)
   - UPDATE button click tracking
   - Score change analysis
7. **Scalable**: Supports 10,000 registered users and 2,000 concurrent users

### Database Tables Summary

**Production Database:**
- users, sessions, audit_log
- encryption_keys
- papers, reviews, review_paragraphs
- review_comments, update_button_clicks
- paragraph_edit_history, comment_score_changes
- training_opt_in, data_export_requests

**Training Database:**
- training_data

### Next Steps

1. Set up development environment
2. Initialize Git repository
3. Create database schemas (Phase 1)
4. Implement authentication system
5. Set up CI/CD pipeline
6. Proceed through remaining phases sequentially
