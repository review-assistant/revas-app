-- Review Tracking System - Helper Functions Migration
-- This migration creates RPC functions for review management and GDPR compliance

-- ============================================================================
-- PART 1: Paper Management Functions
-- ============================================================================

-- Function to get or create a paper by title and conference
CREATE OR REPLACE FUNCTION public.get_or_create_paper(
  p_title TEXT DEFAULT NULL,
  p_conference TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_paper_id UUID;
BEGIN
  -- Try to match existing paper by title and conference
  IF p_title IS NOT NULL AND p_conference IS NOT NULL THEN
    SELECT id INTO v_paper_id
    FROM public.papers
    WHERE LOWER(title) = LOWER(p_title)
    AND LOWER(conference_or_journal) = LOWER(p_conference)
    LIMIT 1;
  ELSIF p_title IS NOT NULL THEN
    SELECT id INTO v_paper_id
    FROM public.papers
    WHERE LOWER(title) = LOWER(p_title)
    LIMIT 1;
  END IF;

  -- If no match, create new paper (auto-created by current reviewer)
  IF v_paper_id IS NULL THEN
    INSERT INTO public.papers (
      title,
      conference_or_journal,
      auto_created_by
    ) VALUES (
      p_title,
      p_conference,
      auth.uid()  -- Track which reviewer auto-created this paper
    )
    RETURNING id INTO v_paper_id;

    PERFORM log_audit_event('paper_auto_created', 'paper', v_paper_id, NULL);
  END IF;

  RETURN v_paper_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- PART 2: Review Management Functions
-- ============================================================================

-- Function to get or create a review for current user and paper
CREATE OR REPLACE FUNCTION public.get_or_create_review(
  p_paper_id UUID
)
RETURNS UUID AS $$
DECLARE
  v_review_id UUID;
BEGIN
  -- Try to find existing review
  SELECT id INTO v_review_id
  FROM public.reviews
  WHERE paper_id = p_paper_id
  AND reviewer_user_id = auth.uid()
  LIMIT 1;

  -- If no review exists, create one
  IF v_review_id IS NULL THEN
    INSERT INTO public.reviews (
      paper_id,
      reviewer_user_id
    ) VALUES (
      p_paper_id,
      auth.uid()
    )
    RETURNING id INTO v_review_id;

    PERFORM log_audit_event('review_created', 'review', v_review_id,
      jsonb_build_object('paper_id', p_paper_id));
  END IF;

  RETURN v_review_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to save review content with paragraphs
CREATE OR REPLACE FUNCTION public.save_review_content(
  p_review_id UUID,
  p_content TEXT,
  p_paragraphs JSONB -- [{paragraph_id, content, is_deleted}, ...]
)
RETURNS void AS $$
DECLARE
  v_paragraph JSONB;
  v_next_version INTEGER;
  v_encrypted_content TEXT;
  v_encrypted_review TEXT;
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

  -- Encrypt and update full review content
  v_encrypted_review := encrypt_text(p_content);
  UPDATE public.reviews
  SET content_encrypted = v_encrypted_review,
      updated_at = NOW()
  WHERE id = p_review_id;

  -- Process each paragraph
  FOR v_paragraph IN SELECT * FROM jsonb_array_elements(p_paragraphs)
  LOOP
    -- Get next version number
    SELECT COALESCE(MAX(version), 0) + 1 INTO v_next_version
    FROM public.review_items
    WHERE review_id = p_review_id
    AND paragraph_id = (v_paragraph->>'paragraph_id')::INTEGER;

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
      v_next_version,
      v_encrypted_content,
      COALESCE((v_paragraph->>'is_deleted')::BOOLEAN, false),
      CASE WHEN COALESCE((v_paragraph->>'is_deleted')::BOOLEAN, false) THEN NOW() ELSE NULL END
    );
  END LOOP;

  PERFORM log_audit_event('review_saved', 'review', p_review_id,
    jsonb_build_object('paragraph_count', jsonb_array_length(p_paragraphs)));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to save review item scores
CREATE OR REPLACE FUNCTION public.save_review_scores(
  p_review_id UUID,
  p_scores JSONB -- [{paragraph_id, dimension, score, previous_score, score_change, comment}, ...]
)
RETURNS void AS $$
DECLARE
  v_score JSONB;
  v_review_item_id UUID;
  v_encrypted_comment TEXT;
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

  -- Process each score
  FOR v_score IN SELECT * FROM jsonb_array_elements(p_scores)
  LOOP
    -- Get the latest review_item_id for this paragraph
    SELECT id INTO v_review_item_id
    FROM public.review_items
    WHERE review_id = p_review_id
    AND paragraph_id = (v_score->>'paragraph_id')::INTEGER
    ORDER BY version DESC
    LIMIT 1;

    IF v_review_item_id IS NULL THEN
      RAISE EXCEPTION 'Review item not found for paragraph %', v_score->>'paragraph_id';
    END IF;

    -- Encrypt comment if provided
    v_encrypted_comment := NULL;
    IF v_score->>'comment' IS NOT NULL THEN
      v_encrypted_comment := encrypt_text(v_score->>'comment');
    END IF;

    -- Upsert score
    INSERT INTO public.review_item_scores (
      review_item_id,
      dimension,
      score,
      previous_score,
      score_change,
      comment_encrypted
    ) VALUES (
      v_review_item_id,
      v_score->>'dimension',
      (v_score->>'score')::INTEGER,
      (v_score->>'previous_score')::INTEGER,
      v_score->>'score_change',
      v_encrypted_comment
    )
    ON CONFLICT (review_item_id, dimension)
    DO UPDATE SET
      score = EXCLUDED.score,
      previous_score = EXCLUDED.previous_score,
      score_change = EXCLUDED.score_change,
      comment_encrypted = EXCLUDED.comment_encrypted;
  END LOOP;

  PERFORM log_audit_event('scores_saved', 'review', p_review_id,
    jsonb_build_object('score_count', jsonb_array_length(p_scores)));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- PART 3: Interaction Tracking Functions
-- ============================================================================

-- Function to track comment interactions (views, dismissals)
CREATE OR REPLACE FUNCTION public.track_interaction(
  p_review_id UUID,
  p_paragraph_id INTEGER,
  p_dimension TEXT,
  p_interaction_type TEXT -- 'view' or 'dismiss'
)
RETURNS void AS $$
DECLARE
  v_review_item_id UUID;
BEGIN
  -- Verify ownership
  IF NOT EXISTS (
    SELECT 1 FROM public.reviews
    WHERE id = p_review_id
    AND reviewer_user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Review not found';
  END IF;

  -- Get the latest review_item_id for this paragraph
  SELECT id INTO v_review_item_id
  FROM public.review_items
  WHERE review_id = p_review_id
  AND paragraph_id = p_paragraph_id
  ORDER BY version DESC
  LIMIT 1;

  IF v_review_item_id IS NULL THEN
    RAISE EXCEPTION 'Review item not found for paragraph %', p_paragraph_id;
  END IF;

  -- Upsert interaction based on type
  IF p_interaction_type = 'view' THEN
    INSERT INTO public.review_item_interactions (
      review_item_id,
      dimension,
      comment_viewed,
      comment_viewed_at
    ) VALUES (
      v_review_item_id,
      p_dimension,
      true,
      NOW()
    )
    ON CONFLICT (review_item_id, dimension)
    DO UPDATE SET
      comment_viewed = true,
      comment_viewed_at = NOW();
  ELSIF p_interaction_type = 'dismiss' THEN
    INSERT INTO public.review_item_interactions (
      review_item_id,
      dimension,
      comment_dismissed,
      comment_dismissed_at
    ) VALUES (
      v_review_item_id,
      p_dimension,
      true,
      NOW()
    )
    ON CONFLICT (review_item_id, dimension)
    DO UPDATE SET
      comment_dismissed = true,
      comment_dismissed_at = NOW();
  ELSE
    RAISE EXCEPTION 'Invalid interaction type: %', p_interaction_type;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- PART 4: GDPR Functions
-- ============================================================================

-- Function to export all user data (GDPR right to data portability)
CREATE OR REPLACE FUNCTION public.export_user_data_gdpr()
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'user', (
      SELECT jsonb_build_object(
        'id', id,
        'email', email,
        'created_at', created_at
      )
      FROM auth.users
      WHERE id = v_user_id
    ),
    'profile', (
      SELECT to_jsonb(p)
      FROM public.profiles p
      WHERE id = v_user_id
    ),
    'reviews', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'paper_id', r.paper_id,
          'content', decrypt_text(r.content_encrypted),
          'is_locked', r.is_locked,
          'created_at', r.created_at,
          'updated_at', r.updated_at,
          'review_items', (
            SELECT jsonb_agg(
              jsonb_build_object(
                'paragraph_id', ri.paragraph_id,
                'version', ri.version,
                'content', decrypt_text(ri.content_encrypted),
                'is_deleted', ri.is_deleted,
                'created_at', ri.created_at,
                'scores', (
                  SELECT jsonb_agg(
                    jsonb_build_object(
                      'dimension', s.dimension,
                      'score', s.score,
                      'previous_score', s.previous_score,
                      'score_change', s.score_change,
                      'comment', decrypt_text(s.comment_encrypted)
                    )
                  )
                  FROM public.review_item_scores s
                  WHERE s.review_item_id = ri.id
                ),
                'interactions', (
                  SELECT jsonb_agg(to_jsonb(i))
                  FROM public.review_item_interactions i
                  WHERE i.review_item_id = ri.id
                )
              )
            )
            FROM public.review_items ri
            WHERE ri.review_id = r.id
          )
        )
      )
      FROM public.reviews r
      WHERE r.reviewer_user_id = v_user_id
    ),
    'consents', (
      SELECT jsonb_agg(to_jsonb(c))
      FROM public.user_consents c
      WHERE c.user_id = v_user_id
    ),
    'audit_logs', (
      SELECT jsonb_agg(to_jsonb(a))
      FROM public.audit_logs a
      WHERE a.user_id = v_user_id
    ),
    'export_date', NOW()
  ) INTO v_result;

  PERFORM log_audit_event('data_export', 'user', v_user_id, NULL);

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to delete user account (GDPR right to erasure)
CREATE OR REPLACE FUNCTION public.delete_user_gdpr()
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_has_embargo_reviews BOOLEAN;
BEGIN
  -- Check for reviews under embargo
  SELECT EXISTS (
    SELECT 1 FROM public.reviews r
    JOIN public.papers p ON r.paper_id = p.id
    WHERE r.reviewer_user_id = v_user_id
    AND p.embargo_active = true
  ) INTO v_has_embargo_reviews;

  IF v_has_embargo_reviews THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'active_embargo',
      'message', 'You have reviews under embargo that cannot be deleted. Please contact support.'
    );
  END IF;

  -- Log deletion before deleting audit logs
  PERFORM log_audit_event('account_deletion', 'user', v_user_id, NULL);

  -- Update papers to remove user references
  UPDATE public.papers SET auto_created_by = NULL WHERE auto_created_by = v_user_id;
  UPDATE public.papers SET embargo_lifted_by = NULL WHERE embargo_lifted_by = v_user_id;

  -- Anonymize audit logs (keep for compliance)
  UPDATE public.audit_logs
  SET user_id = NULL,
      details = jsonb_build_object('anonymized', true)
  WHERE user_id = v_user_id;

  -- Delete reviews (cascades to items, scores, interactions)
  DELETE FROM public.reviews WHERE reviewer_user_id = v_user_id;

  -- Delete consents
  DELETE FROM public.user_consents WHERE user_id = v_user_id;

  -- Delete profile
  DELETE FROM public.profiles WHERE id = v_user_id;

  -- Delete auth user (final step)
  DELETE FROM auth.users WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Account deleted successfully'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
