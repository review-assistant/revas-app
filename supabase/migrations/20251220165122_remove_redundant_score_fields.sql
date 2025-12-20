-- Remove redundant previous_score and score_change fields from review_item_scores
-- These can be computed from version history by joining successive review_items
-- This simplifies the schema and avoids storing denormalized data

ALTER TABLE public.review_item_scores
DROP COLUMN IF EXISTS previous_score,
DROP COLUMN IF EXISTS score_change;

-- ============================================================================
-- Update save_review_scores function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.save_review_scores(
  p_review_id UUID,
  p_scores JSONB -- [{paragraph_id, dimension, score, comment}, ...]
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
      comment_encrypted
    ) VALUES (
      v_review_item_id,
      v_score->>'dimension',
      (v_score->>'score')::INTEGER,
      v_encrypted_comment
    )
    ON CONFLICT (review_item_id, dimension)
    DO UPDATE SET
      score = EXCLUDED.score,
      comment_encrypted = EXCLUDED.comment_encrypted;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- Update load_review_with_draft function
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
-- Update get_my_tables_data function
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
-- Update view_my_tables function
-- ============================================================================

DROP FUNCTION IF EXISTS public.view_my_tables();

CREATE OR REPLACE FUNCTION public.view_my_tables()
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'papers', (
      SELECT jsonb_agg(paper_data ORDER BY created_at DESC)
      FROM (
        SELECT
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
                    -- Reconstruct full content from review_items (scored/original version)
                    SELECT string_agg(decrypt_text(ri2.content_encrypted), E'\n\n' ORDER BY ri2.paragraph_id)
                    FROM (
                      SELECT DISTINCT ON (paragraph_id) *
                      FROM public.review_items
                      WHERE review_id = r.id
                      AND is_deleted = false
                      ORDER BY paragraph_id ASC, version DESC
                    ) ri2
                  ),
                  'draft_content', decrypt_text(r.draft_content),
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
                        'updated_at', ri.updated_at,
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
                        ),
                        'interactions', (
                          SELECT jsonb_agg(
                            jsonb_build_object(
                              'dimension', i.dimension,
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
                )
              )
              FROM public.reviews r
              WHERE r.paper_id = p.id
              AND r.reviewer_user_id = v_user_id
            )
          ) AS paper_data,
          p.created_at
        FROM public.papers p
        WHERE EXISTS (
          SELECT 1 FROM public.reviews r2
          WHERE r2.paper_id = p.id
          AND r2.reviewer_user_id = v_user_id
        )
      ) papers_with_date
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.view_my_tables IS 'View all review data with both scored content and draft content';

-- ============================================================================
-- Update export_user_data_gdpr function
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

-- ============================================================================
-- Add comment explaining how to compute score changes for analytics
-- ============================================================================

COMMENT ON TABLE public.review_item_scores IS
'Stores AI-generated scores for review items. Score changes between versions
can be computed by joining review_items across versions:

Example query to get score changes:
SELECT
  curr.paragraph_id,
  curr.dimension,
  prev_score.score as previous_score,
  curr_score.score as current_score,
  CASE
    WHEN curr_score.score > prev_score.score THEN ''improved''
    WHEN curr_score.score < prev_score.score THEN ''worse''
    ELSE ''unchanged''
  END as score_change
FROM review_items curr
JOIN review_items prev ON prev.review_id = curr.review_id
  AND prev.paragraph_id = curr.paragraph_id
  AND prev.version = curr.version - 1
JOIN review_item_scores curr_score ON curr_score.review_item_id = curr.id
JOIN review_item_scores prev_score ON prev_score.review_item_id = prev.id
  AND prev_score.dimension = curr_score.dimension;';
