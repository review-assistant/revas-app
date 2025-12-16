-- Create function to view decrypted data for debugging
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
                'content', decrypt_text(r.content_encrypted),
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
