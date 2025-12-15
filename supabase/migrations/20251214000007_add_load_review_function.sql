-- Add function to load review content with decryption
-- This allows the frontend to retrieve and display saved review content

CREATE OR REPLACE FUNCTION public.load_review_content(
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

  -- Fetch review with decrypted content and all related data
  SELECT jsonb_build_object(
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
