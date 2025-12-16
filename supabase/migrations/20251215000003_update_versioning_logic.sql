-- Update versioning logic: only increment version on UPDATE button, not on autosave
-- This makes versions meaningful (each version = feedback iteration)

CREATE OR REPLACE FUNCTION public.save_review_content(
  p_review_id UUID,
  p_paragraphs JSONB, -- [{paragraph_id, content, is_deleted}, ...]
  p_increment_version BOOLEAN DEFAULT false -- true when UPDATE button completes
)
RETURNS void AS $$
DECLARE
  v_paragraph JSONB;
  v_current_version INTEGER;
  v_next_version INTEGER;
  v_encrypted_content TEXT;
  v_existing_item_id UUID;
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
    -- Get current version number
    SELECT COALESCE(MAX(version), 0) INTO v_current_version
    FROM public.review_items
    WHERE review_id = p_review_id
    AND paragraph_id = (v_paragraph->>'paragraph_id')::INTEGER;

    -- Encrypt paragraph content
    v_encrypted_content := encrypt_text(v_paragraph->>'content');

    IF p_increment_version THEN
      -- CREATE new version (after UPDATE button completes)
      v_next_version := v_current_version + 1;

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
    ELSE
      -- AUTOSAVE logic
      IF v_current_version = 0 THEN
        -- First save: create version 1
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
          1,
          v_encrypted_content,
          COALESCE((v_paragraph->>'is_deleted')::BOOLEAN, false),
          CASE WHEN COALESCE((v_paragraph->>'is_deleted')::BOOLEAN, false) THEN NOW() ELSE NULL END
        );
      ELSE
        -- Check if current version has scores
        IF EXISTS (
          SELECT 1 FROM public.review_item_scores s
          JOIN public.review_items ri ON s.review_item_id = ri.id
          WHERE ri.review_id = p_review_id
          AND ri.paragraph_id = (v_paragraph->>'paragraph_id')::INTEGER
          AND ri.version = v_current_version
        ) THEN
          -- Current version has scores - create NEW version to preserve scores
          v_next_version := v_current_version + 1;
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
        ELSE
          -- No scores - safe to UPDATE current version
          UPDATE public.review_items
          SET content_encrypted = v_encrypted_content,
              is_deleted = COALESCE((v_paragraph->>'is_deleted')::BOOLEAN, false),
              deleted_at = CASE WHEN COALESCE((v_paragraph->>'is_deleted')::BOOLEAN, false) THEN NOW() ELSE NULL END,
              updated_at = NOW()
          WHERE review_id = p_review_id
          AND paragraph_id = (v_paragraph->>'paragraph_id')::INTEGER
          AND version = v_current_version;
        END IF;
      END IF;
    END IF;
  END LOOP;

  PERFORM log_audit_event(
    CASE WHEN p_increment_version THEN 'review_version_incremented' ELSE 'review_saved' END,
    'review',
    p_review_id,
    jsonb_build_object('paragraph_count', jsonb_array_length(p_paragraphs))
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
