import { useEffect, useRef, useState } from 'react'
import { type Sport, useAvailability } from './useAvailability'
import { colors, gradients, radii, shadows, themeForSport } from '../../lib/theme'

const ALL_SPORTS: Sport[] = ['football', 'basketball', 'tennis', 'volleyball']

interface AvailabilityPromptProps { userId: string }

/**
 * AvailabilityPrompt — the "ShowUpToday?" widget.
 * Requirements: 6.1, 6.2, 6.3, 6.5, 6.6
 */
export default function AvailabilityPrompt({ userId }: AvailabilityPromptProps) {
  const { availability, loading, error, declareAvailable, declareUnavailable } = useAvailability(userId)

  const [selectedSports, setSelectedSports] = useState<Sport[]>([])
  const [preferredStart, setPreferredStart] = useState('')
  const [preferredEnd, setPreferredEnd] = useState('')
  const [showTimeWindow, setShowTimeWindow] = useState(false)
  const [remainingLabel, setRemainingLabel] = useState('')
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (availability) {
      setSelectedSports(availability.sports)
      setPreferredStart(availability.preferred_start ?? '')
      setPreferredEnd(availability.preferred_end ?? '')
      setShowTimeWindow(!!(availability.preferred_start || availability.preferred_end))
    }
  }, [availability])

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    const isActive =
      availability?.is_available &&
      availability.expires_at &&
      new Date(availability.expires_at) > new Date()
    if (!isActive) { setRemainingLabel(''); return }

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
      setRemainingLabel(hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`)
    }
    tick()
    intervalRef.current = setInterval(tick, 30_000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [availability])

  const isActive =
    !!availability?.is_available &&
    !!availability.expires_at &&
    new Date(availability.expires_at) > new Date()

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
  async function handleNo() { await declareUnavailable() }

  return (
    <section style={styles.card} aria-label="Availability prompt">
      <header style={styles.header}>
        <div style={styles.headerText}>
          <span style={styles.eyebrow}>ShowUp2Move</span>
          <h2 style={styles.title}>Ready to play today?</h2>
          <p style={styles.subtitle}>
            Let us know and we'll start matching you with players nearby.
          </p>
        </div>
        {isActive && (
          <div style={styles.statusPill} role="status">
            <span style={styles.statusDot} className="s2m-pulse" />
            Active · {remainingLabel}
          </div>
        )}
      </header>

      <fieldset style={styles.fieldset}>
        <legend style={styles.legend}>Which sports?</legend>
        <div style={styles.sportsGrid}>
          {ALL_SPORTS.map((sport) => {
            const theme = themeForSport(sport)
            const active = selectedSports.includes(sport)
            return (
              <button
                key={sport}
                type="button"
                onClick={() => toggleSport(sport)}
                disabled={loading}
                aria-pressed={active}
                style={{
                  ...styles.sportChip,
                  ...(active
                    ? {
                        background: theme.bg,
                        borderColor: theme.solid,
                        color: theme.text,
                        boxShadow: `0 6px 14px -4px ${theme.glow}`,
                      }
                    : {}),
                }}
              >
                <span style={{ fontSize: 20 }} aria-hidden="true">{theme.emoji}</span>
                <span>{sport.charAt(0).toUpperCase() + sport.slice(1)}</span>
                {active && <span style={styles.checkMark} aria-hidden="true">✓</span>}
              </button>
            )
          })}
        </div>
      </fieldset>

      <label style={styles.toggleRow}>
        <input
          type="checkbox"
          checked={showTimeWindow}
          onChange={(e) => setShowTimeWindow(e.target.checked)}
          disabled={loading}
          style={styles.checkbox}
        />
        Add a preferred time window (optional)
      </label>

      {showTimeWindow && (
        <div style={styles.timeGrid}>
          <div>
            <label htmlFor="preferred-start" style={styles.timeLabel}>From</label>
            <input
              id="preferred-start"
              type="datetime-local"
              value={preferredStart}
              onChange={(e) => setPreferredStart(e.target.value)}
              disabled={loading}
            />
          </div>
          <div>
            <label htmlFor="preferred-end" style={styles.timeLabel}>Until</label>
            <input
              id="preferred-end"
              type="datetime-local"
              value={preferredEnd}
              onChange={(e) => setPreferredEnd(e.target.value)}
              disabled={loading}
            />
          </div>
        </div>
      )}

      {error && <p style={styles.error} role="alert">{error}</p>}

      <div style={styles.buttons}>
        <button
          type="button"
          onClick={handleYes}
          disabled={loading}
          style={{ ...styles.primaryBtn, ...(loading ? styles.busy : {}) }}
        >
          {loading ? 'Saving…' : isActive ? 'Update availability' : "I'm in! Match me"}
        </button>
        <button
          type="button"
          onClick={handleNo}
          disabled={loading}
          style={styles.secondaryBtn}
        >
          Not today
        </button>
      </div>
    </section>
  )
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    width: '100%',
    maxWidth: 420,
    background: colors.surface,
    border: `1px solid ${colors.ink[200]}`,
    borderRadius: radii.lg,
    padding: 22,
    boxShadow: shadows.md,
    position: 'relative',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 16,
  },
  headerText: { flex: 1, minWidth: 0 },
  eyebrow: {
    display: 'inline-block',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: colors.brand[600],
    marginBottom: 4,
  },
  title: {
    margin: 0,
    fontSize: 19,
    fontWeight: 700,
    letterSpacing: '-0.01em',
  },
  subtitle: {
    margin: '4px 0 0',
    fontSize: 13,
    color: colors.ink[500],
    lineHeight: 1.4,
  },
  statusPill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 12px',
    background: colors.success[100],
    color: colors.success[700],
    border: `1px solid ${colors.success[300]}`,
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    whiteSpace: 'nowrap',
  },
  statusDot: {
    width: 8, height: 8, borderRadius: '50%',
    background: colors.success[500],
    display: 'inline-block',
  },

  fieldset: {
    border: 'none',
    padding: 0,
    margin: '0 0 14px',
  },
  legend: {
    fontSize: 12,
    fontWeight: 600,
    color: colors.ink[600],
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  sportsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 8,
  },
  sportChip: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 12px',
    background: colors.surface,
    border: `1px solid ${colors.ink[200]}`,
    borderRadius: radii.sm,
    color: colors.ink[700],
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    position: 'relative',
  },
  checkMark: {
    marginLeft: 'auto',
    fontSize: 14,
    fontWeight: 800,
  },
  toggleRow: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 13,
    color: colors.ink[600],
    marginBottom: 10,
    cursor: 'pointer',
  },
  checkbox: { width: 16, height: 16, accentColor: colors.brand[500], cursor: 'pointer' },
  timeGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 10,
    marginBottom: 12,
  },
  timeLabel: {
    display: 'block',
    fontSize: 12,
    fontWeight: 600,
    color: colors.ink[600],
    marginBottom: 4,
  },
  error: {
    background: colors.danger[100],
    border: `1px solid ${colors.danger[300]}`,
    color: colors.danger[700],
    fontSize: 13,
    borderRadius: radii.sm,
    padding: '8px 10px',
    margin: '10px 0 0',
  },

  buttons: { display: 'flex', gap: 8, marginTop: 16 },
  primaryBtn: {
    flex: 1,
    padding: '12px 14px',
    border: 'none',
    borderRadius: radii.sm,
    background: gradients.brandStrong,
    color: '#fff',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: shadows.md,
  },
  secondaryBtn: {
    padding: '12px 14px',
    background: colors.surface,
    color: colors.ink[700],
    border: `1px solid ${colors.ink[200]}`,
    borderRadius: radii.sm,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  busy: { opacity: 0.85, cursor: 'wait' },
}
