// Supabase Edge Function: Comment Service Proxy
// This function acts as a secure proxy between the frontend and the backend comment service

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const BACKEND_URL = Deno.env.get('COMMENT_SERVICE_URL')!
const JOBS_ENDPOINT = `${BACKEND_URL}/get_comments/v1/jobs`

serve(async (req) => {
  // CORS headers for local development
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      console.error('[Auth] Missing authorization header')
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[Request] ${req.method} ${req.url}`)

    // Get request path to determine if creating job or polling
    const url = new URL(req.url)
    const pathParts = url.pathname.split('/')

    // If path ends with a UUID, it's a GET request for job status
    const jobIdMatch = pathParts[pathParts.length - 1].match(/^[0-9a-f-]{36}$/)

    let backendUrl: string
    let backendMethod: string
    let backendBody: string | null = null

    if (jobIdMatch) {
      // GET job status: /get-comments/{job_id}
      const jobId = jobIdMatch[0]
      backendUrl = `${JOBS_ENDPOINT}/${jobId}`
      backendMethod = 'GET'
      console.log(`[Proxy] Polling job status: ${jobId}`)
    } else {
      // POST create job: /get-comments
      backendUrl = JOBS_ENDPOINT
      backendMethod = 'POST'
      backendBody = await req.text()
      console.log(`[Proxy] Creating new job`)
    }

    console.log(`[Backend] ${backendMethod} ${backendUrl}`)

    // Forward request to backend
    const backendResponse = await fetch(backendUrl, {
      method: backendMethod,
      headers: {
        'accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: backendBody
    })

    console.log(`[Backend] Response status: ${backendResponse.status}`)

    // Return backend response to frontend
    const responseData = await backendResponse.text()

    return new Response(responseData, {
      status: backendResponse.status,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    })

  } catch (error) {
    console.error('[Error]', error.message, error.stack)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
