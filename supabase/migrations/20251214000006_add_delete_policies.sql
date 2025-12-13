-- Add DELETE policies for review_items and related tables
-- Without these, CASCADE deletes are blocked by RLS

-- Review items DELETE policy
CREATE POLICY "Users can delete own review items"
  ON public.review_items FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.reviews
      WHERE reviews.id = review_items.review_id
      AND reviews.reviewer_user_id = auth.uid()
      AND reviews.is_locked = false
    )
  );

-- Review item scores DELETE policy (needed for cascades)
CREATE POLICY "Users can delete review item scores"
  ON public.review_item_scores FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.review_items
      JOIN public.reviews ON reviews.id = review_items.review_id
      WHERE review_items.id = review_item_scores.review_item_id
      AND reviews.reviewer_user_id = auth.uid()
      AND reviews.is_locked = false
    )
  );

-- Review item interactions DELETE policy (needed for cascades)
CREATE POLICY "Users can delete interactions"
  ON public.review_item_interactions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.review_items
      JOIN public.reviews ON reviews.id = review_items.review_id
      WHERE review_items.id = review_item_interactions.review_item_id
      AND reviews.reviewer_user_id = auth.uid()
    )
  );

-- Reviews DELETE policy (allow users to delete their own reviews if not locked)
CREATE POLICY "Users can delete own unlocked reviews"
  ON public.reviews FOR DELETE
  USING (auth.uid() = reviewer_user_id AND is_locked = false);
