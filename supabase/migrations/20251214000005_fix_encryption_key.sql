-- Fix encryption key handling for local development
-- Modifies encryption functions to use a default key when app.encryption_key is not set
--
-- IMPORTANT: The key below should match ENCRYPTION_KEY in your .env file
-- To change the encryption key for production:
-- 1. Update ENCRYPTION_KEY in .env
-- 2. Update the key in this migration file (line 18)
-- 3. Run: npx supabase db reset

-- Update encrypt_text to use default key
CREATE OR REPLACE FUNCTION public.encrypt_text(plain_text TEXT)
RETURNS TEXT AS $$
DECLARE
  v_key TEXT;
BEGIN
  -- Try to get encryption key from setting
  v_key := current_setting('app.encryption_key', true);

  -- Use default key (must match ENCRYPTION_KEY in .env)
  IF v_key IS NULL OR v_key = '' THEN
    v_key := 'local-dev-key-change-in-production-12345';
  END IF;

  RETURN encode(pgp_sym_encrypt(plain_text, v_key), 'base64');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update decrypt_text to use default key
CREATE OR REPLACE FUNCTION public.decrypt_text(encrypted_text TEXT)
RETURNS TEXT AS $$
DECLARE
  v_key TEXT;
BEGIN
  IF encrypted_text IS NULL THEN
    RETURN NULL;
  END IF;

  -- Try to get encryption key from setting
  v_key := current_setting('app.encryption_key', true);

  -- Use default key (must match ENCRYPTION_KEY in .env)
  IF v_key IS NULL OR v_key = '' THEN
    v_key := 'local-dev-key-change-in-production-12345';
  END IF;

  RETURN pgp_sym_decrypt(decode(encrypted_text, 'base64'), v_key);
EXCEPTION WHEN OTHERS THEN
  RETURN NULL; -- Return NULL if decryption fails
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
