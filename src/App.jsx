import { useState, useRef, useEffect, useCallback } from 'react'
import { useAuth } from './AuthContext'
import AuthComponent from './AuthComponent'
import ReviewComponent from './ReviewComponent'
import AccountSettings from './AccountSettings'
import MyTables from './MyTables'

function AccountDropdown({ onSettings, onTables }) {
  const [isOpen, setIsOpen] = useState(false)
  const { user, signOut } = useAuth()
  const dropdownRef = useRef(null)

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
              onClick={() => {
                onTables()
                setIsOpen(false)
              }}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              My Tables
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

function App() {
  const { user, loading } = useAuth()
  const [currentView, setCurrentView] = useState('main') // 'main' | 'settings' | 'tables'
  const reviewComponentRef = useRef(null)

  // Save draft before navigating away from main view
  const handleNavigate = useCallback(async (view) => {
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
    return <MyTables onBack={() => handleNavigate('main')} />
  }

  return (
    <div className="relative">
      <AccountDropdown
        onSettings={() => handleNavigate('settings')}
        onTables={() => handleNavigate('tables')}
      />
      <ReviewComponent ref={reviewComponentRef} />
    </div>
  )
}

export default App
