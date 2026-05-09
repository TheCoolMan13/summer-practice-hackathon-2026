import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAIHealth } from '../../lib/aiHealth'
import { colors, radii, shadows } from '../../lib/theme'

const SPORT_EMOJI: Record<string, string> = {
  football: '⚽', basketball: '🏀', tennis: '🎾', volleyball: '🏐',
  swimming: '🏊', cycling: '🚴', running: '🏃',
  baseball: '⚾', hockey: '🏒', rugby: '🏉', golf: '⛳', boxing: '🥊',
  skiing: '⛷️', surfing: '🏄', climbing: '🧗', yoga: '🧘', gym: '🏋️',
  badminton: '🏸', tabletennis: '🏓', handball: '🤾',
}
function getSportLabel(sport: string): string {
  const emoji = SPORT_EMOJI[sport.toLowerCase()] ?? '🏅'
  const name = sport.charAt(0).toUpperCase() + sport.slice(1)
  return `${emoji} ${name}`
}

interface SportSuggestionsProps {
  userId: string
  bio: string
  onConfirm: (sports: string[]) => void
}

export default function SportSuggestions({ userId: _userId, bio, onConfirm }: SportSuggestionsProps) {
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [degraded, setDegraded] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [source, setSource] = useState<'llm' | 'keyword' | null>(null)
  const { isDegraded: aiDegraded } = useAIHealth()

  const bioIsEmpty = !bio.trim()

  async function handleGetSuggestions() {
    setLoading(true); setDegraded(false); setSuggestions([]); setSelected(new Set()); setConfirmed(false); setSource(null)
    if (aiDegraded) { setDegraded(true); setLoading(false); return }
    try {
      const { data, error } = await supabase.functions.invoke('ai-proxy', {
        body: { action: 'extract-interests', bio },
      })
      if (error) { setDegraded(true); return }
      if (data?.error === 'service unavailable' || !Array.isArray(data?.sports)) {
        setDegraded(true); return
      }
      const sports: string[] = data.sports.filter(
        (s: unknown) => typeof s === 'string' && s.trim().length > 0,
      )
      if (sports.length === 0) { setDegraded(true); return }
      setSuggestions(sports)
      if (data?.source === 'llm' || data?.source === 'keyword') {
        setSource(data.source)
      }
    } catch {
      setDegraded(true)
    } finally {
      setLoading(false)
    }
  }

  function toggleSport(sport: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(sport)) next.delete(sport); else next.add(sport)
      return next
    })
  }

  function handleConfirm() {
    const chosen = Array.from(selected)
    onConfirm(chosen)
    setConfirmed(true)
    setSelected(new Set())
    setSuggestions([])
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.icon} aria-hidden="true">✨</span>
        <div>
          <div style={styles.title}>AI sport suggestions</div>
          <div style={styles.subtitle}>Based on your bio — you confirm before anything is saved.</div>
        </div>
      </div>

      {(degraded || aiDegraded) && (
        <p style={styles.infoBanner} role="status">
          AI suggestions are temporarily unavailable. You can still add sports manually.
        </p>
      )}

      {confirmed && !degraded && (
        <p style={styles.successBanner} role="status">
          Added to your profile.
        </p>
      )}

      {!loading && suggestions.length === 0 && (
        <div>
          <button
            type="button"
            style={{
              ...styles.primaryBtn,
              ...(bioIsEmpty ? styles.primaryBtnDisabled : {}),
            }}
            onClick={handleGetSuggestions}
            disabled={bioIsEmpty || loading}
          >
            ✨ Get suggestions
          </button>
          {bioIsEmpty && (
            <p style={styles.hint}>Add a bio above to enable AI suggestions.</p>
          )}
        </div>
      )}

      {loading && (
        <p style={styles.loading} role="status">
          <span className="s2m-spin" style={styles.spinner} aria-hidden="true" />
          Analysing your bio…
        </p>
      )}

      {suggestions.length > 0 && (
        <div>
          <p style={styles.chipPrompt}>
            Select the sports you'd like to add, then confirm:
            {source === 'keyword' && (
              <span style={styles.sourceBadge}> · matched by keyword</span>
            )}
          </p>
          <div style={styles.chipsRow} role="group" aria-label="Suggested sports">
            {suggestions.map((sport) => {
              const active = selected.has(sport)
              return (
                <button
                  key={sport}
                  type="button"
                  onClick={() => toggleSport(sport)}
                  aria-pressed={active}
                  style={{ ...styles.chip, ...(active ? styles.chipActive : {}) }}
                >
                  {getSportLabel(sport)}
                </button>
              )
            })}
          </div>

          {selected.size > 0 && (
            <button type="button" style={styles.confirmBtn} onClick={handleConfirm}>
              ✓ Add {selected.size} sport{selected.size !== 1 ? 's' : ''}
            </button>
          )}

          <button type="button" style={styles.retryLink} onClick={handleGetSuggestions}>
            Refresh suggestions
          </button>
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    background: `linear-gradient(135deg, ${colors.brand[50]} 0%, rgba(255,255,255,0.6) 100%)`,
    border: `1px solid ${colors.brand[200]}`,
    borderRadius: radii.md,
    padding: 16,
  },
  header: {
    display: 'flex', alignItems: 'flex-start', gap: 10,
    marginBottom: 12,
  },
  icon: {
    fontSize: 20,
    width: 36, height: 36, borderRadius: radii.sm,
    background: '#fff',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    border: `1px solid ${colors.brand[200]}`,
    flexShrink: 0,
  },
  title: {
    fontWeight: 700, fontSize: 14, color: colors.brand[900],
  },
  subtitle: {
    fontSize: 12, color: colors.ink[600],
    lineHeight: 1.4, marginTop: 2,
  },

  infoBanner: {
    background: colors.warning[100],
    border: `1px solid ${colors.warning[300]}`,
    color: colors.warning[900],
    fontSize: 12,
    borderRadius: radii.sm,
    padding: '8px 10px',
    margin: '0 0 10px',
  },
  successBanner: {
    background: colors.success[100],
    border: `1px solid ${colors.success[300]}`,
    color: colors.success[900],
    fontSize: 12,
    borderRadius: radii.sm,
    padding: '8px 10px',
    margin: '0 0 10px',
  },

  primaryBtn: {
    padding: '8px 14px',
    background: colors.brand[500], color: '#fff', border: 'none',
    borderRadius: radii.sm, fontSize: 13, fontWeight: 600,
    cursor: 'pointer', boxShadow: shadows.xs,
  },
  primaryBtnDisabled: {
    background: colors.brand[200], color: '#fff',
    cursor: 'not-allowed', boxShadow: 'none',
  },
  hint: { color: colors.ink[500], fontSize: 12, margin: '6px 0 0' },

  loading: {
    display: 'inline-flex', alignItems: 'center', gap: 8,
    margin: 0, fontSize: 13, color: colors.brand[700],
  },
  spinner: {
    width: 14, height: 14, borderRadius: '50%',
    border: `2px solid ${colors.brand[200]}`, borderTopColor: colors.brand[500],
    display: 'inline-block',
  },

  chipPrompt: { color: colors.ink[700], fontSize: 13, margin: '0 0 8px' },
  chipsRow: {
    display: 'flex', flexWrap: 'wrap', gap: 6,
    marginBottom: 10,
  },
  chip: {
    padding: '6px 12px',
    background: '#fff',
    border: `1px solid ${colors.brand[200]}`,
    borderRadius: 999,
    color: colors.brand[700],
    fontSize: 13, fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  chipActive: {
    background: colors.brand[500],
    borderColor: colors.brand[500],
    color: '#fff',
  },

  confirmBtn: {
    padding: '8px 14px',
    background: colors.success[500], color: '#fff', border: 'none',
    borderRadius: radii.sm, fontSize: 13, fontWeight: 600,
    cursor: 'pointer', boxShadow: shadows.xs,
    marginRight: 8,
  },
  retryLink: {
    background: 'none', border: 'none',
    color: colors.brand[700],
    fontSize: 12, fontWeight: 600,
    cursor: 'pointer', textDecoration: 'underline',
    padding: 0,
  },
  sourceBadge: {
    color: colors.ink[500],
    fontSize: 12,
    fontWeight: 500,
  },
}
