// Feature: show-up-2-move
// Venue poll component with live vote count updates
// Requirements: 11.3, 11.4

import { useVenuePoll } from './useVenuePoll'

interface VenuePollProps {
  groupId: string
}

/**
 * VenuePoll
 *
 * Displays venue poll options and allows group members to vote.
 * Shows live vote counts updated via Realtime Broadcast.
 *
 * Requirements:
 *  11.3 - Venue poll voting with UNIQUE constraint enforcement
 *  11.4 - Live vote count updates displayed to all group members
 */
export default function VenuePoll({ groupId }: VenuePollProps) {
  const { poll, userVote, voteCounts, loading, error, castVote } = useVenuePoll(groupId)

  if (loading) {
    return (
      <div
        style={{
          padding: '1rem',
          textAlign: 'center',
          color: '#666',
          background: '#f8f9fa',
          borderRadius: '8px',
          margin: '1rem 0',
        }}
      >
        Loading poll...
      </div>
    )
  }

  if (error) {
    return (
      <div
        style={{
          padding: '1rem',
          background: '#f8d7da',
          color: '#721c24',
          borderRadius: '8px',
          margin: '1rem 0',
        }}
      >
        Error: {error}
      </div>
    )
  }

  if (!poll) {
    return null // No active poll
  }

  const totalVotes = Object.values(voteCounts).reduce((sum, count) => sum + count, 0)

  return (
    <div
      style={{
        padding: '1.5rem',
        background: '#fff',
        border: '2px solid #007bff',
        borderRadius: '8px',
        margin: '1rem 0',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
      }}
    >
      {/* Poll header */}
      <div style={{ marginBottom: '1rem' }}>
        <h3
          style={{
            margin: '0 0 0.5rem 0',
            fontSize: '1.1rem',
            color: '#333',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <span>📍</span>
          <span>Vote for a Venue</span>
        </h3>
        <p style={{ margin: 0, fontSize: '0.85rem', color: '#666' }}>
          {totalVotes} vote{totalVotes !== 1 ? 's' : ''} cast
          {userVote && ' • You voted'}
        </p>
      </div>

      {/* Poll options */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {poll.options.map((option) => {
          const voteCount = voteCounts[option.id] || 0
          const percentage = totalVotes > 0 ? (voteCount / totalVotes) * 100 : 0
          const isUserVote = userVote === option.id

          return (
            <button
              key={option.id}
              onClick={() => castVote(option.id)}
              disabled={poll.status === 'closed'}
              style={{
                position: 'relative',
                padding: '1rem',
                background: isUserVote ? '#e7f3ff' : '#f8f9fa',
                border: isUserVote ? '2px solid #007bff' : '1px solid #ddd',
                borderRadius: '8px',
                cursor: poll.status === 'open' ? 'pointer' : 'not-allowed',
                textAlign: 'left',
                transition: 'all 0.2s',
                overflow: 'hidden',
              }}
              onMouseEnter={(e) => {
                if (poll.status === 'open') {
                  e.currentTarget.style.borderColor = '#007bff'
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,123,255,0.2)'
                }
              }}
              onMouseLeave={(e) => {
                if (!isUserVote) {
                  e.currentTarget.style.borderColor = '#ddd'
                  e.currentTarget.style.boxShadow = 'none'
                }
              }}
            >
              {/* Vote percentage background bar */}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  height: '100%',
                  width: `${percentage}%`,
                  background: isUserVote
                    ? 'rgba(0, 123, 255, 0.15)'
                    : 'rgba(0, 123, 255, 0.08)',
                  transition: 'width 0.3s ease',
                  zIndex: 0,
                }}
              />

              {/* Option content */}
              <div style={{ position: 'relative', zIndex: 1 }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: '0.5rem',
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        fontSize: '1rem',
                        fontWeight: isUserVote ? 'bold' : 'normal',
                        color: '#333',
                        marginBottom: '0.25rem',
                      }}
                    >
                      {option.venue_name}
                      {isUserVote && (
                        <span
                          style={{
                            marginLeft: '0.5rem',
                            fontSize: '0.85rem',
                            color: '#007bff',
                          }}
                        >
                          ✓ Your vote
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: '0.85rem',
                        color: '#666',
                        display: 'flex',
                        gap: '1rem',
                      }}
                    >
                      {option.price_est !== null && (
                        <span>💰 ${option.price_est.toFixed(2)}</span>
                      )}
                      {option.distance_km !== null && (
                        <span>📏 {option.distance_km.toFixed(1)} km</span>
                      )}
                    </div>
                  </div>

                  {/* Vote count badge */}
                  <div
                    style={{
                      padding: '0.25rem 0.75rem',
                      background: isUserVote ? '#007bff' : '#e9ecef',
                      color: isUserVote ? '#fff' : '#333',
                      borderRadius: '12px',
                      fontSize: '0.85rem',
                      fontWeight: 'bold',
                      minWidth: '3rem',
                      textAlign: 'center',
                    }}
                  >
                    {voteCount} {voteCount === 1 ? 'vote' : 'votes'}
                  </div>
                </div>

                {/* Percentage bar */}
                {totalVotes > 0 && (
                  <div
                    style={{
                      fontSize: '0.75rem',
                      color: '#666',
                      fontWeight: 'bold',
                    }}
                  >
                    {percentage.toFixed(0)}%
                  </div>
                )}
              </div>
            </button>
          )
        })}
      </div>

      {/* Poll status */}
      {poll.status === 'closed' && (
        <div
          style={{
            marginTop: '1rem',
            padding: '0.75rem',
            background: '#fff3cd',
            color: '#856404',
            borderRadius: '4px',
            fontSize: '0.9rem',
            textAlign: 'center',
          }}
        >
          This poll is closed
        </div>
      )}
    </div>
  )
}
