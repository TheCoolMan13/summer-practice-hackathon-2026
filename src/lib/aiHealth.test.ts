// Feature: show-up-2-move
// Unit tests for AI health state management (Task 23.1)
// Requirements: 14.2, 14.4, 14.5
//
// These tests exercise the pure probe function (`probeAIHealth`) and the
// default context shape. We deliberately stay out of jsdom to avoid the
// project's pre-existing jsdom/ESM issue; the provider's polling loop is a
// thin `setInterval` wrapper over `probeAIHealth`, so validating the probe
// classification covers the observable behaviour.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Stub the Supabase client so we can drive `functions.invoke` responses.
// The factory is hoisted above the test file's imports, so we capture the
// mock via `vi.hoisted` to avoid ReferenceError on `invokeMock`.
const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }))
vi.mock('./supabaseClient', () => ({
  supabase: {
    functions: { invoke: invokeMock },
  },
}))

import { AIHealthContext, probeAIHealth } from './aiHealth'

describe('AIHealthContext (default value)', () => {
  it('starts in "unknown" with no lastChecked timestamp', () => {
    // The default context value is what consumers see when no provider
    // is mounted above them (e.g., server-rendered paths, tests).
    const defaults = (AIHealthContext as unknown as {
      _currentValue: ReturnType<typeof fallback>
    })._currentValue ?? fallback()

    expect(defaults.status).toBe('unknown')
    expect(defaults.isAvailable).toBe(false)
    expect(defaults.isDegraded).toBe(false)
    expect(defaults.lastChecked).toBeNull()
  })
})

/**
 * Matches the default state shape in case React internals don't expose
 * `_currentValue` on the context object in a given version.
 */
function fallback() {
  return {
    status: 'unknown' as const,
    isAvailable: false,
    isDegraded: false,
    lastChecked: null,
    checkNow: async () => 'unknown' as const,
  }
}

describe('probeAIHealth', () => {
  beforeEach(() => {
    invokeMock.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns "healthy" when ai-proxy responds with a non-degraded payload', async () => {
    invokeMock.mockResolvedValueOnce({
      data: { status: 'ok', provider: 'ollama' },
      error: null,
    })

    const status = await probeAIHealth()
    expect(status).toBe('healthy')
    expect(invokeMock).toHaveBeenCalledTimes(1)
    expect(invokeMock).toHaveBeenCalledWith('ai-proxy', {
      body: { endpoint: '/health', method: 'GET' },
    })
  })

  it('returns "degraded" when ai-proxy reports service unavailable (Req 14.2)', async () => {
    invokeMock.mockResolvedValueOnce({
      data: { error: 'service unavailable' },
      error: null,
    })

    const status = await probeAIHealth()
    expect(status).toBe('degraded')
  })

  it('returns "degraded" when the invoke call itself errors', async () => {
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: new Error('network fail'),
    })

    const status = await probeAIHealth()
    expect(status).toBe('degraded')
  })

  it('returns "degraded" on an unexpected payload shape', async () => {
    invokeMock.mockResolvedValueOnce({ data: 'not an object', error: null })
    const status = await probeAIHealth()
    expect(status).toBe('degraded')
  })

  it('returns "degraded" when the probe exceeds its timeout (Req 14.5)', async () => {
    vi.useFakeTimers()
    // invoke() never resolves — the race against the timeout should win.
    invokeMock.mockImplementationOnce(() => new Promise(() => {}))

    const promise = probeAIHealth(50)
    await vi.advanceTimersByTimeAsync(60)
    await expect(promise).resolves.toBe('degraded')
  })

  it('never throws, even if invoke throws synchronously', async () => {
    invokeMock.mockImplementationOnce(() => {
      throw new Error('boom')
    })

    await expect(probeAIHealth()).resolves.toBe('degraded')
  })

  it('classifies recovery: a healthy response after a degraded one returns "healthy" (Req 14.4)', async () => {
    invokeMock
      .mockResolvedValueOnce({
        data: { error: 'service unavailable' },
        error: null,
      })
      .mockResolvedValueOnce({ data: { status: 'ok' }, error: null })

    expect(await probeAIHealth()).toBe('degraded')
    expect(await probeAIHealth()).toBe('healthy')
  })
})
