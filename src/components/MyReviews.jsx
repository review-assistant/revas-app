import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

export default function MyReviews({ onSelectReview, onCancel }) {
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedReviewId, setSelectedReviewId] = useState(null)
  const [newPaperTitle, setNewPaperTitle] = useState('')
  const [newPaperConference, setNewPaperConference] = useState('')

  useEffect(() => {
    loadReviews()
  }, [])

  const loadReviews = async () => {
    try {
      setLoading(true)
      setError(null)

      const { data, error: rpcError } = await supabase.rpc('get_my_reviews')

      if (rpcError) throw rpcError

      setReviews(data || [])

      // Pre-select the most recent review (first in list)
      if (data && data.length > 0) {
        setSelectedReviewId(data[0].review_id)
      }
    } catch (err) {
      console.error('Error loading reviews:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleContinue = () => {
    if (selectedReviewId) {
      // Continuing with existing review
      const review = reviews.find(r => r.review_id === selectedReviewId)
      onSelectReview({
        reviewId: selectedReviewId,
        paperId: review.paper_id,
        paperTitle: review.paper_title,
        paperConference: review.paper_conference,
        isNewReview: false
      })
    } else {
      // Creating new review
      const reviewCount = reviews.length
      const paperTitle = newPaperTitle.trim() || `Review-${reviewCount + 1}`
      const paperConference = newPaperConference.trim() || new Date().toISOString().split('T')[0]

      onSelectReview({
        reviewId: null,
        paperId: null,
        paperTitle,
        paperConference,
        isNewReview: true
      })
    }
  }

  const handleSelectReview = (reviewId) => {
    setSelectedReviewId(reviewId)
  }

  const handleCreateNew = () => {
    setSelectedReviewId(null)
  }

  const formatDate = (dateString) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now - date
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays === 0) {
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
      if (diffHours === 0) {
        const diffMinutes = Math.floor(diffMs / (1000 * 60))
        return diffMinutes <= 1 ? 'Just now' : `${diffMinutes} minutes ago`
      }
      return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`
    } else if (diffDays === 1) {
      return 'Yesterday'
    } else if (diffDays < 7) {
      return `${diffDays} days ago`
    } else {
      return date.toLocaleDateString()
    }
  }

  const getButtonText = () => {
    if (selectedReviewId) {
      const review = reviews.find(r => r.review_id === selectedReviewId)
      const reviewName = review?.paper_title || '(No title)'
      return `Continue Editing ${reviewName}`
    } else {
      const reviewName = newPaperTitle.trim() || getPlaceholderTitle()
      return `Create ${reviewName}`
    }
  }

  const getPlaceholderTitle = () => {
    return `Review-${reviews.length + 1}`
  }

  const getPlaceholderConference = () => {
    return new Date().toISOString().split('T')[0]
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 max-w-3xl w-full mx-4">
          <div className="text-center">
            <div className="text-xl text-gray-600">Loading reviews...</div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 max-w-3xl w-full mx-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <h2 className="text-xl font-bold text-red-800 mb-2">Error</h2>
            <p className="text-red-600 mb-4">{error}</p>
            <button
              onClick={onCancel}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-8 max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">My Reviews</h2>

        {/* Existing Reviews List */}
        {reviews.length > 0 && (
          <div className="space-y-3 mb-6">
            {reviews.map((review) => {
              const isSelected = selectedReviewId === review.review_id
              return (
                <button
                  key={review.review_id}
                  onClick={() => handleSelectReview(review.review_id)}
                  className={`w-full text-left p-2 rounded-lg border-2 transition-all ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <div className="flex items-center gap-3 text-sm">
                    <span className="font-semibold text-gray-900 flex-shrink-0">
                      {review.paper_title || '(No title)'}
                    </span>
                    <span className="text-gray-600 flex-shrink-0">
                      {review.paper_conference || '(No conference)'}
                    </span>
                    <span className="text-gray-500 flex-shrink-0">
                      {formatDate(review.last_updated)}
                    </span>
                    <span className="text-gray-500 flex-shrink-0">
                      {review.paragraph_count} items
                    </span>
                    <span className="text-gray-500 flex-shrink-0">
                      {review.word_count} words
                    </span>
                    {review.is_locked && (
                      <span className="text-yellow-600 flex-shrink-0">🔒</span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {/* Create New Review Section */}
        <div className="border-t pt-4">
          <div className="flex gap-3 items-start p-2 bg-gray-50 rounded-lg mb-4">
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">
                Paper or Review name
              </label>
              <input
                type="text"
                value={newPaperTitle}
                onChange={(e) => {
                  setNewPaperTitle(e.target.value)
                  setSelectedReviewId(null)
                }}
                onFocus={() => setSelectedReviewId(null)}
                placeholder={getPlaceholderTitle()}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">
                Conf or Journal
              </label>
              <input
                type="text"
                value={newPaperConference}
                onChange={(e) => {
                  setNewPaperConference(e.target.value)
                  setSelectedReviewId(null)
                }}
                onFocus={() => setSelectedReviewId(null)}
                placeholder={getPlaceholderConference()}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Action Button */}
        <div className="mt-6">
          <button
            onClick={handleContinue}
            className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            {getButtonText()}
          </button>
        </div>
      </div>
    </div>
  )
}
