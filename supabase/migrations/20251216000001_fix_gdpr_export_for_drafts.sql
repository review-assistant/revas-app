-- Fix GDPR export to include draft_content from Option A architecture
-- draft_content contains the current work in progress (autosaved)
-- review_items contain scored snapshots (created on UPDATE)

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

COMMENT ON FUNCTION public.export_user_data_gdpr IS 'GDPR-compliant data export: includes draft_content (current work) and review_items (scored versions)';
