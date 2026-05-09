// Feature: show-up-2-move
// Central Supabase error handler
// Requirements: 2.3, 2.4, 16.7
//
// Supabase-js returns structured errors from PostgREST, Auth, and Storage.
// Rather than scattering status-code branching across every hook, this module
// classifies errors by HTTP status and returns a uniform shape the UI can use.
//
// Typical usage:
//
//   const { data, error } = await supabase.from('events').select('*')
//   if (error) {
//     const handled = handleSupabaseError(error)
//     if (handled.redirectToLogin) {
//       navigate(`/login?message=${encodeURIComponent(handled.userMessage)}`)
//       return
//     }
//     setError(handled.userMessage)
//     return
//   }

/**
 * Error kinds recognised by the handler. Callers can switch on this field
 * when they need specific behaviour per kind (e.g. showing a forbidden
 * icon, auto-retrying 5xx, redirecting on 401).
 */
export type SupabaseErrorKind =
  | 'unauthorized' // 401
  | 'forbidden' // 403
  | 'not_found' // 404
  | 'conflict' // 409
  | 'validation' // 400 / 422
  | 'server' // 5xx
  | 'network' // no status — fetch failure
  | 'unknown'

export interface HandledSupabaseError {
  kind: SupabaseErrorKind
  /** HTTP status code when the SDK exposed one; undefined for network errors. */
  status?: number
  /** Human-readable message suitable for showing directly in the UI. */
  userMessage: string
  /** True when the caller should redirect the user to /login. */
  redirectToLogin: boolean
  /** True when offering a "Retry" button is appropriate. */
  retryable: boolean
  /** The original error, for logging / diagnostics. */
  originalError: unknown
}

/**
 * Supabase errors have slightly different shapes depending on the service:
 *  - PostgREST: { message, details, hint, code }           (no status on object)
 *  - Auth:      { message, status }                        (has numeric status)
 *  - Storage:   { message, statusCode }                    (statusCode instead of status)
 *  - fetch/network: a plain `Error` with no structured fields.
 *
 * This helper tries each known shape and returns a number, or `undefined` if
 * the status is not attached to the error.
 */
function extractStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined

  const anyErr = error as Record<string, unknown>

  // Auth-style: .status
  if (typeof anyErr.status === 'number') return anyErr.status
  if (typeof anyErr.status === 'string' && /^\d+$/.test(anyErr.status)) {
    return Number(anyErr.status)
  }

  // Storage-style: .statusCode
  if (typeof anyErr.statusCode === 'number') return anyErr.statusCode
  if (
    typeof anyErr.statusCode === 'string' &&
    /^\d+$/.test(anyErr.statusCode)
  ) {
    return Number(anyErr.statusCode)
  }

  // PostgREST: sometimes the HTTP status is attached to a `httpStatus` or on the
  // response object from `supabase.from(...).select()`. We cannot get it reliably
  // without the PostgrestResponse wrapper, so callers should pass the status
  // explicitly via `handleSupabaseError(error, { status })` when they have it.
  return undefined
}

/**
 * Extract a meaningful message from an unknown error value, with fallbacks
 * so we never show a literal "[object Object]" or an empty string.
 */
function extractMessage(error: unknown): string {
  if (!error) return 'Unknown error'
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && 'message' in error) {
    const msg = (error as { message?: unknown }).message
    if (typeof msg === 'string' && msg.length > 0) return msg
  }
  return 'Unknown error'
}

export interface HandleOptions {
  /**
   * Override the status code when the SDK did not attach one to the error
   * (common for PostgREST responses where the status lives on the
   * `{ data, error, status }` tuple).
   */
  status?: number
}

/**
 * Classify a Supabase error and return a uniform, UI-friendly result.
 *
 * Mapping (Requirements 2.3, 2.4, 16.7):
 *  - 401 → redirect to /login with a descriptive message
 *  - 403 → "You don't have permission to do that."
 *  - 5xx → "Something went wrong on our side. Please try again." (retryable)
 *  - network → same as 5xx (retryable)
 *  - everything else → short, non-alarming message
 */
export function handleSupabaseError(
  error: unknown,
  options: HandleOptions = {},
): HandledSupabaseError {
  const status = options.status ?? extractStatus(error)
  const rawMessage = extractMessage(error)

  // 401 — session invalid or missing
  if (status === 401) {
    return {
      kind: 'unauthorized',
      status,
      userMessage: 'Your session has expired. Please log in again to continue.',
      redirectToLogin: true,
      retryable: false,
      originalError: error,
    }
  }

  // 403 — authenticated but forbidden
  if (status === 403) {
    return {
      kind: 'forbidden',
      status,
      userMessage: "You don't have permission to do that.",
      redirectToLogin: false,
      retryable: false,
      originalError: error,
    }
  }

  // 404 — missing resource
  if (status === 404) {
    return {
      kind: 'not_found',
      status,
      userMessage: "We couldn't find what you were looking for.",
      redirectToLogin: false,
      retryable: false,
      originalError: error,
    }
  }

  // 409 — conflict (e.g. duplicate insert)
  if (status === 409) {
    return {
      kind: 'conflict',
      status,
      userMessage: 'That action conflicts with existing data.',
      redirectToLogin: false,
      retryable: false,
      originalError: error,
    }
  }

  // 400 / 422 — validation failures: surface the server message, which is
  // usually actionable (e.g. "email already in use").
  if (status === 400 || status === 422) {
    return {
      kind: 'validation',
      status,
      userMessage: rawMessage || 'Please check the information you entered.',
      redirectToLogin: false,
      retryable: false,
      originalError: error,
    }
  }

  // 5xx — server error, retryable
  if (typeof status === 'number' && status >= 500 && status < 600) {
    return {
      kind: 'server',
      status,
      userMessage:
        'Something went wrong on our side. Please try again in a moment.',
      redirectToLogin: false,
      retryable: true,
      originalError: error,
    }
  }

  // No status — treat as a network / fetch failure. Supabase auth messages
  // often include the string "Failed to fetch" when offline.
  if (status === undefined && /fetch|network/i.test(rawMessage)) {
    return {
      kind: 'network',
      userMessage:
        "We couldn't reach the server. Check your connection and try again.",
      redirectToLogin: false,
      retryable: true,
      originalError: error,
    }
  }

  return {
    kind: 'unknown',
    status,
    userMessage: rawMessage || 'Something went wrong. Please try again.',
    redirectToLogin: false,
    retryable: true,
    originalError: error,
  }
}

/**
 * Convenience helper: runs `handleSupabaseError` and, if the error is a 401,
 * performs a hard redirect to /login with the descriptive message appended
 * as a query string. Intended for use outside React component trees (e.g.
 * inside utility modules or non-hook data helpers where `useNavigate` is
 * not available).
 */
export function handleSupabaseErrorWithRedirect(
  error: unknown,
  options: HandleOptions = {},
): HandledSupabaseError {
  const handled = handleSupabaseError(error, options)
  if (
    handled.redirectToLogin &&
    typeof window !== 'undefined' &&
    window.location.pathname !== '/login'
  ) {
    const msg = encodeURIComponent(handled.userMessage)
    window.location.assign(`/login?message=${msg}`)
  }
  return handled
}
