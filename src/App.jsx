import { useState, useRef, useEffect, useCallback } from 'react'
import { useAuth } from './AuthContext'
import { supabase } from './supabaseClient'
import AuthComponent from './AuthComponent'
import ReviewComponent from './ReviewComponent'
import AccountSettings from './AccountSettings'
import MyTables from './MyTables'
import MyReviews from './components/MyReviews'
import ReportIssueModal from './components/ReportIssueModal'

function AccountDropdown({ onSettings, onMyReviews, onReportIssue }) {
  const [isOpen, setIsOpen] = useState(false)
  const { user, signOut } = useAuth()
  const dropdownRef = useRef(null)

  const handleOpenMyTables = () => {
    window.open('/?view=tables', '_blank')
    setIsOpen(false)
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  return (
    <div className="absolute top-[15px] right-[15px] z-50" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 transition-colors text-sm"
      >
        <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs font-medium">
          {user.email[0].toUpperCase()}
        </div>
        <span className="text-gray-700">{user.email}</span>
        <svg
          className={`w-4 h-4 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 bg-white border border-gray-200 rounded-md shadow-lg">
          <div className="py-1">
            <button
              onClick={() => {
                onMyReviews()
                setIsOpen(false)
              }}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              My Reviews
            </button>
            <button
              onClick={() => {
                onSettings()
                setIsOpen(false)
              }}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Account Settings
            </button>
            <button
              onClick={handleOpenMyTables}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              (dev) My Tables
            </button>
            <button
              onClick={() => {
                onReportIssue()
                setIsOpen(false)
              }}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              Report Issue
            </button>
            <div className="border-t my-1"></div>
            <button
              onClick={() => {
                signOut()
                setIsOpen(false)
              }}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Logout
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// Get initial view from URL params (synchronous to avoid race with other effects)
function getInitialViewFromUrl() {
  const urlParams = new URLSearchParams(window.location.search)
  const viewParam = urlParams.get('view')
  return viewParam === 'tables' ? 'tables' : 'main'
}

// Modal component for warning about navigating during UPDATE
function UpdateWarningModal({ onKeepWaiting, onAbandon }) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
      <div className="bg-white rounded-lg p-6 max-w-md mx-4 shadow-xl">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Update In Progress</h2>
        <p className="text-gray-600 mb-6">
          Your review is currently being updated. If you leave now, any pending changes will be lost.
        </p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onAbandon}
            className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
          >
            Abandon Update
          </button>
          <button
            onClick={onKeepWaiting}
            className="px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
          >
            Keep Waiting
          </button>
        </div>
      </div>
    </div>
  )
}

function App() {
  const { user, loading } = useAuth()
  const initialView = getInitialViewFromUrl()
  const [currentView, setCurrentView] = useState(initialView) // 'main' | 'settings' | 'tables'
  const [isStandaloneTable, setIsStandaloneTable] = useState(initialView === 'tables')
  const [showMyReviews, setShowMyReviews] = useState(false)
  const [showReportIssue, setShowReportIssue] = useState(false)
  const [showUpdateWarning, setShowUpdateWarning] = useState(false)
  const [pendingNavigation, setPendingNavigation] = useState(null) // { type: 'view' | 'myReviews', view?: string }
  const [currentReview, setCurrentReview] = useState(null) // { reviewId, paperId, paperTitle, paperConference }
  const reviewComponentRef = useRef(null)
  const skipAutoShowModalRef = useRef(false) // Skip auto-showing modal after explicit review selection

  // Show My Reviews modal when user signs in without a review on main view
  useEffect(() => {
    // Skip if we just navigated with an explicit review selection
    if (skipAutoShowModalRef.current) {
      skipAutoShowModalRef.current = false
      return
    }
    if (user && !currentReview && currentView === 'main') {
      setShowMyReviews(true)
    }
  }, [user, currentReview, currentView])

  const handleSelectReview = (reviewInfo) => {
    setCurrentReview(reviewInfo)
    setShowMyReviews(false)
  }

  const handleDiscardReview = async () => {
    if (!currentReview) return

    // Confirm before deleting
    const confirmMessage = currentReview.reviewId
      ? `Delete "${currentReview.paperTitle}"? This will permanently remove the review and all its data.`
      : `Discard unsaved review "${currentReview.paperTitle}"?`

    if (!window.confirm(confirmMessage)) {
      return
    }

    // Delete the review from database (if it was saved)
    if (currentReview.reviewId) {
      console.log('Deleting review:', currentReview.reviewId)

      const { error } = await supabase
        .from('reviews')
        .delete()
        .eq('id', currentReview.reviewId)

      if (error) {
        console.error('Error deleting review:', error)
        alert('Failed to delete review. Please try again.')
        return
      } else {
        console.log('Review deleted successfully')
      }
    }

    // Clear current review and show My Reviews modal
    setCurrentReview(null)
    setShowMyReviews(true)
  }

  const handleShowMyReviews = async () => {
    // Check if update is in progress
    if (reviewComponentRef.current?.isUpdating?.()) {
      setPendingNavigation({ type: 'myReviews' })
      setShowUpdateWarning(true)
      return
    }

    // Save draft before showing My Reviews
    if (currentReview && reviewComponentRef.current) {
      console.log('Saving draft before showing My Reviews...')
      try {
        await reviewComponentRef.current.saveReviewDraft()
        console.log('Draft saved, showing My Reviews')
      } catch (error) {
        console.error('Error saving draft:', error)
        // Continue anyway - don't block user
      }
    }
    setShowMyReviews(true)
  }

  // Save draft before navigating away from main view
  const handleNavigate = useCallback(async (view) => {
    // Check if update is in progress
    if (currentView === 'main' && reviewComponentRef.current?.isUpdating?.()) {
      setPendingNavigation({ type: 'view', view })
      setShowUpdateWarning(true)
      return
    }

    if (currentView === 'main' && reviewComponentRef.current) {
      console.log('Saving draft before navigation...')
      try {
        await reviewComponentRef.current.saveReviewDraft()
        console.log('Draft saved, navigating to:', view)
      } catch (error) {
        console.error('Error saving draft:', error)
        // Navigate anyway - don't block user
      }
    }
    setCurrentView(view)
  }, [currentView])

  // Handle abandoning update and proceeding with pending navigation
  const handleAbandonUpdate = useCallback(() => {
    // Cancel the update
    reviewComponentRef.current?.cancelUpdate?.()
    setShowUpdateWarning(false)

    // Execute the pending navigation
    if (pendingNavigation) {
      if (pendingNavigation.type === 'myReviews') {
        setShowMyReviews(true)
      } else if (pendingNavigation.type === 'view') {
        setCurrentView(pendingNavigation.view)
      }
      setPendingNavigation(null)
    }
  }, [pendingNavigation])

  const handleKeepWaiting = useCallback(() => {
    setShowUpdateWarning(false)
    setPendingNavigation(null)
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-xl text-gray-600">Loading...</div>
      </div>
    )
  }

  if (!user) {
    return <AuthComponent />
  }

  if (currentView === 'settings') {
    return <AccountSettings onBack={() => handleNavigate('main')} />
  }

  if (currentView === 'tables') {
    return (
      <div className="relative">
        <AccountDropdown
          onSettings={() => handleNavigate('settings')}
          onMyReviews={() => {
            // For standalone tables, just go to main page - modal will auto-show
            if (isStandaloneTable) {
              window.location.href = '/'
            } else {
              handleShowMyReviews()
            }
          }}
          onReportIssue={() => setShowReportIssue(true)}
        />
        <MyTables onBack={isStandaloneTable ? null : () => handleNavigate('main')} />
        {showReportIssue && (
          <ReportIssueModal onClose={() => setShowReportIssue(false)} />
        )}
        {!isStandaloneTable && showMyReviews && (
          <MyReviews
            onSelectReview={(reviewInfo) => {
              setCurrentReview(reviewInfo)
              setShowMyReviews(false)
              skipAutoShowModalRef.current = true
              handleNavigate('main')
            }}
            onCancel={() => setShowMyReviews(false)}
            showCloseButton={currentReview !== null}
          />
        )}
      </div>
    )
  }

  return (
    <div className="relative">
      <AccountDropdown
        onSettings={() => handleNavigate('settings')}
        onMyReviews={handleShowMyReviews}
        onReportIssue={() => setShowReportIssue(true)}
      />
      {currentReview && (
        <ReviewComponent
          ref={reviewComponentRef}
          currentReview={currentReview}
          onDiscardReview={handleDiscardReview}
        />
      )}
      {showMyReviews && (
        <MyReviews
          onSelectReview={handleSelectReview}
          onCancel={() => setShowMyReviews(false)}
          showCloseButton={currentReview !== null}
        />
      )}
      {showReportIssue && (
        <ReportIssueModal onClose={() => setShowReportIssue(false)} />
      )}
      {showUpdateWarning && (
        <UpdateWarningModal
          onKeepWaiting={handleKeepWaiting}
          onAbandon={handleAbandonUpdate}
        />
      )}
    </div>
  )
}

export default App
