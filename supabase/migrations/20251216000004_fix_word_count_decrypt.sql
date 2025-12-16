-- Fix word count by decrypting draft_content first
-- Also add draft to my_tables and export functions

-- ============================================================================
-- PART 1: Fix get_my_reviews to decrypt before counting
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_my_reviews();

CREATE OR REPLACE FUNCTION public.get_my_reviews()
RETURNS TABLE (
  review_id UUID,
  paper_id UUID,
  paper_title TEXT,
  paper_conference TEXT,
  last_updated TIMESTAMP WITH TIME ZONE,
  paragraph_count INTEGER,
  word_count INTEGER,
  is_locked BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.id AS review_id,
    p.id AS paper_id,
    p.title AS paper_title,
    p.conference_or_journal AS paper_conference,
    r.updated_at AS last_updated,
    -- Count paragraphs from latest version of each paragraph_id
    (
      SELECT COUNT(DISTINCT paragraph_id)
      FROM public.review_items ri
      WHERE ri.review_id = r.id
      AND ri.is_deleted = false
    )::INTEGER AS paragraph_count,
    -- Count words from DECRYPTED draft_content
    (
      SELECT
        CASE
          WHEN r.draft_content IS NULL OR r.draft_content = '' THEN 0
          ELSE (
            SELECT COUNT(*)
            FROM unnest(regexp_split_to_array(decrypt_text(r.draft_content), '\s+')) AS word
            WHERE word != ''
          )
        END
    )::INTEGER AS word_count,
    r.is_locked
  FROM public.reviews r
  JOIN public.papers p ON r.paper_id = p.id
  WHERE r.reviewer_user_id = auth.uid()
  ORDER BY r.updated_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.get_my_reviews IS 'Get list of user reviews with metadata';

-- ============================================================================
-- PART 2: Add draft to get_my_tables_data
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_my_tables_data();

CREATE OR REPLACE FUNCTION public.get_my_tables_data()
RETURNS TABLE (
  review_id UUID,
  paper_title TEXT,
  paper_conference TEXT,
  paragraph_id INTEGER,
  paragraph_text TEXT,
  draft_text TEXT,
  created_at TIMESTAMP WITH TIME ZONE,
  scores JSONB
) AS $$
BEGIN
  RETURN QUERY
  WITH latest_versions AS (
    SELECT DISTINCT ON (ri.review_id, ri.paragraph_id)
      ri.review_id,
      ri.paragraph_id,
      ri.content_encrypted,
      ri.created_at
    FROM public.review_items ri
    WHERE ri.is_deleted = false
    ORDER BY ri.review_id, ri.paragraph_id, ri.version DESC
  )
  SELECT
    r.id AS review_id,
    p.title AS paper_title,
    p.conference_or_journal AS paper_conference,
    lv.paragraph_id,
    decrypt_text(lv.content_encrypted) AS paragraph_text,
    -- Extract corresponding paragraph from draft_content
    (
      SELECT
        CASE
          WHEN r.draft_content IS NULL OR r.draft_content = '' THEN NULL
          ELSE (
            -- Split draft into paragraphs and get the nth one (1-indexed)
            SELECT paragraph
            FROM unnest(regexp_split_to_array(decrypt_text(r.draft_content), '\n\n+')) WITH ORDINALITY AS t(paragraph, idx)
            WHERE idx = lv.paragraph_id
            LIMIT 1
          )
        END
    ) AS draft_text,
    lv.created_at,
    (
      SELECT jsonb_object_agg(s.dimension, jsonb_build_object(
        'score', s.score,
        'previous_score', s.previous_score,
        'score_change', s.score_change,
        'comment', decrypt_text(s.comment_encrypted)
      ))
      FROM public.review_item_scores s
      WHERE s.review_item_id IN (
        SELECT id FROM public.review_items ri2
        WHERE ri2.review_id = lv.review_id
        AND ri2.paragraph_id = lv.paragraph_id
        AND ri2.version = (
          SELECT MAX(version)
          FROM public.review_items ri3
          WHERE ri3.review_id = lv.review_id
          AND ri3.paragraph_id = lv.paragraph_id
        )
      )
    ) AS scores
  FROM latest_versions lv
  JOIN public.reviews r ON lv.review_id = r.id
  JOIN public.papers p ON r.paper_id = p.id
  WHERE r.reviewer_user_id = auth.uid()
  ORDER BY r.updated_at DESC, lv.paragraph_id ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.get_my_tables_data IS 'Get all paragraph data for MyTables view with draft text';

-- ============================================================================
-- PART 3: Update GDPR export to include draft
-- ============================================================================

DROP FUNCTION IF EXISTS public.export_user_data_gdpr();

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
          'paper_title', p.title,
          'paper_conference', p.conference_or_journal,
          'draft_content', decrypt_text(r.draft_content),
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
      JOIN public.papers p ON r.paper_id = p.id
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

COMMENT ON FUNCTION public.export_user_data_gdpr IS 'Export all user data for GDPR compliance with decrypted content';
