import React, { useState } from 'react';

/**
 * PaperInfoDialog - Modal dialog for collecting paper information
 *
 * Prompts user for optional paper title and conference/journal information
 * on first use. This information is used to match existing papers or create
 * a new paper entry in the database.
 */
export default function PaperInfoDialog({ onSubmit, onCancel }) {
  const [title, setTitle] = useState('');
  const [conference, setConference] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      title: title.trim() || null,
      conference: conference.trim() || null
    });
  };

  const handleSkip = () => {
    onSubmit({ title: null, conference: null });
  };

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

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              className="flex-1 bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded-md transition-colors"
            >
              Continue
            </button>
            <button
              type="button"
              onClick={handleSkip}
              className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium py-2 px-4 rounded-md transition-colors"
            >
              Skip
            </button>
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
