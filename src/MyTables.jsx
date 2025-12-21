import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

export default function MyTables({ onBack }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedParagraphs, setExpandedParagraphs] = useState({}); // {paragraphKey: true}

  // Toggle version history for a paragraph
  const toggleVersionHistory = (reviewId, paragraphId) => {
    const key = `${reviewId}-${paragraphId}`;
    setExpandedParagraphs(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  // Group review items by paragraph_id and sort by version (descending)
  const groupByParagraph = (reviewItems) => {
    if (!reviewItems) return {};
    const groups = {};
    for (const item of reviewItems) {
      if (!groups[item.paragraph_id]) {
        groups[item.paragraph_id] = [];
      }
      groups[item.paragraph_id].push(item);
    }
    // Sort each group by version descending (latest first)
    for (const pid of Object.keys(groups)) {
      groups[pid].sort((a, b) => b.version - a.version);
    }
    return groups;
  };

  // Check if a dimension was dismissed in any earlier version
  const wasDismissedInEarlierVersion = (paragraphVersions, currentVersion, dimension) => {
    for (const item of paragraphVersions) {
      if (item.version < currentVersion) {
        const interaction = item.interactions?.find(i => i.dimension === dimension);
        if (interaction?.comment_dismissed) {
          return true;
        }
      }
    }
    return false;
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const { data: result, error } = await supabase.rpc('view_my_tables');

      if (error) throw error;

      setData(result);
    } catch (err) {
      console.error('Error loading tables:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatJSON = (obj) => {
    return JSON.stringify(obj, null, 2);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          {onBack && (
            <button
              onClick={onBack}
              className="mb-6 text-blue-600 hover:text-blue-800"
            >
              ← Back to App
            </button>
          )}
          <div className="text-center py-12">
            <div className="text-xl text-gray-600">Loading...</div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          {onBack && (
            <button
              onClick={onBack}
              className="mb-6 text-blue-600 hover:text-blue-800"
            >
              ← Back to App
            </button>
          )}
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <h2 className="text-xl font-bold text-red-800 mb-2">Error</h2>
            <p className="text-red-600">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900">My Tables (Decrypted)</h1>
          {onBack && (
            <button
              onClick={onBack}
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg transition-colors"
            >
              ← Back to App
            </button>
          )}
        </div>

        <button
          onClick={loadData}
          className="mb-6 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
        >
          Refresh Data
        </button>

        {data && data.papers && data.papers.length > 0 ? (
          <div className="space-y-6">
            {data.papers.map((paper, paperIdx) => (
              <div key={paper.id} className="bg-white rounded-lg shadow-md overflow-hidden">
                <div className="bg-blue-600 text-white px-6 py-4">
                  <h2 className="text-xl font-bold">
                    Paper {paperIdx + 1}: {paper.title || '(No title)'}
                  </h2>
                  <p className="text-sm opacity-90 mt-1">
                    {paper.conference_or_journal || '(No conference/journal)'}
                  </p>
                  <div className="flex gap-4 mt-2 text-sm">
                    <span>ID: {paper.id}</span>
                    <span>Embargo: {paper.embargo_active ? 'Active' : 'Lifted'}</span>
                    <span>Created: {new Date(paper.created_at).toLocaleString()}</span>
                  </div>
                </div>

                <div className="p-6">
                  {paper.reviews && paper.reviews.length > 0 ? (
                    <div className="space-y-4">
                      {paper.reviews.map((review, reviewIdx) => (
                        <div key={review.id} className="border border-gray-200 rounded-lg p-4">
                          <div className="bg-green-50 border-b border-green-200 px-4 py-3 mb-4">
                            <h3 className="font-bold text-green-800">
                              Review {reviewIdx + 1}
                            </h3>
                            <div className="text-sm text-green-700 mt-1 space-y-1">
                              <div>ID: {review.id}</div>
                              <div>Locked: {review.is_locked ? 'Yes' : 'No'}</div>
                              <div>Created: {new Date(review.created_at).toLocaleString()}</div>
                              <div>Updated: {new Date(review.updated_at).toLocaleString()}</div>
                            </div>
                          </div>

                          {review.content && (
                            <div className="mb-4">
                              <h4 className="font-semibold text-gray-700 mb-2">Scored Content:</h4>
                              <div className="bg-gray-50 border border-gray-200 rounded p-3 whitespace-pre-wrap text-sm">
                                {review.content}
                              </div>
                            </div>
                          )}

                          {review.draft_content && review.draft_content !== review.content && (
                            <div className="mb-4">
                              <h4 className="font-semibold text-gray-700 mb-2">Draft Content (unsaved edits):</h4>
                              <div className="bg-orange-50 border border-orange-200 rounded p-3 whitespace-pre-wrap text-sm">
                                {review.draft_content}
                              </div>
                            </div>
                          )}

                          {review.review_items && review.review_items.length > 0 ? (
                            <div className="space-y-3">
                              <h4 className="font-semibold text-gray-700">Review Items:</h4>
                              {(() => {
                                const grouped = groupByParagraph(review.review_items);
                                const paragraphIds = Object.keys(grouped).map(Number).sort((a, b) => a - b);

                                return paragraphIds.map((paragraphId, itemIdx) => {
                                  const versions = grouped[paragraphId];
                                  const latestItem = versions[0]; // First is latest (sorted desc)
                                  const hasHistory = versions.length > 1;
                                  const expandKey = `${review.id}-${paragraphId}`;
                                  const isExpanded = expandedParagraphs[expandKey];

                                  return (
                                    <div key={latestItem.id} className="bg-yellow-50 border border-yellow-200 rounded p-3">
                                      <div className="flex justify-between items-start mb-2">
                                        <div className="font-medium text-yellow-900 flex items-center gap-2">
                                          Paragraph {itemIdx + 1} (ID: {latestItem.paragraph_id}, v{latestItem.version})
                                          {hasHistory && (
                                            <button
                                              onClick={() => toggleVersionHistory(review.id, paragraphId)}
                                              className="text-xs px-2 py-0.5 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded transition-colors"
                                              title={isExpanded ? 'Hide version history' : `Show ${versions.length - 1} previous version(s)`}
                                            >
                                              {isExpanded ? '▼' : '▶'} {versions.length - 1} prev
                                            </button>
                                          )}
                                        </div>
                                        <div className="text-xs text-yellow-700">
                                          {latestItem.is_deleted ? '🗑️ Deleted' : '✓ Active'}
                                        </div>
                                      </div>

                                      <div className="text-sm text-gray-700 mb-3 bg-white border border-yellow-100 rounded p-2">
                                        {latestItem.content}
                                      </div>

                                      {latestItem.scores && latestItem.scores.length > 0 && (
                                        <div className="mt-2 space-y-2">
                                          <div className="text-xs font-semibold text-yellow-800">Scores:</div>
                                          {latestItem.scores.map((score, scoreIdx) => {
                                            // Find matching interaction for this dimension
                                            const interaction = latestItem.interactions?.find(i => i.dimension === score.dimension);
                                            // Check if this dimension was dismissed in an earlier version
                                            const hiddenByPriorDismiss = !interaction && wasDismissedInEarlierVersion(versions, latestItem.version, score.dimension);
                                            return (
                                              <div key={scoreIdx} className="bg-white border border-yellow-100 rounded p-2 text-sm">
                                                <div className="flex justify-between items-center mb-1">
                                                  <span className="font-medium text-yellow-900">
                                                    {score.dimension}
                                                  </span>
                                                  <div className="flex items-center gap-2">
                                                    {hiddenByPriorDismiss && (
                                                      <span className="px-1.5 py-0.5 rounded text-xs bg-orange-100 text-orange-700 relative" title="Hidden due to dismissal in earlier version">
                                                        <span>👁</span>
                                                        <span className="absolute inset-0 flex items-center justify-center text-orange-700 font-bold text-sm">✕</span>
                                                      </span>
                                                    )}
                                                    {interaction && (
                                                      <span className="flex gap-1">
                                                        {interaction.comment_viewed && (
                                                          <span className="px-1.5 py-0.5 rounded text-xs bg-blue-100 text-blue-700" title={`Viewed: ${new Date(interaction.comment_viewed_at).toLocaleString()}`}>
                                                            👁
                                                          </span>
                                                        )}
                                                        {interaction.comment_dismissed && (
                                                          <span className="px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-600" title={`Dismissed: ${new Date(interaction.comment_dismissed_at).toLocaleString()}`}>
                                                            ✕
                                                          </span>
                                                        )}
                                                      </span>
                                                    )}
                                                    <span className={`px-2 py-1 rounded text-xs font-bold ${
                                                      score.score <= 2 ? 'bg-red-100 text-red-800' :
                                                      score.score <= 4 ? 'bg-yellow-100 text-yellow-800' :
                                                      'bg-green-100 text-green-800'
                                                    }`}>
                                                      {score.score}/5
                                                    </span>
                                                  </div>
                                                </div>
                                                {score.comment && (
                                                  <div className="text-gray-600 text-xs mt-1">
                                                    {score.comment}
                                                  </div>
                                                )}
                                              </div>
                                            );
                                          })}
                                        </div>
                                      )}

                                      {/* Version history (collapsed by default) */}
                                      {isExpanded && versions.slice(1).map((oldItem) => (
                                        <div key={oldItem.id} className="mt-3 ml-4 border-l-2 border-purple-300 pl-3 opacity-75">
                                          <div className="text-xs text-purple-700 font-medium mb-1">
                                            v{oldItem.version} - {new Date(oldItem.created_at).toLocaleString()}
                                          </div>
                                          <div className="text-sm text-gray-600 mb-2 bg-purple-50 border border-purple-100 rounded p-2">
                                            {oldItem.content}
                                          </div>
                                          {oldItem.scores && oldItem.scores.length > 0 && (
                                            <div className="space-y-1">
                                              {oldItem.scores.map((score, scoreIdx) => {
                                                const interaction = oldItem.interactions?.find(i => i.dimension === score.dimension);
                                                // Check if this dimension was dismissed in an even earlier version
                                                const hiddenByPriorDismiss = !interaction && wasDismissedInEarlierVersion(versions, oldItem.version, score.dimension);
                                                return (
                                                  <div key={scoreIdx} className="flex items-center gap-2 text-xs">
                                                    <span className="text-purple-800">{score.dimension}:</span>
                                                    <span className={`px-1.5 py-0.5 rounded font-bold ${
                                                      score.score <= 2 ? 'bg-red-100 text-red-800' :
                                                      score.score <= 4 ? 'bg-yellow-100 text-yellow-800' :
                                                      'bg-green-100 text-green-800'
                                                    }`}>
                                                      {score.score}/5
                                                    </span>
                                                    {hiddenByPriorDismiss && (
                                                      <span className="relative text-orange-600" title="Hidden due to dismissal in earlier version">
                                                        <span>👁</span>
                                                        <span className="absolute inset-0 flex items-center justify-center font-bold">✕</span>
                                                      </span>
                                                    )}
                                                    {interaction?.comment_viewed && (
                                                      <span className="text-blue-600" title="Viewed">👁</span>
                                                    )}
                                                    {interaction?.comment_dismissed && (
                                                      <span className="text-gray-500" title="Dismissed">✕</span>
                                                    )}
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  );
                                });
                              })()}
                            </div>
                          ) : (
                            <div className="text-gray-500 text-sm italic">No review items</div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-gray-500 italic">No reviews for this paper</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-md p-12 text-center">
            <div className="text-gray-500 text-lg">No papers found</div>
            <div className="text-gray-400 text-sm mt-2">
              Create a review to see data here
            </div>
          </div>
        )}

        <div className="mt-8 bg-gray-100 rounded-lg p-6">
          <h3 className="font-bold text-gray-800 mb-3">Raw JSON Data:</h3>
          <pre className="bg-white border border-gray-300 rounded p-4 overflow-x-auto text-xs">
            {formatJSON(data)}
          </pre>
        </div>
      </div>
    </div>
  );
}
