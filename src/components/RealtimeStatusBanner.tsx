// Feature: show-up-2-move
// Realtime connection status banner
// Requirements: 16.7 — show "Reconnecting..." indicator when Realtime drops

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

type ConnState = 'connected' | 'connecting' | 'disconnected'

/**
 * RealtimeStatusBanner
 *
 * Displays a small fixed banner at the top of the viewport when the Supabase
 * Realtime WebSocket connection is not in a healthy "connected" state.
 *
 * The Supabase JS SDK exposes the underlying RealtimeClient as
 * `supabase.realtime`, which carries standard Phoenix-socket lifecycle
 * hooks: `onOpen`, `onClose`, `onError`, plus state inspection via
 * `isConnected()` and `connectionState()`.
 *
 * Strategy:
 *  - On mount, read the current connection state and keep it in sync with
 *    the socket via `onOpen` / `onClose` / `onError` callbacks.
 *  - When the socket is not connected AND at least one channel is active
 *    (i.e. the app actually wants realtime), show "Reconnecting…".
 *  - We do NOT show a banner when no channels are in use, because in that
 *    case the socket is intentionally idle and not a user-facing problem.
 *
 * Accessibility:
 *  - `role="status"` and `aria-live="polite"` so screen readers announce
 *    the change without interrupting the user.
 */
export default function RealtimeStatusBanner() {
  const [state, setState] = useState<ConnState>(() =>
    supabase.realtime.isConnected() ? 'connected' : 'disconnected',
  )
  const [hasActiveChannels, setHasActiveChannels] = useState<boolean>(
    () => supabase.realtime.getChannels().length > 0,
  )

  useEffect(() => {
    const client = supabase.realtime

    // The underlying Phoenix socket exposes callback registration helpers.
    // These are not strongly typed on the supabase-js surface, so we access
    // them defensively via an intersection type and feature-detect at runtime.
    type SocketLifecycle = {
      onOpen?: (cb: () => void) => void
      onClose?: (cb: () => void) => void
      onError?: (cb: (e: unknown) => void) => void
    }
    const socket = client as unknown as SocketLifecycle

    const updateFromClient = () => {
      if (client.isConnected()) setState('connected')
      else if (client.isConnecting()) setState('connecting')
      else setState('disconnected')

      setHasActiveChannels(client.getChannels().length > 0)
    }

    const handleOpen = () => setState('connected')
    const handleClose = () => {
      // If any channels are still registered the client will auto-retry;
      // surface that as "connecting" so the banner reads "Reconnecting…".
      setState(
        client.getChannels().length > 0 ? 'connecting' : 'disconnected',
      )
    }
    const handleError = () => {
      setState(
        client.getChannels().length > 0 ? 'connecting' : 'disconnected',
      )
    }

    socket.onOpen?.(handleOpen)
    socket.onClose?.(handleClose)
    socket.onError?.(handleError)

    // Poll channel count + connection state every second as a safety net:
    // the Phoenix lifecycle callbacks do not fire when channels are added
    // or removed, so we need a light poll to keep the banner in sync.
    const intervalId = window.setInterval(updateFromClient, 1000)

    // Initial sync
    updateFromClient()

    return () => {
      window.clearInterval(intervalId)
      // Phoenix sockets do not expose `offOpen`/`offClose` in the Supabase
      // surface; the callbacks are retained for the lifetime of the client.
      // This is acceptable because the banner is mounted once at the app root.
    }
  }, [])

  // Nothing to show when connected, or when no channels are in use.
  if (state === 'connected' || !hasActiveChannels) return null

  const label =
    state === 'connecting'
      ? 'Reconnecting…'
      : 'Connection lost. Reconnecting…'

  return (
    <div role="status" aria-live="polite" style={styles.banner}>
      <span style={styles.dot} aria-hidden="true" />
      <span>{label}</span>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  banner: {
    alignItems: 'center',
    background: '#fef3c7',
    borderBottom: '1px solid #fcd34d',
    color: '#92400e',
    display: 'flex',
    fontSize: '0.875rem',
    fontWeight: 500,
    gap: '0.5rem',
    justifyContent: 'center',
    left: 0,
    padding: '0.5rem 1rem',
    position: 'fixed',
    right: 0,
    top: 0,
    zIndex: 1000,
  },
  dot: {
    background: '#f59e0b',
    borderRadius: '50%',
    display: 'inline-block',
    height: 8,
    width: 8,
    animation: 'pulse 1.2s ease-in-out infinite',
  },
}
