-- Separate drafts from versions: Option A architecture
-- reviews.draft_content = autosaved work in progress
-- review_items = scored snapshots created by UPDATE only

-- ============================================================================
-- PART 1: Add draft_content to reviews table
-- ============================================================================

ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS draft_content TEXT;

COMMENT ON COLUMN public.reviews.draft_content IS 'Current work in progress (autosaved). Encrypted full review text.';

-- ============================================================================
-- PART 2: Simplified autosave - just update draft
-- ============================================================================

CREATE OR REPLACE FUNCTION public.save_draft(
  p_review_id UUID,
  p_content TEXT
)
RETURNS void AS $$
DECLARE
  v_encrypted_content TEXT;
BEGIN
  -- Verify ownership and lock status
  IF NOT EXISTS (
    SELECT 1 FROM public.reviews
    WHERE id = p_review_id
    AND reviewer_user_id = auth.uid()
    AND is_locked = false
  ) THEN
    RAISE EXCEPTION 'Review not found or locked';
  END IF;

  -- Encrypt and update draft
  v_encrypted_content := encrypt_text(p_content);

  UPDATE public.reviews
  SET draft_content = v_encrypted_content,
      updated_at = NOW()
  WHERE id = p_review_id;

  PERFORM log_audit_event('draft_saved', 'review', p_review_id, NULL);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- PART 3: Create version from draft (called after UPDATE with scores)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_version_from_draft(
  p_review_id UUID,
  p_paragraphs JSONB -- [{paragraph_id, content}, ...]
)
RETURNS INTEGER AS $$
DECLARE
  v_paragraph JSONB;
  v_version INTEGER;
  v_encrypted_content TEXT;
BEGIN
  -- Verify ownership and lock status
  IF NOT EXISTS (
    SELECT 1 FROM public.reviews
    WHERE id = p_review_id
    AND reviewer_user_id = auth.uid()
    AND is_locked = false
  ) THEN
    RAISE EXCEPTION 'Review not found or locked';
  END IF;

  -- Get next version number (same for all paragraphs in this UPDATE)
  SELECT COALESCE(MAX(version), 0) + 1 INTO v_version
  FROM public.review_items
  WHERE review_id = p_review_id;

  -- Create version for each paragraph
  FOR v_paragraph IN SELECT * FROM jsonb_array_elements(p_paragraphs)
  LOOP
    -- Encrypt paragraph content
    v_encrypted_content := encrypt_text(v_paragraph->>'content');

    -- Insert new version
    INSERT INTO public.review_items (
      review_id,
      paragraph_id,
      version,
      content_encrypted,
      is_deleted,
      deleted_at
    ) VALUES (
      p_review_id,
      (v_paragraph->>'paragraph_id')::INTEGER,
      v_version,
      v_encrypted_content,
      false,
      NULL
    );
  END LOOP;

  PERFORM log_audit_event('version_created', 'review', p_review_id,
    jsonb_build_object('version', v_version, 'paragraph_count', jsonb_array_length(p_paragraphs)));

  RETURN v_version;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- PART 4: Load draft and latest scored version
-- ============================================================================

CREATE OR REPLACE FUNCTION public.load_review_with_draft(
  p_review_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  -- Verify ownership
  IF NOT EXISTS (
    SELECT 1 FROM public.reviews
    WHERE id = p_review_id
    AND reviewer_user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Review not found or access denied';
  END IF;

  -- Fetch review with draft and latest scored version
  SELECT jsonb_build_object(
    'id', r.id,
    'paper_id', r.paper_id,
    'draft_content', decrypt_text(r.draft_content),
    'is_locked', r.is_locked,
    'created_at', r.created_at,
    'updated_at', r.updated_at,
    'latest_version', (
      SELECT COALESCE(MAX(version), 0)
      FROM public.review_items
      WHERE review_id = r.id
    ),
    'paragraphs', (
      -- Get latest scored version for each paragraph
      SELECT jsonb_agg(
        jsonb_build_object(
          'paragraph_id', latest.paragraph_id,
          'version', latest.version,
          'content', decrypt_text(latest.content_encrypted),
          'created_at', latest.created_at,
          'scores', (
            SELECT jsonb_object_agg(
              s.dimension,
              jsonb_build_object(
                'score', s.score,
                'previous_score', s.previous_score,
                'score_change', s.score_change,
                'comment', decrypt_text(s.comment_encrypted)
              )
            )
            FROM public.review_item_scores s
            WHERE s.review_item_id = latest.id
          ),
          'interactions', (
            SELECT jsonb_object_agg(
              i.dimension,
              jsonb_build_object(
                'comment_viewed', i.comment_viewed,
                'comment_viewed_at', i.comment_viewed_at,
                'comment_dismissed', i.comment_dismissed,
                'comment_dismissed_at', i.comment_dismissed_at
              )
            )
            FROM public.review_item_interactions i
            WHERE i.review_item_id = latest.id
          )
        )
        ORDER BY latest.paragraph_id ASC
      )
      FROM (
        SELECT DISTINCT ON (paragraph_id) *
        FROM public.review_items
        WHERE review_id = r.id
        ORDER BY paragraph_id ASC, version DESC
      ) latest
    )
  ) INTO v_result
  FROM public.reviews r
  WHERE r.id = p_review_id;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- PART 5: Drop old complex functions (no longer needed)
-- ============================================================================

DROP FUNCTION IF EXISTS public.save_review_content(UUID, JSONB, BOOLEAN);
DROP FUNCTION IF EXISTS public.load_review_content(UUID);

COMMENT ON FUNCTION public.save_draft IS 'Autosave: updates draft_content only';
COMMENT ON FUNCTION public.create_version_from_draft IS 'Creates versioned snapshot after UPDATE completes';
COMMENT ON FUNCTION public.load_review_with_draft IS 'Loads draft (current) and latest scored version (original)';
