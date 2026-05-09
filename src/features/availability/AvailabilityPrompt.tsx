import { useEffect, useRef, useState } from 'react'
import { type Sport, useAvailability } from './useAvailability'

const ALL_SPORTS: Sport[] = ['football', 'basketball', 'tennis', 'volleyball']

const SPORT_LABELS: Record<Sport, string> = {
  football: '⚽ Football',
  basketball: '🏀 Basketball',
  tennis: '🎾 Tennis',
  volleyball: '🏐 Volleyball',
}

interface AvailabilityPromptProps {
  /** The authenticated user's UUID */
  userId: string
}

/**
 * AvailabilityPrompt
 *
 * The "ShowUpToday?" widget that lets a user declare their availability for
 * sports activities today.
 *
 * Behaviour:
 * - On mount, fetches the current availability record (Requirements 6.6).
 * - If an active declaration exists (is_available=true AND expires_at > now),
 *   shows the current status with a live countdown (Requirement 6.6).
 * - "Yes" button upserts availability with expires_at = NOW() + 8h and saves
 *   the selected sports (Requirements 6.1, 6.3, 6.5).
 * - "No" button sets is_available=false (Requirement 6.2).
 * - Optional time window picker (preferred_start / preferred_end) (Req 6.3).
 * - Sport multi-select via checkboxes (Requirement 6.3).
 * - Loading state during API calls; error message on failure (Req 6.5).
 */
export default function AvailabilityPrompt({ userId }: AvailabilityPromptProps) {
  const { availability, loading, error, declareAvailable, declareUnavailable } =
    useAvailability(userId)

  // Local form state
  const [selectedSports, setSelectedSports] = useState<Sport[]>([])
  const [preferredStart, setPreferredStart] = useState('')
  const [preferredEnd, setPreferredEnd] = useState('')
  const [showTimeWindow, setShowTimeWindow] = useState(false)

  // Countdown display
  const [remainingLabel, setRemainingLabel] = useState('')
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Seed form from existing record when it loads
  useEffect(() => {
    if (availability) {
      setSelectedSports(availability.sports)
      setPreferredStart(availability.preferred_start ?? '')
      setPreferredEnd(availability.preferred_end ?? '')
      setShowTimeWindow(
        !!(availability.preferred_start || availability.preferred_end),
      )
    }
  }, [availability])

  // Live countdown ticker (Requirement 6.6)
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)

    const isActive =
      availability?.is_available &&
      availability.expires_at &&
      new Date(availability.expires_at) > new Date()

    if (!isActive) {
      setRemainingLabel('')
      return
    }

    const tick = () => {
      const diffMs = new Date(availability!.expires_at).getTime() - Date.now()
      if (diffMs <= 0) {
        setRemainingLabel('Expired')
        if (intervalRef.current) clearInterval(intervalRef.current)
        return
      }
      const totalMinutes = Math.floor(diffMs / 60_000)
      const hours = Math.floor(totalMinutes / 60)
      const minutes = totalMinutes % 60
      setRemainingLabel(
        hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`,
      )
    }

    tick()
    intervalRef.current = setInterval(tick, 30_000)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [availability])

  // ── Derived state ────────────────────────────────────────────────────────────

  const isActive =
    !!availability?.is_available &&
    !!availability.expires_at &&
    new Date(availability.expires_at) > new Date()

  // ── Handlers ─────────────────────────────────────────────────────────────────

  function toggleSport(sport: Sport) {
    setSelectedSports((prev) =>
      prev.includes(sport) ? prev.filter((s) => s !== sport) : [...prev, sport],
    )
  }

  async function handleYes() {
    await declareAvailable({
      preferredStart: showTimeWindow && preferredStart ? preferredStart : undefined,
      preferredEnd: showTimeWindow && preferredEnd ? preferredEnd : undefined,
      sports: selectedSports,
    })
  }

  async function handleNo() {
    await declareUnavailable()
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <section style={styles.card} aria-label="Availability prompt">
      {/* ── Active status banner (Requirement 6.6) ── */}
      {isActive ? (
        <div style={styles.activeBanner} role="status">
          <span style={styles.activeDot} aria-hidden="true" />
          <div>
            <p style={styles.activeTitle}>You&apos;re available! 🎉</p>
            {remainingLabel && (
              <p style={styles.activeSubtitle}>Expires in {remainingLabel}</p>
            )}
            {availability!.sports.length > 0 && (
              <p style={styles.activeSports}>
                Sports:{' '}
                {availability!.sports
                  .map((s) => SPORT_LABELS[s] ?? s)
                  .join(', ')}
              </p>
            )}
          </div>
        </div>
      ) : (
        <p style={styles.promptTitle}>ShowUpToday? 🏃</p>
      )}

      {/* ── Sport multi-select (Requirement 6.3) ── */}
      <fieldset style={styles.fieldset}>
        <legend style={styles.legend}>Which sports are you up for?</legend>
        <div style={styles.sportsGrid}>
          {ALL_SPORTS.map((sport) => (
            <label key={sport} style={styles.sportLabel}>
              <input
                type="checkbox"
                checked={selectedSports.includes(sport)}
                onChange={() => toggleSport(sport)}
                disabled={loading}
                style={styles.checkbox}
              />
              {SPORT_LABELS[sport]}
            </label>
          ))}
        </div>
      </fieldset>

      {/* ── Optional time window (Requirement 6.3) ── */}
      <div style={styles.timeToggleRow}>
        <label style={styles.timeToggleLabel}>
          <input
            type="checkbox"
            checked={showTimeWindow}
            onChange={(e) => setShowTimeWindow(e.target.checked)}
            disabled={loading}
            style={styles.checkbox}
          />
          Set preferred time window (optional)
        </label>
      </div>

      {showTimeWindow && (
        <div style={styles.timeWindowGrid}>
          <div style={styles.timeField}>
            <label htmlFor="preferred-start" style={styles.timeLabel}>
              From
            </label>
            <input
              id="preferred-start"
              type="datetime-local"
              value={preferredStart}
              onChange={(e) => setPreferredStart(e.target.value)}
              disabled={loading}
              style={styles.input}
            />
          </div>
          <div style={styles.timeField}>
            <label htmlFor="preferred-end" style={styles.timeLabel}>
              Until
            </label>
            <input
              id="preferred-end"
              type="datetime-local"
              value={preferredEnd}
              onChange={(e) => setPreferredEnd(e.target.value)}
              disabled={loading}
              style={styles.input}
            />
          </div>
        </div>
      )}

      {/* ── Error message ── */}
      {error && (
        <p style={styles.errorMessage} role="alert">
          {error}
        </p>
      )}

      {/* ── Yes / No buttons ── */}
      <div style={styles.buttonRow}>
        <button
          type="button"
          onClick={handleYes}
          disabled={loading}
          style={{
            ...styles.button,
            ...styles.yesButton,
            ...(loading ? styles.buttonDisabled : {}),
          }}
          aria-label="Declare availability: Yes"
        >
          {loading ? 'Saving…' : isActive ? '✅ Update' : '✅ Yes, I\'m in!'}
        </button>

        <button
          type="button"
          onClick={handleNo}
          disabled={loading}
          style={{
            ...styles.button,
            ...styles.noButton,
            ...(loading ? styles.buttonDisabled : {}),
          }}
          aria-label="Declare availability: No"
        >
          {loading ? 'Saving…' : '❌ Not today'}
        </button>
      </div>

      {/* ── Loading indicator ── */}
      {loading && (
        <p style={styles.loadingText} role="status" aria-live="polite">
          Updating your availability…
        </p>
      )}
    </section>
  )
}

// ─── Inline styles ────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  card: {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
    padding: '1.5rem',
    maxWidth: '480px',
    width: '100%',
    fontFamily: 'sans-serif',
  },
  promptTitle: {
    fontSize: '1.4rem',
    fontWeight: 700,
    color: '#1a202c',
    margin: '0 0 1rem',
  },
  activeBanner: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.75rem',
    backgroundColor: '#f0fff4',
    border: '1px solid #9ae6b4',
    borderRadius: '8px',
    padding: '0.875rem 1rem',
    marginBottom: '1rem',
  },
  activeDot: {
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    backgroundColor: '#38a169',
    flexShrink: 0,
    marginTop: '4px',
  },
  activeTitle: {
    margin: 0,
    fontWeight: 700,
    fontSize: '1rem',
    color: '#276749',
  },
  activeSubtitle: {
    margin: '0.2rem 0 0',
    fontSize: '0.875rem',
    color: '#2f855a',
  },
  activeSports: {
    margin: '0.2rem 0 0',
    fontSize: '0.8rem',
    color: '#48bb78',
  },
  fieldset: {
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    padding: '0.75rem 1rem',
    marginBottom: '0.75rem',
  },
  legend: {
    fontSize: '0.875rem',
    fontWeight: 600,
    color: '#4a5568',
    padding: '0 0.25rem',
  },
  sportsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '0.5rem',
    marginTop: '0.5rem',
  },
  sportLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    fontSize: '0.9rem',
    color: '#2d3748',
    cursor: 'pointer',
  },
  checkbox: {
    cursor: 'pointer',
    accentColor: '#3182ce',
  },
  timeToggleRow: {
    marginBottom: '0.5rem',
  },
  timeToggleLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    fontSize: '0.875rem',
    color: '#4a5568',
    cursor: 'pointer',
  },
  timeWindowGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '0.75rem',
    marginBottom: '0.75rem',
  },
  timeField: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  timeLabel: {
    fontSize: '0.8rem',
    fontWeight: 600,
    color: '#4a5568',
  },
  input: {
    border: '1px solid #cbd5e0',
    borderRadius: '6px',
    fontSize: '0.875rem',
    padding: '0.5rem 0.625rem',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box' as const,
  },
  errorMessage: {
    backgroundColor: '#fff5f5',
    border: '1px solid #fed7d7',
    borderRadius: '6px',
    color: '#c53030',
    fontSize: '0.875rem',
    padding: '0.625rem 0.75rem',
    marginBottom: '0.75rem',
  },
  buttonRow: {
    display: 'flex',
    gap: '0.75rem',
    marginTop: '1rem',
  },
  button: {
    flex: 1,
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '0.95rem',
    fontWeight: 600,
    padding: '0.75rem 1rem',
    transition: 'background-color 0.15s',
  },
  yesButton: {
    backgroundColor: '#38a169',
    color: '#ffffff',
  },
  noButton: {
    backgroundColor: '#e53e3e',
    color: '#ffffff',
  },
  buttonDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  loadingText: {
    fontSize: '0.8rem',
    color: '#718096',
    textAlign: 'center',
    marginTop: '0.5rem',
  },
}
