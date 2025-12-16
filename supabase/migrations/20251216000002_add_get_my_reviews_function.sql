-- Function to get user's reviews with metadata for My Reviews list
-- Returns: review_id, paper info, last_updated, paragraph_count, word_count

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
    -- Count words from draft_content
    (
      SELECT
        CASE
          WHEN r.draft_content IS NULL OR r.draft_content = '' THEN 0
          ELSE array_length(string_to_array(trim(r.draft_content), ' '), 1)
        END
    )::INTEGER AS word_count,
    r.is_locked
  FROM public.reviews r
  JOIN public.papers p ON r.paper_id = p.id
  WHERE r.reviewer_user_id = auth.uid()
  ORDER BY r.updated_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.get_my_reviews IS 'Get list of user reviews with metadata for My Reviews screen';
