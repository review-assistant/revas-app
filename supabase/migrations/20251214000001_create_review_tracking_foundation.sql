-- Review Tracking System - Foundation Migration
-- This migration creates the core tables for tracking papers, reviews, review items, scores, and interactions

-- ============================================================================
-- PART 1: Extensions and Admin Flag
-- ============================================================================

-- Enable pgcrypto for encryption
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Add admin flag to existing profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

-- ============================================================================
-- PART 2: Encryption Helper Functions
-- ============================================================================

-- Function to encrypt text using pgcrypto
CREATE OR REPLACE FUNCTION public.encrypt_text(plain_text TEXT)
RETURNS TEXT AS $$
DECLARE
  v_key TEXT := current_setting('app.encryption_key', true);
BEGIN
  IF v_key IS NULL THEN
    RAISE EXCEPTION 'Encryption key not set';
  END IF;
  RETURN encode(pgp_sym_encrypt(plain_text, v_key), 'base64');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to decrypt text using pgcrypto
CREATE OR REPLACE FUNCTION public.decrypt_text(encrypted_text TEXT)
RETURNS TEXT AS $$
DECLARE
  v_key TEXT := current_setting('app.encryption_key', true);
BEGIN
  IF v_key IS NULL OR encrypted_text IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN pgp_sym_decrypt(decode(encrypted_text, 'base64'), v_key);
EXCEPTION WHEN OTHERS THEN
  RETURN NULL; -- Return NULL if decryption fails
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- PART 3: Create Tables
-- ============================================================================

-- Papers table: Top-level entity with embargo management
-- Papers can be created by admins OR auto-created by reviewers
CREATE TABLE public.papers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT,
  conference_or_journal TEXT,
  -- Track which reviewer auto-created this paper (NULL if admin-created)
  -- Used by admins to review auto-created entries for correctness
  auto_created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Embargo management (admin controlled)
  embargo_active BOOLEAN NOT NULL DEFAULT true,
  embargo_lifted_at TIMESTAMP WITH TIME ZONE,
  embargo_lifted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Training data export tracking
  training_data_exported BOOLEAN NOT NULL DEFAULT false,
  training_data_exported_at TIMESTAMP WITH TIME ZONE,
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Reviews table: One review per reviewer per paper
CREATE TABLE public.reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paper_id UUID NOT NULL REFERENCES public.papers(id) ON DELETE CASCADE,
  reviewer_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Encrypted full review text
  content_encrypted TEXT,
  -- Lock state (locked after embargo lifted)
  is_locked BOOLEAN NOT NULL DEFAULT false,
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(paper_id, reviewer_user_id)
);

-- Review items table: Individual paragraphs with versioning
CREATE TABLE public.review_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id UUID NOT NULL REFERENCES public.reviews(id) ON DELETE CASCADE,
  -- Stable paragraph ID (matches client-side paragraph.id)
  paragraph_id INTEGER NOT NULL,
  -- Version tracking
  version INTEGER NOT NULL DEFAULT 1,
  -- Encrypted paragraph content
  content_encrypted TEXT NOT NULL,
  -- Soft delete (retain history)
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMP WITH TIME ZONE,
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Review item scores table: AI-generated scores for 4 dimensions
CREATE TABLE public.review_item_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_item_id UUID NOT NULL REFERENCES public.review_items(id) ON DELETE CASCADE,
  dimension TEXT NOT NULL CHECK (dimension IN ('Actionability', 'Grounding', 'Helpfulness', 'Verifiability')),
  score INTEGER NOT NULL CHECK (score >= 1 AND score <= 5),
  -- Change tracking from previous version
  previous_score INTEGER CHECK (previous_score >= 1 AND previous_score <= 5),
  score_change TEXT CHECK (score_change IN ('improved', 'worse', 'unchanged')),
  -- Encrypted AI comment/rationale
  comment_encrypted TEXT,
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(review_item_id, dimension)
);

-- Review item interactions table: User interaction tracking (views, dismissals)
CREATE TABLE public.review_item_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_item_id UUID NOT NULL REFERENCES public.review_items(id) ON DELETE CASCADE,
  dimension TEXT NOT NULL CHECK (dimension IN ('Actionability', 'Grounding', 'Helpfulness', 'Verifiability')),
  -- Interaction flags
  comment_viewed BOOLEAN NOT NULL DEFAULT false,
  comment_viewed_at TIMESTAMP WITH TIME ZONE,
  comment_dismissed BOOLEAN NOT NULL DEFAULT false,
  comment_dismissed_at TIMESTAMP WITH TIME ZONE,
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(review_item_id, dimension)
);

-- ============================================================================
-- PART 4: Create Indexes
-- ============================================================================

-- Papers indexes
CREATE INDEX idx_papers_auto_created_by ON public.papers(auto_created_by);
CREATE INDEX idx_papers_embargo ON public.papers(embargo_active);
CREATE INDEX idx_papers_training ON public.papers(training_data_exported)
  WHERE training_data_exported = false;

-- Reviews indexes
CREATE INDEX idx_reviews_paper ON public.reviews(paper_id);
CREATE INDEX idx_reviews_reviewer ON public.reviews(reviewer_user_id);
CREATE INDEX idx_reviews_locked ON public.reviews(is_locked);

-- Review items indexes
CREATE INDEX idx_review_items_review ON public.review_items(review_id);
CREATE INDEX idx_review_items_paragraph_version ON public.review_items(review_id, paragraph_id, version DESC);
CREATE INDEX idx_review_items_active ON public.review_items(review_id, is_deleted)
  WHERE is_deleted = false;

-- Review item scores indexes
CREATE INDEX idx_scores_item ON public.review_item_scores(review_item_id);
CREATE INDEX idx_scores_dimension ON public.review_item_scores(dimension);
CREATE INDEX idx_scores_score ON public.review_item_scores(score);

-- Review item interactions indexes
CREATE INDEX idx_interactions_item ON public.review_item_interactions(review_item_id);
CREATE INDEX idx_interactions_viewed ON public.review_item_interactions(comment_viewed);
CREATE INDEX idx_interactions_dismissed ON public.review_item_interactions(comment_dismissed);

-- ============================================================================
-- PART 5: Enable Row Level Security
-- ============================================================================

ALTER TABLE public.papers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_item_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_item_interactions ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PART 6: Create RLS Policies (AFTER all tables exist)
-- ============================================================================

-- Papers policies
-- Papers are publicly viewable metadata (title, conference)
-- Privacy is enforced at the review level, not the paper level
CREATE POLICY "Anyone can view papers"
  ON public.papers FOR SELECT
  USING (true);  -- All authenticated users can see all papers

CREATE POLICY "Anyone can create papers"
  ON public.papers FOR INSERT
  WITH CHECK (true);  -- Reviewers can auto-create, admins can manually create

CREATE POLICY "Admins can update papers"
  ON public.papers FOR UPDATE
  USING ((SELECT is_admin FROM public.profiles WHERE id = auth.uid()));

-- Reviews policies
CREATE POLICY "Reviewers can view own reviews"
  ON public.reviews FOR SELECT
  USING (
    auth.uid() = reviewer_user_id OR
    (SELECT is_admin FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "Reviewers can create reviews"
  ON public.reviews FOR INSERT
  WITH CHECK (auth.uid() = reviewer_user_id);

CREATE POLICY "Reviewers can update unlocked reviews"
  ON public.reviews FOR UPDATE
  USING (auth.uid() = reviewer_user_id AND is_locked = false);

-- Review items policies
CREATE POLICY "Users can view own review items"
  ON public.review_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.reviews
      WHERE reviews.id = review_items.review_id
      AND reviews.reviewer_user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own review items"
  ON public.review_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.reviews
      WHERE reviews.id = review_items.review_id
      AND reviews.reviewer_user_id = auth.uid()
      AND reviews.is_locked = false
    )
  );

CREATE POLICY "Users can update own review items"
  ON public.review_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.reviews
      WHERE reviews.id = review_items.review_id
      AND reviews.reviewer_user_id = auth.uid()
      AND reviews.is_locked = false
    )
  );

-- Review item scores policies (inherit from review_items via foreign key)
CREATE POLICY "Users can view own review item scores"
  ON public.review_item_scores FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.review_items
      JOIN public.reviews ON reviews.id = review_items.review_id
      WHERE review_items.id = review_item_scores.review_item_id
      AND reviews.reviewer_user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert review item scores"
  ON public.review_item_scores FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.review_items
      JOIN public.reviews ON reviews.id = review_items.review_id
      WHERE review_items.id = review_item_scores.review_item_id
      AND reviews.reviewer_user_id = auth.uid()
      AND reviews.is_locked = false
    )
  );

CREATE POLICY "Users can update review item scores"
  ON public.review_item_scores FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.review_items
      JOIN public.reviews ON reviews.id = review_items.review_id
      WHERE review_items.id = review_item_scores.review_item_id
      AND reviews.reviewer_user_id = auth.uid()
      AND reviews.is_locked = false
    )
  );

-- Review item interactions policies (inherit from review_items via foreign key)
CREATE POLICY "Users can view own interactions"
  ON public.review_item_interactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.review_items
      JOIN public.reviews ON reviews.id = review_items.review_id
      WHERE review_items.id = review_item_interactions.review_item_id
      AND reviews.reviewer_user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert interactions"
  ON public.review_item_interactions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.review_items
      JOIN public.reviews ON reviews.id = review_items.review_id
      WHERE review_items.id = review_item_interactions.review_item_id
      AND reviews.reviewer_user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update interactions"
  ON public.review_item_interactions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.review_items
      JOIN public.reviews ON reviews.id = review_items.review_id
      WHERE review_items.id = review_item_interactions.review_item_id
      AND reviews.reviewer_user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 7: Create Triggers for updated_at
-- ============================================================================

-- Trigger for papers updated_at
CREATE TRIGGER set_papers_updated_at
  BEFORE UPDATE ON public.papers
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Trigger for reviews updated_at
CREATE TRIGGER set_reviews_updated_at
  BEFORE UPDATE ON public.reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Trigger for review_items updated_at
CREATE TRIGGER set_review_items_updated_at
  BEFORE UPDATE ON public.review_items
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Trigger for review_item_interactions updated_at
CREATE TRIGGER set_review_item_interactions_updated_at
  BEFORE UPDATE ON public.review_item_interactions
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();
