import { useState, useMemo } from 'react'
import { supabase } from '../supabaseClient'
import { getLogBuffer, getEnvironmentInfo, clearLogBuffer } from '../utils/consoleCapture'

export default function ReportIssueModal({ onClose }) {
  const [message, setMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState(null)
  const [showLogs, setShowLogs] = useState(false)

  const logs = useMemo(() => getLogBuffer(), [])
  const logCount = logs.length

  // Format logs for display
  const formattedLogs = useMemo(() => {
    return logs.map(entry => {
      const time = new Date(entry.timestamp).toLocaleTimeString()
      const levelIcon = entry.level === 'error' ? '!' :
                        entry.level === 'warn' ? '?' :
                        entry.level === 'uncaught_error' ? '!!' :
                        entry.level === 'unhandled_rejection' ? '!!' : ' '
      return `[${time}] ${levelIcon} ${entry.message}`
    }).join('\n')
  }, [logs])

  const handleSubmit = async () => {
    if (!message.trim()) {
      setError('Please describe the issue you encountered')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const logs = getLogBuffer()
      const environment = getEnvironmentInfo()

      const { error: submitError } = await supabase.rpc('submit_debug_log', {
        p_user_message: message.trim(),
        p_console_logs: logs,
        p_environment: environment
      })

      if (submitError) throw submitError

      setSubmitted(true)
      clearLogBuffer()
    } catch (err) {
      console.error('Failed to submit debug log:', err)
      setError(`Failed to submit: ${err.message}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
          <div className="text-center">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">Report Submitted</h3>
            <p className="text-sm text-gray-600 mb-4">
              Thank you for reporting this issue. The logs have been sent and will help us investigate.
            </p>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
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
      <div className="bg-white rounded-lg p-6 max-w-lg w-full mx-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900">Report an Issue</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p className="text-sm text-gray-600 mb-4">
          Describe what happened and we'll send the recent console logs to help diagnose the issue.
        </p>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            What went wrong?
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Describe the error or unexpected behavior you experienced..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            rows={4}
          />
        </div>

        <div className="bg-gray-50 rounded-lg p-3 mb-4 text-sm">
          <button
            type="button"
            onClick={() => setShowLogs(!showLogs)}
            className="w-full flex items-center justify-between text-gray-600 hover:text-gray-800"
          >
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{logCount} log entries will be included</span>
            </div>
            <svg
              className={`w-4 h-4 transition-transform ${showLogs ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showLogs && (
            <div className="mt-3 border-t pt-3">
              <pre className="text-xs text-gray-600 bg-white border border-gray-200 rounded p-2 max-h-48 overflow-auto whitespace-pre-wrap font-mono">
                {formattedLogs || '(no logs captured)'}
              </pre>
            </div>
          )}
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Sending...' : 'Send Report'}
          </button>
        </div>
      </div>
    </div>
  )
}
