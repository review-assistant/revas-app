-- Debug logs table for capturing user-reported issues
-- Stores console logs and user messages for debugging

CREATE TABLE IF NOT EXISTS debug_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    user_email TEXT,
    user_message TEXT NOT NULL,
    console_logs JSONB NOT NULL DEFAULT '[]',
    environment JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying by user
CREATE INDEX idx_debug_logs_user_id ON debug_logs(user_id);
CREATE INDEX idx_debug_logs_created_at ON debug_logs(created_at DESC);

-- RLS policies
ALTER TABLE debug_logs ENABLE ROW LEVEL SECURITY;

-- Users can insert their own debug logs
CREATE POLICY "Users can insert their own debug logs"
    ON debug_logs FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- Users can view their own debug logs
CREATE POLICY "Users can view their own debug logs"
    ON debug_logs FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- Function to submit debug logs
CREATE OR REPLACE FUNCTION submit_debug_log(
    p_user_message TEXT,
    p_console_logs JSONB,
    p_environment JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_log_id UUID;
    v_user_email TEXT;
BEGIN
    -- Get user email
    SELECT email INTO v_user_email
    FROM auth.users
    WHERE id = auth.uid();

    INSERT INTO debug_logs (user_id, user_email, user_message, console_logs, environment)
    VALUES (auth.uid(), v_user_email, p_user_message, p_console_logs, p_environment)
    RETURNING id INTO v_log_id;

    RETURN v_log_id;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION submit_debug_log TO authenticated;

COMMENT ON TABLE debug_logs IS 'Stores user-submitted debug logs for troubleshooting issues';
COMMENT ON COLUMN debug_logs.user_message IS 'User description of the issue they encountered';
COMMENT ON COLUMN debug_logs.console_logs IS 'Captured console.log/warn/error entries';
COMMENT ON COLUMN debug_logs.environment IS 'Browser and environment information';
