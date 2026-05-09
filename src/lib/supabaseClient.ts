import { createClient } from '@supabase/supabase-js'

// Trim to defend against stray whitespace / CRLF copied into the .env file.
const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)?.trim()

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. ' +
      'Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in your .env file, ' +
      'then restart the Vite dev server (the .env file is only read at startup).',
  )
}

// Pin the `apikey` header on every outgoing request.
//
// Background: supabase-js attaches this itself, but a stale Vite dep-pre-bundle
// or a browser extension / Opera GX's tracker blocker can drop it on POSTs,
// which produces: `{ "message": "No API key found in request", ... }` on the
// PostgREST endpoint.
//
// IMPORTANT: we do NOT pin the `Authorization` header here. The new
// `sb_publishable_...` keys are opaque identifiers, not JWTs — supabase-js
// manages `Authorization` dynamically based on the current auth session
// (falling back to the anon/publishable key when signed out). Overriding it
// at construction time breaks authenticated requests with a plain 401.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  global: {
    headers: {
      apikey: supabaseAnonKey,
    },
  },
})
