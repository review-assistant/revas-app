-- ============================================================================
-- Update view_my_tables to return ALL versions per paragraph (not just latest)
-- This enables the UI to show version history and track inherited dismissals
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
                    -- Reconstruct full content from review_items (latest version)
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
                    -- Return ALL versions, not just latest, for version history display
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
                    FROM public.review_items ri
                    WHERE ri.review_id = r.id
                    AND ri.is_deleted = false
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

COMMENT ON FUNCTION public.view_my_tables IS 'View all review data including all versions per paragraph for history display';
