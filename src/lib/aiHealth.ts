// Feature: show-up-2-move
// AI health state management
//
// Responsibilities (Task 23.1):
//   - Poll the `ai-proxy` Edge Function for AI service health
//   - Expose a React context (`AIHealthContext`) so all AI-dependent
//     components can conditionally render degraded-mode UI
//   - Treat any failure (network error, invoke error, explicit degraded
//     response) as "degraded" so core flows never block on AI
//
// Requirements: 14.2, 14.4, 14.5

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { supabase } from './supabaseClient'

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * AI health status.
 *
 *  - `healthy`   — `ai-proxy` reported the AI microservice as reachable
 *  - `degraded`  — AI is unavailable (timeout, non-200, missing config, etc.)
 *  - `unknown`   — no probe has completed yet (first render)
 */
export type AIHealthStatus = 'healthy' | 'degraded' | 'unknown'

/**
 * State exposed by the `AIHealthContext`.
 *
 * Consumers typically read `isAvailable` / `isDegraded` to decide whether
 * to render AI-enhanced UI or fall back to degraded-mode UI.
 */
export interface AIHealthState {
  /** Current health status */
  status: AIHealthStatus
  /** Convenience: true only when status === 'healthy' */
  isAvailable: boolean
  /** Convenience: true only when status === 'degraded' */
  isDegraded: boolean
  /** Timestamp (ms) of the most recent completed probe, or null if none yet */
  lastChecked: number | null
  /** Force an immediate probe (e.g., after a user retries an AI action). */
  checkNow: () => Promise<AIHealthStatus>
}

// ─── Default / unused context value ──────────────────────────────────────────

const defaultState: AIHealthState = {
  status: 'unknown',
  isAvailable: false,
  isDegraded: false,
  lastChecked: null,
  checkNow: async () => 'unknown',
}

/**
 * React context carrying AI health state. Provided by `AIHealthProvider`
 * at the app root; consumed via `useAIHealth()` (or `useContext`) by any
 * AI-dependent component.
 */
export const AIHealthContext = createContext<AIHealthState>(defaultState)

/** Hook for consuming the AI health context. */
export function useAIHealth(): AIHealthState {
  return useContext(AIHealthContext)
}

// ─── Configuration ───────────────────────────────────────────────────────────

/** Default poll interval (60s). Short enough to auto-resume quickly, long
 *  enough to avoid unnecessary traffic. */
export const DEFAULT_POLL_INTERVAL_MS = 60_000

/** Per-probe timeout (3.5s). Slightly above `ai-proxy`'s 3s internal budget. */
export const DEFAULT_PROBE_TIMEOUT_MS = 3_500

// ─── Default probe implementation ────────────────────────────────────────────

/**
 * Probe AI health by asking `ai-proxy` to forward a `GET /health` request.
 *
 * The Edge Function is the single source of truth for AI availability:
 *  - If `AI_BASE_URL` is unset it returns `{ error: 'service unavailable' }`
 *  - If its cached health check failed it returns the same degraded payload
 *  - Otherwise it proxies the live `/health` response through
 *
 * We classify the outcome as:
 *  - `healthy`  — the proxy returned a non-degraded payload
 *  - `degraded` — any error, abort, or `error: 'service unavailable'`
 *
 * This function never throws; errors collapse to `degraded`.
 */
export async function probeAIHealth(
  timeoutMs: number = DEFAULT_PROBE_TIMEOUT_MS,
): Promise<AIHealthStatus> {
  try {
    // Wrap invoke in a Promise.resolve so a synchronous throw (e.g. when the
    // supabase client is misconfigured) lands in our catch block instead of
    // escaping upward.
    const invokePromise = Promise.resolve().then(() =>
      supabase.functions.invoke('ai-proxy', {
        body: { endpoint: '/health', method: 'GET' },
      }),
    )

    const timeoutPromise = new Promise<{ data: null; error: Error }>((resolve) => {
      setTimeout(
        () => resolve({ data: null, error: new Error('ai-proxy probe timed out') }),
        timeoutMs,
      )
    })

    const result = (await Promise.race([invokePromise, timeoutPromise])) as {
      data: unknown
      error: unknown
    }

    if (result.error) return 'degraded'
    if (!result.data || typeof result.data !== 'object') return 'degraded'

    const payload = result.data as { error?: unknown }
    if (payload.error === 'service unavailable') return 'degraded'

    return 'healthy'
  } catch {
    return 'degraded'
  }
}

// ─── Provider ────────────────────────────────────────────────────────────────

export interface AIHealthProviderProps {
  children: ReactNode
  /** Override the polling interval (mostly for tests). */
  pollIntervalMs?: number
  /** Custom probe function (mostly for tests). */
  probe?: () => Promise<AIHealthStatus>
  /** Initial status before the first probe resolves (default: 'unknown'). */
  initialStatus?: AIHealthStatus
}

/**
 * AIHealthProvider
 *
 * Runs an initial probe on mount and then polls `ai-proxy` on a fixed
 * interval. Components nested inside the provider can call `useAIHealth()`
 * to branch on the current status.
 *
 * The provider cleans up its interval on unmount and ignores any probe
 * result that resolves after unmount, preventing setState-after-unmount
 * warnings.
 */
export function AIHealthProvider({
  children,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  probe,
  initialStatus = 'unknown',
}: AIHealthProviderProps) {
  const [status, setStatus] = useState<AIHealthStatus>(initialStatus)
  const [lastChecked, setLastChecked] = useState<number | null>(null)

  // Keep the probe fn in a ref so callers can swap it without retriggering
  // the polling effect.
  const probeRef = useRef<() => Promise<AIHealthStatus>>(probe ?? probeAIHealth)
  probeRef.current = probe ?? probeAIHealth

  const checkNow = useCallback(async (): Promise<AIHealthStatus> => {
    const next = await probeRef.current()
    setStatus(next)
    setLastChecked(Date.now())
    return next
  }, [])

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      const next = await probeRef.current()
      if (cancelled) return
      setStatus(next)
      setLastChecked(Date.now())
    }

    // Initial probe on mount.
    run()

    // Periodic re-probe so recovery is detected automatically (Req 14.4).
    const id = setInterval(run, pollIntervalMs)

    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [pollIntervalMs])

  const value: AIHealthState = {
    status,
    isAvailable: status === 'healthy',
    isDegraded: status === 'degraded',
    lastChecked,
    checkNow,
  }

  // Use createElement so this module can live in a plain `.ts` file
  // (no JSX transform required), matching the path specified by the task.
  return createElement(AIHealthContext.Provider, { value }, children)
}
