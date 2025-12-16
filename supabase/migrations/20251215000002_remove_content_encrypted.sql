-- Remove content_encrypted field and use only review_items
-- This eliminates redundancy and makes review_items the single source of truth

-- ============================================================================
-- PART 1: Drop content_encrypted column
-- ============================================================================

ALTER TABLE public.reviews DROP COLUMN IF EXISTS content_encrypted;

-- ============================================================================
-- PART 2: Update save_review_content function
-- Remove p_content parameter and content saving logic
-- ============================================================================

CREATE OR REPLACE FUNCTION public.save_review_content(
  p_review_id UUID,
  p_paragraphs JSONB -- [{paragraph_id, content, is_deleted}, ...]
)
RETURNS void AS $$
DECLARE
  v_paragraph JSONB;
  v_next_version INTEGER;
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

  -- Update review timestamp
  UPDATE public.reviews
  SET updated_at = NOW()
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

-- ============================================================================
-- PART 3: Update load_review_content function
-- Reconstruct full text from review_items
-- ============================================================================

CREATE OR REPLACE FUNCTION public.load_review_content(
  p_review_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
  v_content TEXT;
BEGIN
  -- Verify ownership
  IF NOT EXISTS (
    SELECT 1 FROM public.reviews
    WHERE id = p_review_id
    AND reviewer_user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Review not found or access denied';
  END IF;

  -- Reconstruct full content from review_items
  SELECT string_agg(decrypt_text(ri.content_encrypted), E'\n\n' ORDER BY ri.paragraph_id)
  INTO v_content
  FROM (
    SELECT DISTINCT ON (paragraph_id) *
    FROM public.review_items
    WHERE review_id = p_review_id
    AND is_deleted = false
    ORDER BY paragraph_id ASC, version DESC
  ) ri;

  -- Fetch review with reconstructed content and all related data
  SELECT jsonb_build_object(
    'id', r.id,
    'paper_id', r.paper_id,
    'content', v_content,
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
            WHERE s.review_item_id = ri.id
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
            WHERE i.review_item_id = ri.id
          )
        )
        ORDER BY ri.paragraph_id ASC, ri.version DESC
      )
      FROM (
        SELECT DISTINCT ON (paragraph_id) *
        FROM public.review_items
        WHERE review_id = r.id
        AND is_deleted = false
        ORDER BY paragraph_id ASC, version DESC
      ) ri
    )
  ) INTO v_result
  FROM public.reviews r
  WHERE r.id = p_review_id;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- PART 4: Update view_my_tables function
-- Reconstruct content from review_items
-- ============================================================================

CREATE OR REPLACE FUNCTION public.view_my_tables()
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'papers', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'title', p.title,
          'conference_or_journal', p.conference_or_journal,
          'embargo_active', p.embargo_active,
          'created_at', p.created_at,
          'reviews', (
            SELECT jsonb_agg(
              jsonb_build_object(
                'id', r.id,
                'content', (
                  -- Reconstruct full content from review_items
                  SELECT string_agg(decrypt_text(ri2.content_encrypted), E'\n\n' ORDER BY ri2.paragraph_id)
                  FROM (
                    SELECT DISTINCT ON (paragraph_id) *
                    FROM public.review_items
                    WHERE review_id = r.id
                    AND is_deleted = false
                    ORDER BY paragraph_id ASC, version DESC
                  ) ri2
                ),
                'is_locked', r.is_locked,
                'created_at', r.created_at,
                'updated_at', r.updated_at,
                'review_items', (
                  SELECT jsonb_agg(
                    jsonb_build_object(
                      'id', ri.id,
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
                            'comment', decrypt_text(s.comment_encrypted)
                          )
                        )
                        FROM public.review_item_scores s
                        WHERE s.review_item_id = ri.id
                      )
                    )
                    ORDER BY ri.paragraph_id, ri.version DESC
                  )
                  FROM public.review_items ri
                  WHERE ri.review_id = r.id
                )
              )
            )
            FROM public.reviews r
            WHERE r.paper_id = p.id
            AND r.reviewer_user_id = v_user_id
          )
        )
      )
      FROM public.papers p
      WHERE p.auto_created_by = v_user_id
      OR EXISTS (
        SELECT 1 FROM public.reviews r2
        WHERE r2.paper_id = p.id
        AND r2.reviewer_user_id = v_user_id
      )
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- PART 5: Update export_user_data_gdpr function
-- Reconstruct content from review_items
-- ============================================================================

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
          'content', (
            -- Reconstruct full content from review_items
            SELECT string_agg(decrypt_text(ri2.content_encrypted), E'\n\n' ORDER BY ri2.paragraph_id)
            FROM (
              SELECT DISTINCT ON (paragraph_id) *
              FROM public.review_items
              WHERE review_id = r.id
              AND is_deleted = false
              ORDER BY paragraph_id ASC, version DESC
            ) ri2
          ),
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
