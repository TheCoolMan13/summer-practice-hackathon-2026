// Feature: show-up-2-move
// Unit tests for the central Supabase error handler
// Requirements: 2.3, 2.4, 16.7

import { describe, it, expect } from 'vitest'
import { handleSupabaseError } from './supabaseErrorHandler'

describe('handleSupabaseError', () => {
  it('classifies 401 errors as unauthorized and redirects to login', () => {
    // Requirements 2.3, 2.4 — 401 redirects to login with descriptive message
    const result = handleSupabaseError({ status: 401, message: 'JWT expired' })

    expect(result.kind).toBe('unauthorized')
    expect(result.redirectToLogin).toBe(true)
    expect(result.retryable).toBe(false)
    expect(result.userMessage).toMatch(/log in/i)
  })

  it("classifies 403 errors as forbidden with a permission message", () => {
    // Requirement 16.7 — 403 shows "You don't have permission"
    const result = handleSupabaseError({ status: 403, message: 'RLS denied' })

    expect(result.kind).toBe('forbidden')
    expect(result.redirectToLogin).toBe(false)
    expect(result.userMessage).toMatch(/permission/i)
  })

  it('classifies 5xx errors as server errors with retry available', () => {
    // Requirement 16.7 — 5xx shows error with retry
    const result = handleSupabaseError({ status: 503, message: 'gateway' })

    expect(result.kind).toBe('server')
    expect(result.retryable).toBe(true)
    expect(result.userMessage).toMatch(/try again/i)
  })

  it('treats fetch-style failures as retryable network errors', () => {
    const result = handleSupabaseError(new Error('Failed to fetch'))

    expect(result.kind).toBe('network')
    expect(result.retryable).toBe(true)
  })

  it('uses the supplied status override when the error has no status attached', () => {
    // PostgREST returns status on the wrapper object, not on the error itself.
    const result = handleSupabaseError(
      { message: 'not found' },
      { status: 404 },
    )

    expect(result.kind).toBe('not_found')
  })

  it('accepts storage-style errors that expose statusCode', () => {
    const result = handleSupabaseError({
      statusCode: 401,
      message: 'not allowed',
    })

    expect(result.kind).toBe('unauthorized')
    expect(result.redirectToLogin).toBe(true)
  })

  it('falls back to a safe message for empty or unknown errors', () => {
    const result = handleSupabaseError(null)

    expect(result.kind).toBe('unknown')
    expect(result.userMessage.length).toBeGreaterThan(0)
  })

  it('surfaces server-provided validation messages for 400/422', () => {
    const result = handleSupabaseError({
      status: 422,
      message: 'email already in use',
    })

    expect(result.kind).toBe('validation')
    expect(result.userMessage).toBe('email already in use')
  })
})
