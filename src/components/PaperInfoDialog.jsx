import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

/**
 * PaperInfoDialog - Modal dialog for collecting paper information
 *
 * Prompts user for optional paper title and conference/journal information
 * on first use. This information is used to match existing papers or create
 * a new paper entry in the database.
 *
 * Smart features:
 * - Pre-populates with user's most recent unlocked review (if exists)
 * - Single button: "Skip" when blank, "Continue" when filled
 */
export default function PaperInfoDialog({ onSubmit, onCancel }) {
  const [title, setTitle] = useState('');
  const [conference, setConference] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Load user's most recent unlocked review on mount
  useEffect(() => {
    loadMostRecentReview();
  }, []);

  const loadMostRecentReview = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setIsLoading(false);
        return;
      }

      // Get most recent unlocked review with paper info
      const { data: reviews, error } = await supabase
        .from('reviews')
        .select(`
          id,
          paper_id,
          papers (
            title,
            conference_or_journal
          )
        `)
        .eq('reviewer_user_id', session.user.id)
        .eq('is_locked', false)
        .order('updated_at', { ascending: false })
        .limit(1);

      if (error) throw error;

      if (reviews && reviews.length > 0 && reviews[0].papers) {
        const paper = reviews[0].papers;
        setTitle(paper.title || '');
        setConference(paper.conference_or_journal || '');
      }
    } catch (error) {
      console.error('Error loading recent review:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      title: title.trim() || null,
      conference: conference.trim() || null
    });
  };

  // Determine button text based on form state
  const hasData = title.trim() || conference.trim();
  const buttonText = hasData ? 'Continue' : 'Skip';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
        <h2 className="text-xl font-bold mb-4">Paper Information</h2>

        <p className="text-sm text-gray-600 mb-4">
          Help us track your review by providing paper details. This is optional but helps
          organize multiple reviews.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Paper Title (optional)
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Leave blank if unknown"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Conference/Journal (optional)
            </label>
            <input
              type="text"
              value={conference}
              onChange={(e) => setConference(e.target.value)}
              placeholder="e.g., NeurIPS 2025"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-md p-3 text-sm text-gray-700">
            <p className="font-medium mb-1">How matching works:</p>
            <p>
              If a matching paper exists, your review will be added to it.
              Otherwise, a new paper entry will be created.
            </p>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white font-medium py-2 px-4 rounded-md transition-colors"
            >
              {isLoading ? 'Loading...' : buttonText}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
