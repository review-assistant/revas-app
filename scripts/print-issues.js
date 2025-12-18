#!/usr/bin/env node
/**
 * Print debug issues from the database
 *
 * Usage:
 *   node scripts/print-issues.js [options]
 *
 * Options:
 *   --after <date>     Only show issues after this date (ISO format or YYYY-MM-DD)
 *   --user <email>     Only show issues from this user email
 *   --limit <n>        Limit number of results (default: 50)
 *   --full             Show full log content (default: truncated)
 *   --json             Output as JSON
 *
 * Examples:
 *   node scripts/print-issues.js
 *   node scripts/print-issues.js --after 2025-12-18
 *   node scripts/print-issues.js --user alice@example.com
 *   node scripts/print-issues.js --after 2025-12-01 --user bob@example.com --limit 10
 *
 * Environment:
 *   Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

// Check for help flag early (before env validation)
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Print debug issues from the database

Usage:
  npm run issues [-- options]
  node scripts/print-issues.js [options]

Options:
  --after <date>     Only show issues after this date (ISO format or YYYY-MM-DD)
  --user <email>     Only show issues from this user email
  --limit <n>        Limit number of results (default: 50)
  --full             Show full log content (default: truncated)
  --json             Output as JSON

Examples:
  npm run issues
  npm run issues -- --after 2025-12-18
  npm run issues -- --user alice@example.com
  npm run issues -- --after 2025-12-01 --limit 10 --full

Environment:
  Requires SUPABASE_SERVICE_ROLE_KEY in .env (from Supabase dashboard → Settings → API)
`)
  process.exit(0)
}

// Load environment variables
config()

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Error: Missing environment variables')
  console.error('Required: SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY')
  console.error('')
  console.error('Add SUPABASE_SERVICE_ROLE_KEY to your .env file (find it in Supabase dashboard → Settings → API)')
  process.exit(1)
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2)
  const options = {
    after: null,
    user: null,
    limit: 50,
    full: false,
    json: false
  }

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--after':
        options.after = args[++i]
        break
      case '--user':
        options.user = args[++i]
        break
      case '--limit':
        options.limit = parseInt(args[++i], 10)
        break
      case '--full':
        options.full = true
        break
      case '--json':
        options.json = true
        break
    }
  }

  return options
}

// Format a single issue for display
function formatIssue(issue, showFullLogs) {
  const date = new Date(issue.created_at).toLocaleString()
  const logCount = issue.console_logs?.length || 0

  let output = `
${'='.repeat(80)}
ID:      ${issue.id}
Date:    ${date}
User:    ${issue.user_email || '(unknown)'}
Message: ${issue.user_message}
Logs:    ${logCount} entries
`

  if (issue.environment) {
    const env = issue.environment
    output += `Browser: ${env.userAgent?.split(' ').slice(-2).join(' ') || 'unknown'}
URL:     ${env.url || 'unknown'}
`
  }

  if (showFullLogs && issue.console_logs?.length > 0) {
    output += `\n--- Console Logs ---\n`
    for (const entry of issue.console_logs) {
      const time = new Date(entry.timestamp).toLocaleTimeString()
      const level = entry.level.toUpperCase().padEnd(5)
      const message = entry.message.length > 500 && !showFullLogs
        ? entry.message.substring(0, 500) + '...'
        : entry.message
      output += `[${time}] ${level} ${message}\n`
    }
  } else if (issue.console_logs?.length > 0) {
    // Show just errors/warnings in truncated mode
    const errors = issue.console_logs.filter(e =>
      ['error', 'warn', 'uncaught_error', 'unhandled_rejection'].includes(e.level)
    )
    if (errors.length > 0) {
      output += `\n--- Errors/Warnings (${errors.length} of ${logCount}) ---\n`
      for (const entry of errors.slice(0, 10)) {
        const time = new Date(entry.timestamp).toLocaleTimeString()
        const level = entry.level.toUpperCase().padEnd(5)
        const message = entry.message.length > 200
          ? entry.message.substring(0, 200) + '...'
          : entry.message
        output += `[${time}] ${level} ${message}\n`
      }
      if (errors.length > 10) {
        output += `  ... and ${errors.length - 10} more errors/warnings\n`
      }
    }
  }

  return output
}

async function main() {
  const options = parseArgs()

  // Create Supabase client with service role key (bypasses RLS)
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  // Build query
  let query = supabase
    .from('debug_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(options.limit)

  if (options.after) {
    const afterDate = new Date(options.after).toISOString()
    query = query.gte('created_at', afterDate)
  }

  if (options.user) {
    query = query.ilike('user_email', `%${options.user}%`)
  }

  const { data: issues, error } = await query

  if (error) {
    console.error('Error fetching issues:', error.message)
    process.exit(1)
  }

  if (!issues || issues.length === 0) {
    console.log('No issues found matching the criteria.')
    return
  }

  if (options.json) {
    console.log(JSON.stringify(issues, null, 2))
    return
  }

  console.log(`\nFound ${issues.length} issue(s)\n`)

  for (const issue of issues) {
    console.log(formatIssue(issue, options.full))
  }
}

main().catch(err => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
