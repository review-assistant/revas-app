-- Review Tracking System - Additional Triggers Migration
-- This migration creates triggers for embargo management and audit trails

-- ============================================================================
-- PART 1: Auto-lock Reviews When Embargo is Lifted
-- ============================================================================

-- Function to lock reviews when embargo is lifted
CREATE OR REPLACE FUNCTION public.lock_reviews_on_embargo_lift()
RETURNS TRIGGER AS $$
BEGIN
  -- If embargo was just lifted (changed from true to false)
  IF OLD.embargo_active = true AND NEW.embargo_active = false THEN
    -- Lock all reviews for this paper
    UPDATE public.reviews
    SET is_locked = true
    WHERE paper_id = NEW.id;

    -- Log the embargo lift
    PERFORM log_audit_event(
      'embargo_lifted',
      'paper',
      NEW.id,
      jsonb_build_object(
        'lifted_by', NEW.embargo_lifted_by,
        'lifted_at', NEW.embargo_lifted_at
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-lock reviews when embargo is lifted
CREATE TRIGGER lock_reviews_on_embargo_change
  AFTER UPDATE OF embargo_active ON public.papers
  FOR EACH ROW
  EXECUTE FUNCTION public.lock_reviews_on_embargo_lift();

-- ============================================================================
-- PART 2: Audit Trail Triggers for Sensitive Operations
-- ============================================================================

-- Function to audit paper creation
CREATE OR REPLACE FUNCTION public.audit_paper_creation()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM log_audit_event(
    'paper_created_trigger',
    'paper',
    NEW.id,
    jsonb_build_object(
      'title', NEW.title,
      'conference', NEW.conference_or_journal
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to audit paper creation
CREATE TRIGGER audit_paper_created
  AFTER INSERT ON public.papers
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_paper_creation();

-- Function to audit review creation
CREATE OR REPLACE FUNCTION public.audit_review_creation()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM log_audit_event(
    'review_created_trigger',
    'review',
    NEW.id,
    jsonb_build_object(
      'paper_id', NEW.paper_id
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to audit review creation
CREATE TRIGGER audit_review_created
  AFTER INSERT ON public.reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_review_creation();

-- Function to audit consent changes
CREATE OR REPLACE FUNCTION public.audit_consent_change()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM log_audit_event(
    'consent_changed',
    'consent',
    NEW.id,
    jsonb_build_object(
      'consent_type', NEW.consent_type,
      'consent_given', NEW.consent_given,
      'withdrawn', NEW.consent_withdrawn_at IS NOT NULL
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to audit consent changes
CREATE TRIGGER audit_consent_updated
  AFTER INSERT OR UPDATE ON public.user_consents
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_consent_change();
