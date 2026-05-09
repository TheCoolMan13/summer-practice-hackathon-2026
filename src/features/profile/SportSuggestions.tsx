import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAIHealth } from '../../lib/aiHealth'

// ─── Sport emoji map ──────────────────────────────────────────────────────────

const SPORT_EMOJI: Record<string, string> = {
  football: '⚽',
  basketball: '🏀',
  tennis: '🎾',
  volleyball: '🏐',
  swimming: '🏊',
  cycling: '🚴',
  running: '🏃',
  baseball: '⚾',
  hockey: '🏒',
  rugby: '🏉',
  golf: '⛳',
  boxing: '🥊',
  skiing: '⛷️',
  surfing: '🏄',
  climbing: '🧗',
  yoga: '🧘',
  gym: '🏋️',
  badminton: '🏸',
  tabletennis: '🏓',
  handball: '🤾',
}

function getSportLabel(sport: string): string {
  const emoji = SPORT_EMOJI[sport.toLowerCase()] ?? '🏅'
  const name = sport.charAt(0).toUpperCase() + sport.slice(1)
  return `${emoji} ${name}`
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface SportSuggestionsProps {
  /** The authenticated user's ID (reserved for future use / logging) */
  userId: string
  /** The bio text to send to the AI proxy */
  bio: string
  /** Called with the confirmed list of sport names; parent handles DB writes */
  onConfirm: (sports: string[]) => void
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * SportSuggestions
 *
 * Calls the `ai-proxy` Edge Function with the user's bio text and displays
 * returned sport suggestions as selectable chips. The user must explicitly
 * confirm before any sports are added to their profile.
 *
 * Requirements covered:
 *  - 4.1: AI_Service returns inferred sport names within 5 seconds
 *  - 4.2: When AI is unavailable, show non-blocking message; allow manual selection
 *  - 4.3: Present suggestions as selectable options; require explicit confirmation
 *  - 4.4: (image analysis) — bio-based path; same confirmation requirement applies
 */
export default function SportSuggestions({ userId: _userId, bio, onConfirm }: SportSuggestionsProps) {
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [degraded, setDegraded] = useState(false)
  const [confirmed, setConfirmed] = useState(false)

  // Global AI health state — lets us pre-empt the round-trip when the
  // `ai-proxy` health probe already knows the service is down (Req 14.2, 14.5).
  const { isDegraded: aiDegraded } = useAIHealth()

  const bioIsEmpty = !bio.trim()

  // ── Fetch suggestions ───────────────────────────────────────────────────────

  async function handleGetSuggestions() {
    setLoading(true)
    setDegraded(false)
    setSuggestions([])
    setSelected(new Set())
    setConfirmed(false)

    // Short-circuit when we already know AI is unavailable — skip the
    // network round-trip and show the degraded UI immediately (Req 14.5).
    if (aiDegraded) {
      setDegraded(true)
      setLoading(false)
      return
    }

    try {
      const { data, error } = await supabase.functions.invoke('ai-proxy', {
        body: { action: 'extract-interests', bio },
      })

      if (error) {
        // Edge Function invocation error — treat as degraded (Req 4.2)
        setDegraded(true)
        return
      }

      // Degraded mode: ai-proxy returns { sports: [], error: "service unavailable" }
      if (data?.error === 'service unavailable' || !Array.isArray(data?.sports)) {
        setDegraded(true)
        return
      }

      const sports: string[] = data.sports.filter(
        (s: unknown) => typeof s === 'string' && s.trim().length > 0,
      )

      if (sports.length === 0) {
        // No suggestions returned — treat as degraded so user knows AI ran but found nothing
        setDegraded(true)
        return
      }

      setSuggestions(sports)
    } catch {
      // Network or unexpected error — non-blocking degraded mode (Req 4.2, 14.5)
      setDegraded(true)
    } finally {
      setLoading(false)
    }
  }

  // ── Chip toggle ─────────────────────────────────────────────────────────────

  function toggleSport(sport: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(sport)) {
        next.delete(sport)
      } else {
        next.add(sport)
      }
      return next
    })
  }

  // ── Confirm selection ───────────────────────────────────────────────────────

  function handleConfirm() {
    const chosen = Array.from(selected)
    onConfirm(chosen)
    setConfirmed(true)
    // Reset chip state after confirmation
    setSelected(new Set())
    setSuggestions([])
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.icon} aria-hidden="true">🤖</span>
        <span style={styles.title}>AI Sport Suggestions</span>
      </div>

      {/* Degraded / unavailable notice — non-blocking (Req 4.2, 14.5) */}
      {(degraded || aiDegraded) && (
        <p style={styles.infoMessage} role="status" aria-live="polite">
          AI suggestions are temporarily unavailable. You can still add sports manually below.
        </p>
      )}

      {/* Confirmed notice */}
      {confirmed && !degraded && (
        <p style={styles.successMessage} role="status" aria-live="polite">
          Sports added to your profile!
        </p>
      )}

      {/* Get suggestions button */}
      {!loading && suggestions.length === 0 && (
        <div style={styles.buttonRow}>
          <button
            type="button"
            style={{
              ...styles.suggestButton,
              ...(bioIsEmpty ? styles.suggestButtonDisabled : {}),
            }}
            onClick={handleGetSuggestions}
            disabled={bioIsEmpty || loading}
            title={bioIsEmpty ? 'Add a bio to get suggestions' : undefined}
            aria-disabled={bioIsEmpty}
          >
            ✨ Get AI suggestions
          </button>
          {bioIsEmpty && (
            <p style={styles.hint}>Add a bio above to enable AI suggestions.</p>
          )}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <p style={styles.loadingText} aria-live="polite" aria-label="Loading AI suggestions">
          <span aria-hidden="true">⏳</span> Analysing your bio…
        </p>
      )}

      {/* Suggestion chips (Req 4.3) */}
      {suggestions.length > 0 && (
        <div>
          <p style={styles.chipPrompt}>
            Select the sports you'd like to add, then confirm:
          </p>
          <div style={styles.chipsRow} role="group" aria-label="Suggested sports">
            {suggestions.map((sport) => {
              const isSelected = selected.has(sport)
              return (
                <button
                  key={sport}
                  type="button"
                  style={{
                    ...styles.chip,
                    ...(isSelected ? styles.chipSelected : {}),
                  }}
                  onClick={() => toggleSport(sport)}
                  aria-pressed={isSelected}
                  aria-label={`${isSelected ? 'Deselect' : 'Select'} ${sport}`}
                >
                  {getSportLabel(sport)}
                </button>
              )
            })}
          </div>

          {/* Confirm button — only visible when at least one chip is selected (Req 4.3) */}
          {selected.size > 0 && (
            <button
              type="button"
              style={styles.confirmButton}
              onClick={handleConfirm}
            >
              ✓ Add {selected.size} sport{selected.size !== 1 ? 's' : ''} to profile
            </button>
          )}

          {/* Allow re-fetching */}
          <button
            type="button"
            style={styles.retryLink}
            onClick={handleGetSuggestions}
          >
            Refresh suggestions
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Inline styles ────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  container: {
    backgroundColor: '#f0f9ff',
    border: '1px solid #bae6fd',
    borderRadius: '8px',
    padding: '1rem',
    marginTop: '0.75rem',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    marginBottom: '0.75rem',
  },
  icon: {
    fontSize: '1.1rem',
  },
  title: {
    fontWeight: 700,
    fontSize: '0.9rem',
    color: '#0369a1',
  },
  infoMessage: {
    backgroundColor: '#fff7ed',
    border: '1px solid #fed7aa',
    borderRadius: '6px',
    color: '#9a3412',
    fontSize: '0.8rem',
    margin: '0 0 0.75rem',
    padding: '0.5rem 0.75rem',
  },
  successMessage: {
    backgroundColor: '#f0fff4',
    border: '1px solid #9ae6b4',
    borderRadius: '6px',
    color: '#276749',
    fontSize: '0.8rem',
    margin: '0 0 0.75rem',
    padding: '0.5rem 0.75rem',
  },
  buttonRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  suggestButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#0ea5e9',
    border: 'none',
    borderRadius: '6px',
    color: '#ffffff',
    cursor: 'pointer',
    fontSize: '0.875rem',
    fontWeight: 600,
    padding: '0.5rem 1rem',
  },
  suggestButtonDisabled: {
    backgroundColor: '#bae6fd',
    color: '#7dd3fc',
    cursor: 'not-allowed',
  },
  hint: {
    color: '#718096',
    fontSize: '0.78rem',
    margin: 0,
  },
  loadingText: {
    color: '#0369a1',
    fontSize: '0.875rem',
    margin: 0,
  },
  chipPrompt: {
    color: '#374151',
    fontSize: '0.8rem',
    margin: '0 0 0.5rem',
  },
  chipsRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.5rem',
    marginBottom: '0.75rem',
  },
  chip: {
    backgroundColor: '#e0f2fe',
    border: '1.5px solid #7dd3fc',
    borderRadius: '999px',
    color: '#0369a1',
    cursor: 'pointer',
    fontSize: '0.85rem',
    fontWeight: 500,
    padding: '0.35rem 0.85rem',
    transition: 'background-color 0.1s, border-color 0.1s',
  },
  chipSelected: {
    backgroundColor: '#0ea5e9',
    borderColor: '#0284c7',
    color: '#ffffff',
  },
  confirmButton: {
    backgroundColor: '#16a34a',
    border: 'none',
    borderRadius: '6px',
    color: '#ffffff',
    cursor: 'pointer',
    display: 'block',
    fontSize: '0.875rem',
    fontWeight: 600,
    marginBottom: '0.5rem',
    padding: '0.5rem 1rem',
  },
  retryLink: {
    background: 'none',
    border: 'none',
    color: '#0369a1',
    cursor: 'pointer',
    fontSize: '0.78rem',
    padding: 0,
    textDecoration: 'underline',
  },
}
