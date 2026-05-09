// Feature: show-up-2-move
// Venue poll component with live vote count updates
// Requirements: 11.3, 11.4

import { useVenuePoll } from './useVenuePoll'
import { colors, radii, shadows } from '../../lib/theme'

interface VenuePollProps { groupId: string }

export default function VenuePoll({ groupId }: VenuePollProps) {
  const { poll, userVote, voteCounts, loading, error, castVote } = useVenuePoll(groupId)

  if (loading) {
    return <div style={styles.statusBox}>Loading poll…</div>
  }
  if (error) {
    return <div style={{ ...styles.statusBox, color: colors.danger[700] }}>Error: {error}</div>
  }
  if (!poll) return null

  const totalVotes = Object.values(voteCounts).reduce((sum, c) => sum + c, 0)

  return (
    <section style={styles.card}>
      <header style={styles.header}>
        <div>
          <span style={styles.eyebrow}>Venue poll</span>
          <h3 style={styles.title}>Vote for a spot</h3>
        </div>
        <span style={styles.totalPill}>
          {totalVotes} vote{totalVotes !== 1 ? 's' : ''}
          {userVote && ' · you voted'}
        </span>
      </header>

      <ul style={styles.list}>
        {poll.options.map((option) => {
          const voteCount = voteCounts[option.id] || 0
          const percentage = totalVotes > 0 ? (voteCount / totalVotes) * 100 : 0
          const isUserVote = userVote === option.id

          return (
            <li key={option.id}>
              <button
                onClick={() => castVote(option.id)}
                disabled={poll.status === 'closed'}
                style={{
                  ...styles.option,
                  ...(isUserVote ? styles.optionSelected : {}),
                  ...(poll.status === 'closed' ? styles.optionDisabled : {}),
                }}
              >
                <div
                  style={{
                    ...styles.optionFill,
                    width: `${percentage}%`,
                    background: isUserVote
                      ? 'rgba(79, 99, 255, 0.12)'
                      : 'rgba(79, 99, 255, 0.06)',
                  }}
                />
                <div style={styles.optionContent}>
                  <div style={styles.optionHeader}>
                    <div>
                      <div style={styles.optionName}>
                        {option.venue_name}
                        {isUserVote && <span style={styles.yourVote}>Your vote</span>}
                      </div>
                      <div style={styles.optionMeta}>
                        {option.price_est != null && (
                          <span>💰 €{option.price_est.toFixed(2)}</span>
                        )}
                        {option.distance_km != null && (
                          <span>📏 {option.distance_km.toFixed(1)} km</span>
                        )}
                      </div>
                    </div>
                    <span
                      style={{
                        ...styles.voteBadge,
                        ...(isUserVote ? styles.voteBadgeSelected : {}),
                      }}
                    >
                      {voteCount}
                    </span>
                  </div>
                  {totalVotes > 0 && (
                    <div style={styles.pct}>{percentage.toFixed(0)}%</div>
                  )}
                </div>
              </button>
            </li>
          )
        })}
      </ul>

      {poll.status === 'closed' && (
        <p style={styles.closedBanner}>This poll is closed.</p>
      )}
    </section>
  )
}

const styles: Record<string, React.CSSProperties> = {
  statusBox: {
    padding: 16,
    textAlign: 'center',
    background: colors.ink[50],
    borderRadius: radii.md,
    fontSize: 14,
    color: colors.ink[600],
    margin: '12px 0',
  },
  card: {
    padding: 18,
    margin: '12px 0',
    background: colors.surface,
    border: `1px solid ${colors.brand[200]}`,
    borderRadius: radii.md,
    boxShadow: shadows.sm,
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 14,
  },
  eyebrow: {
    display: 'inline-block',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: colors.brand[600],
    marginBottom: 4,
  },
  title: { margin: 0, fontSize: 16, fontWeight: 700 },
  totalPill: {
    padding: '4px 10px',
    background: colors.ink[100],
    color: colors.ink[700],
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 600,
  },
  list: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },

  option: {
    position: 'relative',
    width: '100%',
    padding: '14px 16px',
    background: colors.ink[50],
    border: `1px solid ${colors.ink[200]}`,
    borderRadius: radii.md,
    textAlign: 'left',
    cursor: 'pointer',
    overflow: 'hidden',
    transition: 'border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease',
  },
  optionSelected: {
    borderColor: colors.brand[500],
    boxShadow: `0 0 0 3px ${colors.brand[100]}`,
  },
  optionDisabled: { cursor: 'not-allowed', opacity: 0.75 },
  optionFill: {
    position: 'absolute',
    top: 0, left: 0, bottom: 0,
    transition: 'width 0.4s var(--ease-out)',
    zIndex: 0,
  },
  optionContent: { position: 'relative', zIndex: 1 },
  optionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  optionName: {
    fontSize: 14,
    fontWeight: 700,
    color: colors.ink[900],
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  yourVote: {
    padding: '2px 8px',
    background: colors.brand[500],
    color: '#fff',
    borderRadius: 999,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
  },
  optionMeta: {
    display: 'flex',
    gap: 12,
    marginTop: 4,
    fontSize: 12,
    color: colors.ink[600],
  },
  voteBadge: {
    minWidth: 36,
    height: 36,
    padding: '0 10px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: colors.surface,
    border: `1px solid ${colors.ink[200]}`,
    borderRadius: radii.sm,
    fontSize: 14,
    fontWeight: 700,
    color: colors.ink[700],
  },
  voteBadgeSelected: {
    background: colors.brand[500],
    color: '#fff',
    borderColor: colors.brand[500],
  },
  pct: {
    marginTop: 8,
    fontSize: 11,
    fontWeight: 700,
    color: colors.ink[500],
    letterSpacing: '0.05em',
  },

  closedBanner: {
    marginTop: 12,
    padding: '8px 12px',
    background: colors.warning[100],
    color: colors.warning[900],
    borderRadius: radii.sm,
    fontSize: 12,
    textAlign: 'center',
    fontWeight: 600,
  },
}
