-- Update load_review_content to include original_content (last scored version)
-- This preserves the "modified" state when navigating away and back

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

  -- Fetch review with latest version AND last scored version for each paragraph
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
          'paragraph_id', latest.paragraph_id,
          'version', latest.version,
          'content', decrypt_text(latest.content_encrypted),
          'original_content', COALESCE(
            -- Find most recent version with scores (last scored content)
            (SELECT decrypt_text(scored.content_encrypted)
             FROM public.review_items scored
             WHERE scored.review_id = r.id
             AND scored.paragraph_id = latest.paragraph_id
             AND scored.is_deleted = false
             AND EXISTS (
               SELECT 1 FROM public.review_item_scores s
               WHERE s.review_item_id = scored.id
             )
             ORDER BY scored.version DESC
             LIMIT 1),
            -- If no scored version exists, use empty (shows as new/modified)
            ''
          ),
          'is_deleted', latest.is_deleted,
          'created_at', latest.created_at,
          'scores', (
            -- Get scores from latest version if available, otherwise from most recent scored version
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
            WHERE s.review_item_id = COALESCE(
              -- Try latest version first
              (SELECT id FROM public.review_items ri_latest
               WHERE ri_latest.id = latest.id
               AND EXISTS (SELECT 1 FROM public.review_item_scores WHERE review_item_id = ri_latest.id)),
              -- Fall back to most recent version with scores
              (SELECT ri_scored.id
               FROM public.review_items ri_scored
               WHERE ri_scored.review_id = r.id
               AND ri_scored.paragraph_id = latest.paragraph_id
               AND ri_scored.is_deleted = false
               AND EXISTS (SELECT 1 FROM public.review_item_scores WHERE review_item_id = ri_scored.id)
               ORDER BY ri_scored.version DESC
               LIMIT 1)
            )
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
        AND is_deleted = false
        ORDER BY paragraph_id ASC, version DESC
      ) latest
    )
  ) INTO v_result
  FROM public.reviews r
  WHERE r.id = p_review_id;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
