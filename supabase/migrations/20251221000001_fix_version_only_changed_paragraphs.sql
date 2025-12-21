-- ============================================================================
-- Fix create_version_from_draft to only version changed paragraphs
-- ============================================================================
-- Previously, all paragraphs were versioned on every UPDATE, even if unchanged.
-- Now, only paragraphs with actual content changes get a new version.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_version_from_draft(
  p_review_id UUID,
  p_paragraphs JSONB -- [{paragraph_id, content}, ...]
)
RETURNS INTEGER AS $$
DECLARE
  v_paragraph JSONB;
  v_version INTEGER;
  v_encrypted_content TEXT;
  v_previous_content TEXT;
  v_changed_count INTEGER := 0;
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

  -- Get next version number (same for all changed paragraphs in this UPDATE)
  SELECT COALESCE(MAX(version), 0) + 1 INTO v_version
  FROM public.review_items
  WHERE review_id = p_review_id;

  -- Create version only for paragraphs that have changed
  FOR v_paragraph IN SELECT * FROM jsonb_array_elements(p_paragraphs)
  LOOP
    -- Get previous version's decrypted content for this paragraph
    SELECT decrypt_text(content_encrypted) INTO v_previous_content
    FROM public.review_items
    WHERE review_id = p_review_id
      AND paragraph_id = (v_paragraph->>'paragraph_id')::INTEGER
      AND is_deleted = false
    ORDER BY version DESC
    LIMIT 1;

    -- Only create new version if content has changed (or is new)
    IF v_previous_content IS NULL OR v_previous_content != (v_paragraph->>'content') THEN
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
        v_version,
        v_encrypted_content,
        false,
        NULL
      );

      v_changed_count := v_changed_count + 1;
    END IF;
  END LOOP;

  -- Only log if something actually changed
  IF v_changed_count > 0 THEN
    PERFORM log_audit_event('version_created', 'review', p_review_id,
      jsonb_build_object('version', v_version, 'changed_paragraphs', v_changed_count, 'total_paragraphs', jsonb_array_length(p_paragraphs)));
  END IF;

  RETURN v_version;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.create_version_from_draft IS 'Creates versioned snapshot after UPDATE - only for paragraphs with content changes';
