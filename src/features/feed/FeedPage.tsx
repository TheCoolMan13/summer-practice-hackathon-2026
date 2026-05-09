// Feature: show-up-2-move
// Home feed page — event discovery and join
// Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 10.4, 10.5

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFeed, FeedFilters } from './useFeed'
import { useEventActions } from './useEventActions'
import AvailabilityPrompt from '../availability/AvailabilityPrompt'
import { supabase } from '../../lib/supabaseClient'
import { colors, radii, shadows, themeForSport } from '../../lib/theme'

const SPORTS = ['football', 'basketball', 'tennis', 'volleyball'] as const

export default function FeedPage() {
  const navigate = useNavigate()
  const [filters, setFilters] = useState<FeedFilters>({})
  const { events, loading, error, refetch } = useFeed(filters)
  const { joinEvent, loading: joiningEvent } = useEventActions()
  const [joinError, setJoinError] = useState<string | null>(null)
  const [joinSuccess, setJoinSuccess] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null))
  }, [])

  const handleSportFilterChange = (sport: string) => {
    setFilters((prev) => ({ ...prev, sport: sport === 'all' ? undefined : sport }))
  }
  const handleDistanceFilterChange = (radiusKm: number | undefined) => {
    setFilters((prev) => ({ ...prev, radiusKm }))
  }
  const handleTimeWindowChange = (hours: number | undefined) => {
    setFilters((prev) => ({ ...prev, timeWindowHours: hours }))
  }

  const handleJoinEvent = async (eventId: string) => {
    setJoinError(null); setJoinSuccess(null)
    const result = await joinEvent(eventId)
    if (result.success) {
      setJoinSuccess('Joined! Opening the group chat…')
      await refetch()
    } else if (result.isFull) {
      setJoinError('This event is full.')
    } else {
      setJoinError(result.error ?? 'Failed to join event')
    }
  }

  const clearFilters = () => setFilters({})
  const hasFilters = Boolean(filters.sport || filters.radiusKm || filters.timeWindowHours)

  return (
    <div style={styles.page}>
      {/* Hero + availability prompt */}
      <section style={styles.hero}>
        <div style={styles.heroText}>
          <span style={styles.heroEyebrow}>Today</span>
          <h1 style={styles.heroTitle}>Find a game, bring the energy.</h1>
          <p style={styles.heroSubtitle}>
            Tap once, get matched with players nearby, and show up ready to play.
          </p>
          <div style={styles.heroActions}>
            <button style={styles.heroCtaPrimary} onClick={() => navigate('/events/create')}>
              ＋ Create event
            </button>
            <button style={styles.heroCtaSecondary} onClick={() => navigate('/groups')}>
              💬 Your groups
            </button>
          </div>
        </div>
        <div style={styles.heroAside}>
          {userId && <AvailabilityPrompt userId={userId} />}
        </div>
      </section>

      {/* Filters */}
      <section style={styles.filterBar} aria-label="Filters">
        <div style={styles.filterChips}>
          <FilterChip
            label="All sports"
            active={!filters.sport}
            onClick={() => handleSportFilterChange('all')}
          />
          {SPORTS.map((s) => {
            const theme = themeForSport(s)
            return (
              <FilterChip
                key={s}
                label={`${theme.emoji} ${s.charAt(0).toUpperCase() + s.slice(1)}`}
                active={filters.sport === s}
                onClick={() => handleSportFilterChange(s)}
                activeColor={theme.solid}
              />
            )
          })}
        </div>

        <div style={styles.filterSelects}>
          <label style={styles.selectGroup}>
            <span style={styles.selectLabel}>Distance</span>
            <select
              value={filters.radiusKm ?? 'all'}
              onChange={(e) =>
                handleDistanceFilterChange(e.target.value === 'all' ? undefined : Number(e.target.value))
              }
              style={styles.select}
            >
              <option value="all">Any distance</option>
              <option value="5">Within 5 km</option>
              <option value="10">Within 10 km</option>
              <option value="25">Within 25 km</option>
              <option value="50">Within 50 km</option>
            </select>
          </label>

          <label style={styles.selectGroup}>
            <span style={styles.selectLabel}>Starting</span>
            <select
              value={filters.timeWindowHours ?? 'all'}
              onChange={(e) =>
                handleTimeWindowChange(e.target.value === 'all' ? undefined : Number(e.target.value))
              }
              style={styles.select}
            >
              <option value="all">Any time</option>
              <option value="24">Next 24 hours</option>
              <option value="48">Next 2 days</option>
              <option value="168">Next week</option>
            </select>
          </label>

          {hasFilters && (
            <button type="button" onClick={clearFilters} style={styles.clearBtn}>
              Clear filters
            </button>
          )}
        </div>
      </section>

      {/* Toasts */}
      {joinSuccess && (
        <div style={styles.toastSuccess} role="status">
          <span aria-hidden="true">✅</span> {joinSuccess}
        </div>
      )}
      {joinError && (
        <div style={styles.toastError} role="alert">
          <span aria-hidden="true">⚠️</span> {joinError}
        </div>
      )}
      {error && (
        <div style={styles.toastError} role="alert">
          <span aria-hidden="true">⚠️</span> {error}
        </div>
      )}

      {/* Event grid */}
      <section>
        <div style={styles.sectionHeader}>
          <h2 style={styles.sectionTitle}>Upcoming events</h2>
          {!loading && events.length > 0 && (
            <span style={styles.sectionMeta}>{events.length} match{events.length !== 1 ? 'es' : ''}</span>
          )}
        </div>

        {loading && (
          <div style={styles.grid}>
            {[0, 1, 2, 3].map((i) => <SkeletonCard key={i} />)}
          </div>
        )}

        {!loading && events.length === 0 && (
          <div style={styles.emptyState}>
            <div style={styles.emptyIcon} aria-hidden="true">🎯</div>
            <h3 style={styles.emptyTitle}>No events match your filters</h3>
            <p style={styles.emptyText}>
              Loosen the filters or be the spark — create your own pickup game.
            </p>
            <div style={styles.emptyActions}>
              <button style={styles.heroCtaPrimary} onClick={() => navigate('/events/create')}>
                ＋ Create event
              </button>
              {hasFilters && (
                <button style={styles.heroCtaSecondary} onClick={clearFilters}>
                  Clear filters
                </button>
              )}
            </div>
          </div>
        )}

        {!loading && events.length > 0 && (
          <div style={styles.grid}>
            {events.map((event) => {
              const theme = themeForSport(event.sport)
              const isEventFull = event.participant_count >= event.participant_limit
              const participantPct = Math.min(100, Math.round((event.participant_count / event.participant_limit) * 100))

              return (
                <article
                  key={event.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/events/${event.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      navigate(`/events/${event.id}`)
                    }
                  }}
                  style={styles.card}
                  className="s2m-fade-in"
                >
                  {/* Sport ribbon */}
                  <div
                    style={{
                      ...styles.cardRibbon,
                      background: theme.bg,
                      color: theme.text,
                    }}
                  >
                    <span style={styles.cardEmoji} aria-hidden="true">{theme.emoji}</span>
                    <span style={styles.cardSportLabel}>{event.sport}</span>
                    {isEventFull && <span style={styles.fullPill}>Full</span>}
                  </div>

                  <div style={styles.cardBody}>
                    <h3 style={styles.cardTitle}>
                      {event.title || `${event.sport.charAt(0).toUpperCase() + event.sport.slice(1)} Match`}
                    </h3>
                    <p style={styles.cardOrganizer}>Organized by {event.organizer_display_name}</p>

                    <ul style={styles.cardMeta}>
                      <li style={styles.cardMetaItem}>
                        <span aria-hidden="true">📅</span>
                        {new Date(event.start_time).toLocaleString([], {
                          weekday: 'short', month: 'short', day: 'numeric',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </li>
                      {event.location_name && (
                        <li style={styles.cardMetaItem}>
                          <span aria-hidden="true">📍</span>
                          {event.location_name}
                          {event.distance_km !== null && (
                            <span style={styles.distance}> · {event.distance_km.toFixed(1)} km</span>
                          )}
                        </li>
                      )}
                      {event.skill_requirement && (
                        <li style={styles.cardMetaItem}>
                          <span aria-hidden="true">🎯</span>
                          {event.skill_requirement}
                        </li>
                      )}
                      {event.price_per_person != null && event.price_per_person > 0 && (
                        <li style={styles.cardMetaItem}>
                          <span aria-hidden="true">💰</span>
                          €{event.price_per_person.toFixed(2)} / person
                        </li>
                      )}
                    </ul>

                    {event.description && (
                      <p style={styles.cardDescription}>{event.description}</p>
                    )}

                    <div style={styles.capacity}>
                      <div style={styles.capacityRow}>
                        <span style={styles.capacityText}>
                          <strong>{event.participant_count}</strong> / {event.participant_limit} joined
                        </span>
                        <span style={styles.capacityPct}>{participantPct}%</span>
                      </div>
                      <div style={styles.capacityTrack}>
                        <div
                          style={{
                            ...styles.capacityFill,
                            width: `${participantPct}%`,
                            background: theme.solid,
                          }}
                        />
                      </div>
                    </div>

                    <div style={styles.cardActions} onClick={(e) => e.stopPropagation()}>
                      {event.user_is_participant ? (
                        <button disabled style={{ ...styles.joinBtn, ...styles.joinedBtn }}>
                          ✓ You're in
                        </button>
                      ) : isEventFull ? (
                        <button disabled style={{ ...styles.joinBtn, ...styles.fullBtn }}>
                          Event is full
                        </button>
                      ) : (
                        <button
                          style={{ ...styles.joinBtn, background: theme.solid }}
                          disabled={joiningEvent}
                          onClick={() => handleJoinEvent(event.id)}
                        >
                          {joiningEvent ? 'Joining…' : 'Join event'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => navigate(`/events/${event.id}`)}
                        style={styles.detailsBtn}
                      >
                        Details →
                      </button>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

// ────────────── Small subcomponents ──────────────

function FilterChip({
  label, active, onClick, activeColor,
}: { label: string; active: boolean; onClick: () => void; activeColor?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '8px 14px',
        borderRadius: 999,
        border: `1px solid ${active ? (activeColor ?? colors.brand[500]) : colors.ink[200]}`,
        background: active ? (activeColor ?? colors.brand[500]) : colors.surface,
        color: active ? '#fff' : colors.ink[700],
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  )
}

function SkeletonCard() {
  return (
    <div style={styles.card}>
      <div style={{ ...styles.cardRibbon, background: colors.ink[100], color: colors.ink[400] }}>
        <div style={{ ...styles.skeleton, width: 60, height: 16 }} />
      </div>
      <div style={styles.cardBody}>
        <div style={{ ...styles.skeleton, width: '80%', height: 22, marginBottom: 8 }} />
        <div style={{ ...styles.skeleton, width: '50%', height: 14, marginBottom: 14 }} />
        <div style={{ ...styles.skeleton, width: '100%', height: 10, marginBottom: 6 }} />
        <div style={{ ...styles.skeleton, width: '60%', height: 10, marginBottom: 20 }} />
        <div style={{ ...styles.skeleton, width: '100%', height: 40, borderRadius: radii.sm }} />
      </div>
    </div>
  )
}

// ────────────── Styles ──────────────

const styles: Record<string, React.CSSProperties> = {
  page: { display: 'flex', flexDirection: 'column', gap: 32 },

  hero: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1.4fr) minmax(320px, 1fr)',
    gap: 28,
    alignItems: 'center',
    padding: 32,
    borderRadius: radii.xl,
    background:
      'linear-gradient(135deg, rgba(79,99,255,0.08) 0%, rgba(255,122,77,0.08) 100%), #ffffff',
    border: `1px solid ${colors.ink[200]}`,
    boxShadow: shadows.md,
    overflow: 'hidden',
    position: 'relative',
  },
  heroText: { position: 'relative', zIndex: 1 },
  heroEyebrow: {
    display: 'inline-block',
    padding: '4px 12px',
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    background: colors.brand[50],
    color: colors.brand[700],
    marginBottom: 12,
  },
  heroTitle: {
    margin: 0,
    fontSize: 'clamp(1.8rem, 3.6vw, 2.6rem)',
    fontWeight: 800,
    letterSpacing: '-0.025em',
    lineHeight: 1.1,
    color: colors.ink[900],
  },
  heroSubtitle: {
    margin: '12px 0 20px',
    fontSize: 16,
    lineHeight: 1.55,
    color: colors.ink[600],
    maxWidth: 520,
  },
  heroActions: { display: 'flex', gap: 10, flexWrap: 'wrap' },
  heroCtaPrimary: {
    padding: '12px 18px',
    background: `linear-gradient(135deg, ${colors.brand[500]} 0%, ${colors.accent[500]} 100%)`,
    color: '#fff',
    border: 'none',
    borderRadius: radii.sm,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    boxShadow: shadows.md,
  },
  heroCtaSecondary: {
    padding: '12px 18px',
    background: colors.surface,
    color: colors.ink[800],
    border: `1px solid ${colors.ink[200]}`,
    borderRadius: radii.sm,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  heroAside: { display: 'flex', justifyContent: 'flex-end' },

  filterBar: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    padding: 16,
    background: colors.surface,
    border: `1px solid ${colors.ink[200]}`,
    borderRadius: radii.lg,
    boxShadow: shadows.xs,
  },
  filterChips: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterSelects: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 10,
    alignItems: 'center',
  },
  selectGroup: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
  },
  selectLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: colors.ink[500],
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  select: {
    width: 'auto',
    minWidth: 170,
    padding: '8px 36px 8px 12px',
    fontSize: 13,
    fontWeight: 500,
  },
  clearBtn: {
    marginLeft: 'auto',
    padding: '8px 12px',
    background: 'transparent',
    color: colors.ink[600],
    border: 'none',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    textDecoration: 'underline',
  },

  toastSuccess: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '12px 16px',
    background: colors.success[100],
    border: `1px solid ${colors.success[300]}`,
    color: colors.success[900],
    borderRadius: radii.md,
    fontSize: 14, fontWeight: 500,
  },
  toastError: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '12px 16px',
    background: colors.danger[100],
    border: `1px solid ${colors.danger[300]}`,
    color: colors.danger[900],
    borderRadius: radii.md,
    fontSize: 14, fontWeight: 500,
  },

  sectionHeader: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sectionTitle: {
    margin: 0,
    fontSize: 22,
    fontWeight: 700,
    letterSpacing: '-0.015em',
  },
  sectionMeta: {
    color: colors.ink[500],
    fontSize: 13,
    fontWeight: 500,
  },

  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
    gap: 18,
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    background: colors.surface,
    border: `1px solid ${colors.ink[200]}`,
    borderRadius: radii.lg,
    overflow: 'hidden',
    cursor: 'pointer',
    transition: 'transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease',
    boxShadow: shadows.xs,
  },
  cardRibbon: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '14px 18px',
    fontWeight: 700,
    textTransform: 'capitalize',
    letterSpacing: 0,
    fontSize: 13,
  },
  cardEmoji: { fontSize: 22 },
  cardSportLabel: { flex: 1 },
  fullPill: {
    padding: '3px 10px',
    background: 'rgba(239,68,68,0.15)',
    color: colors.danger[700],
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
  },
  cardBody: {
    padding: '16px 18px 18px',
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
  },
  cardTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 700,
    color: colors.ink[900],
    letterSpacing: '-0.01em',
  },
  cardOrganizer: {
    margin: '4px 0 14px',
    fontSize: 13,
    color: colors.ink[500],
  },
  cardMeta: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    marginBottom: 12,
  },
  cardMetaItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 13,
    color: colors.ink[700],
  },
  distance: { color: colors.ink[500] },
  cardDescription: {
    margin: '4px 0 14px',
    fontSize: 13,
    color: colors.ink[600],
    lineHeight: 1.5,
    fontStyle: 'italic',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },

  capacity: { marginTop: 'auto', marginBottom: 14 },
  capacityRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    fontSize: 12, color: colors.ink[600], marginBottom: 6,
  },
  capacityText: { fontSize: 13 },
  capacityPct: { fontSize: 12, fontWeight: 700, color: colors.ink[500] },
  capacityTrack: {
    height: 6, borderRadius: 999,
    background: colors.ink[100], overflow: 'hidden',
  },
  capacityFill: {
    height: '100%', borderRadius: 999,
    transition: 'width 0.4s var(--ease-out)',
  },

  cardActions: {
    display: 'flex',
    gap: 8,
  },
  joinBtn: {
    flex: 1,
    padding: '10px 14px',
    border: 'none',
    borderRadius: radii.sm,
    color: '#fff',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    boxShadow: shadows.xs,
    transition: 'transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease',
  },
  joinedBtn: {
    background: colors.success[500],
    cursor: 'default',
  },
  fullBtn: {
    background: colors.ink[400],
    cursor: 'not-allowed',
  },
  detailsBtn: {
    padding: '10px 14px',
    background: 'transparent',
    color: colors.ink[700],
    border: `1px solid ${colors.ink[200]}`,
    borderRadius: radii.sm,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },

  emptyState: {
    textAlign: 'center',
    padding: '64px 24px',
    background: colors.surface,
    border: `1px dashed ${colors.ink[300]}`,
    borderRadius: radii.lg,
  },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { margin: 0, fontSize: 20, fontWeight: 700 },
  emptyText: { margin: '8px auto 20px', color: colors.ink[600], maxWidth: 480 },
  emptyActions: { display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' },

  skeleton: {
    background: `linear-gradient(90deg, ${colors.ink[100]} 0%, ${colors.ink[200]} 40%, ${colors.ink[100]} 80%)`,
    backgroundSize: '600px 100%',
    borderRadius: 6,
    animation: 's2m-shimmer 1.4s linear infinite',
  },
}
