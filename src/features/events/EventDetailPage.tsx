// Feature: show-up-2-move
// Event detail page with map view and live participant updates
// Requirements: 10.6, 11.6, 13.1

import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { MapContainer, TileLayer, Marker } from 'react-leaflet'
import { LatLng } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { supabase } from '../../lib/supabaseClient'
import type { RealtimeChannel } from '@supabase/supabase-js'
import ChatRoom from '../chat/ChatRoom'
import { colors, radii, shadows, themeForSport } from '../../lib/theme'

interface EventDetail {
  id: string
  sport: string
  title: string | null
  description: string | null
  organizer_id: string
  organizer_display_name: string
  group_id: string | null
  location_name: string | null
  location_lat: number | null
  location_lng: number | null
  start_time: string
  participant_limit: number
  skill_requirement: string | null
  price_per_person: number | null
  status: string
  source: string
  created_at: string
}
interface Participant {
  id: string
  user_id: string
  status: 'joined' | 'confirmed' | 'cancelled'
  joined_at: string
  display_name: string
  avatar_url?: string | null
}

export default function EventDetailPage() {
  const { eventId } = useParams<{ eventId: string }>()
  const navigate = useNavigate()

  const [event, setEvent] = useState<EventDetail | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [isGroupMember, setIsGroupMember] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cancellingParticipation, setCancellingParticipation] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [cancelSuccess, setCancelSuccess] = useState<string | null>(null)

  const fetchEventData = async () => {
    if (!eventId) { setError('Event ID is missing'); setLoading(false); return }
    try {
      const { data: { user } } = await supabase.auth.getUser()
      setCurrentUserId(user?.id ?? null)

      const { data: eventData, error: eventError } = await supabase
        .from('events')
        .select(`*, profiles!organizer_id ( display_name )`)
        .eq('id', eventId).single()
      if (eventError) throw eventError
      if (!eventData) throw new Error('Event not found')
      const raw = eventData as any
      setEvent({
        id: raw.id, sport: raw.sport, title: raw.title, description: raw.description,
        organizer_id: raw.organizer_id,
        organizer_display_name: raw.profiles?.display_name ?? 'Unknown',
        group_id: raw.group_id,
        location_name: raw.location_name,
        location_lat: raw.location_lat, location_lng: raw.location_lng,
        start_time: raw.start_time, participant_limit: raw.participant_limit,
        skill_requirement: raw.skill_requirement,
        price_per_person: raw.price_per_person,
        status: raw.status, source: raw.source, created_at: raw.created_at,
      })

      const { data: partData } = await supabase
        .from('event_participants')
        .select(`id, user_id, status, joined_at, profiles!user_id ( display_name, avatar_url )`)
        .eq('event_id', eventId).neq('status', 'cancelled')
        .order('joined_at', { ascending: true })
      const mapped: Participant[] = ((partData ?? []) as any[]).map((p) => ({
        id: p.id, user_id: p.user_id, status: p.status, joined_at: p.joined_at,
        display_name: p.profiles?.display_name ?? 'Unknown',
        avatar_url: p.profiles?.avatar_url ?? null,
      }))
      setParticipants(mapped)

      if (user && raw.group_id) {
        const { data: membership } = await supabase
          .from('group_members')
          .select('user_id')
          .eq('group_id', raw.group_id).eq('user_id', user.id)
          .maybeSingle()
        setIsGroupMember(Boolean(membership))
      } else setIsGroupMember(false)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load event details')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchEventData() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [eventId])

  useEffect(() => {
    if (!eventId) return
    const channel: RealtimeChannel = supabase
      .channel('feed')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'event_participants', filter: `event_id=eq.${eventId}` },
        () => fetchEventData(),
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [eventId])

  const handleCancelParticipation = async () => {
    if (!currentUserId || !eventId) return
    setCancelError(null); setCancelSuccess(null); setCancellingParticipation(true)
    try {
      const { error } = await supabase
        .from('event_participants')
        .update({ status: 'cancelled' })
        .eq('event_id', eventId).eq('user_id', currentUserId)
      if (error) throw error
      setCancelSuccess('Participation cancelled.')
      await fetchEventData()
    } catch (err: unknown) {
      setCancelError(err instanceof Error ? err.message : 'Failed to cancel participation')
    } finally {
      setCancellingParticipation(false)
    }
  }

  if (loading) {
    return <div style={styles.centered} aria-live="polite">Loading event…</div>
  }
  if (error || !event) {
    return (
      <div style={styles.centered}>
        <h1>Couldn't load event</h1>
        <p style={{ color: colors.ink[600] }}>{error ?? 'Event not found'}</p>
        <button style={styles.secondaryBtn} onClick={() => navigate('/feed')}>← Back to feed</button>
      </div>
    )
  }

  const startDate = new Date(event.start_time)
  const activeCount = participants.length
  const isUserParticipant = participants.some((p) => p.user_id === currentUserId)
  const isFull = activeCount >= event.participant_limit
  const pct = Math.min(100, Math.round((activeCount / event.participant_limit) * 100))
  const theme = themeForSport(event.sport)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Hero */}
      <section
        style={{
          ...styles.hero,
          background: `${theme.bg}, ${colors.surface}`,
        }}
        className="s2m-fade-in"
      >
        <div style={styles.heroTop}>
          <button style={styles.backBtn} onClick={() => navigate('/feed')}>
            ← Back
          </button>
          <span style={{ ...styles.sportChip, background: 'rgba(255,255,255,0.7)', color: theme.text }}>
            <span aria-hidden="true" style={{ fontSize: 18 }}>{theme.emoji}</span>
            {event.sport.charAt(0).toUpperCase() + event.sport.slice(1)}
          </span>
        </div>

        <h1 style={styles.heroTitle}>
          {event.title || `${event.sport.charAt(0).toUpperCase() + event.sport.slice(1)} Match`}
        </h1>
        <p style={styles.heroMeta}>Organized by {event.organizer_display_name}</p>

        <div style={styles.heroGrid}>
          <Stat label="When" value={startDate.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })} icon="📅" />
          {event.location_name && <Stat label="Where" value={event.location_name} icon="📍" />}
          <Stat label="Status" value={event.status.charAt(0).toUpperCase() + event.status.slice(1)} icon="🔖" />
          <Stat label="Source" value={event.source === 'manual' ? 'Manual' : 'Auto-matched'} icon="⚡" />
        </div>

        <div style={styles.capacityCard}>
          <div style={styles.capacityRow}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>
              {activeCount} / {event.participant_limit} joined
              {isFull && <span style={styles.fullPill}>FULL</span>}
            </span>
            <span style={{ fontSize: 12, color: colors.ink[500], fontWeight: 700 }}>{pct}%</span>
          </div>
          <div style={styles.capacityTrack}>
            <div style={{ ...styles.capacityFill, width: `${pct}%`, background: theme.solid }} />
          </div>
        </div>
      </section>

      {cancelSuccess && <div style={styles.alertSuccess} role="status">{cancelSuccess}</div>}
      {cancelError && <div style={styles.alertError} role="alert">{cancelError}</div>}

      {/* Split layout: details + map */}
      <div style={styles.splitGrid}>
        {/* Left: details */}
        <section style={styles.panel}>
          <h2 style={styles.panelTitle}>Event details</h2>
          <ul style={styles.detailList}>
            {event.skill_requirement && (
              <DetailRow icon="🎯" label="Skill" value={event.skill_requirement} />
            )}
            {event.price_per_person != null && event.price_per_person > 0 && (
              <DetailRow icon="💰" label="Cost" value={`€${event.price_per_person.toFixed(2)} / person`} />
            )}
            <DetailRow icon="👤" label="Organizer" value={event.organizer_display_name} />
          </ul>
          {event.description && (
            <div style={styles.descriptionBox}>
              <h3 style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 700, color: colors.ink[700] }}>About</h3>
              <p style={{ margin: 0, color: colors.ink[700], lineHeight: 1.55, fontSize: 14 }}>
                {event.description}
              </p>
            </div>
          )}

          {isUserParticipant && (
            <button
              onClick={handleCancelParticipation}
              disabled={cancellingParticipation}
              style={{
                ...styles.cancelBtn,
                ...(cancellingParticipation ? { opacity: 0.7, cursor: 'wait' } : {}),
              }}
            >
              {cancellingParticipation ? 'Cancelling…' : 'Cancel my participation'}
            </button>
          )}
        </section>

        {/* Right: map */}
        {event.location_lat !== null && event.location_lng !== null && (
          <section style={{ ...styles.panel, padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px 0' }}>
              <h2 style={styles.panelTitle}>Location</h2>
            </div>
            <div style={styles.mapContainer}>
              <MapContainer
                center={[event.location_lat, event.location_lng]}
                zoom={15}
                style={{ height: 360, width: '100%' }}
              >
                <TileLayer
                  attribution='&copy; OpenStreetMap contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <Marker position={new LatLng(event.location_lat, event.location_lng)} />
              </MapContainer>
            </div>
            <div style={styles.mapFooter}>
              <span style={{ color: colors.ink[600], fontSize: 12 }}>
                {event.location_lat.toFixed(4)}, {event.location_lng.toFixed(4)}
              </span>
            </div>
          </section>
        )}
      </div>

      {/* Participants */}
      <section style={styles.panel}>
        <div style={styles.panelHeader}>
          <h2 style={styles.panelTitle}>Participants ({activeCount}/{event.participant_limit})</h2>
        </div>
        {participants.length === 0 ? (
          <p style={{ color: colors.ink[500], fontStyle: 'italic' }}>No participants yet. Be the first to join!</p>
        ) : (
          <ul style={styles.participantGrid}>
            {participants.map((p) => (
              <li key={p.id} style={styles.participant}>
                <div style={styles.participantAvatar} aria-hidden="true">
                  {p.avatar_url ? (
                    <img src={p.avatar_url} alt="" style={styles.participantImg} />
                  ) : (
                    <span>{p.display_name.slice(0, 1).toUpperCase()}</span>
                  )}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={styles.participantName}>
                    {p.display_name}
                  </div>
                  <div style={styles.participantRole}>
                    {p.user_id === event.organizer_id && 'Organizer'}
                    {p.user_id === currentUserId && (
                      <span style={styles.youBadge}>{p.user_id === event.organizer_id ? ' · ' : ''}You</span>
                    )}
                    {p.status === 'confirmed' && <span style={styles.confirmedBadge}> · Confirmed</span>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Group chat */}
      {event.group_id && isGroupMember && (
        <section style={styles.panel}>
          <div style={styles.panelHeader}>
            <h2 style={styles.panelTitle}>Group chat</h2>
            <button style={styles.linkBtn} onClick={() => navigate(`/groups/${event.group_id}`)}>
              Open in full view →
            </button>
          </div>
          <p style={{ color: colors.ink[600], fontSize: 13, margin: '0 0 12px' }}>
            Coordinate with your teammates — messages are delivered in real time.
          </p>
          <div style={styles.chatWrapper}>
            <ChatRoom groupId={event.group_id} onLeave={() => navigate('/feed')} />
          </div>
        </section>
      )}
    </div>
  )
}

// ────────────── Small building blocks ──────────────

function Stat({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div style={styles.stat}>
      <span style={styles.statIcon} aria-hidden="true">{icon}</span>
      <div style={{ minWidth: 0 }}>
        <div style={styles.statLabel}>{label}</div>
        <div style={styles.statValue}>{value}</div>
      </div>
    </div>
  )
}

function DetailRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <li style={styles.detailRow}>
      <span aria-hidden="true" style={{ fontSize: 16 }}>{icon}</span>
      <span style={styles.detailLabel}>{label}</span>
      <span style={styles.detailValue}>{value}</span>
    </li>
  )
}

// ────────────── Styles ──────────────

const styles: Record<string, React.CSSProperties> = {
  centered: {
    minHeight: '70vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
    textAlign: 'center',
  },
  secondaryBtn: {
    padding: '10px 16px',
    background: colors.surface,
    border: `1px solid ${colors.ink[300]}`,
    borderRadius: radii.sm,
    color: colors.ink[700],
    fontSize: 14, fontWeight: 600, cursor: 'pointer',
  },

  hero: {
    position: 'relative',
    padding: 28,
    borderRadius: radii.xl,
    border: `1px solid ${colors.ink[200]}`,
    boxShadow: shadows.sm,
    overflow: 'hidden',
  },
  heroTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  backBtn: {
    padding: '8px 12px',
    background: 'rgba(255,255,255,0.8)',
    border: `1px solid ${colors.ink[200]}`,
    borderRadius: radii.sm,
    color: colors.ink[800],
    fontSize: 13, fontWeight: 600, cursor: 'pointer',
    backdropFilter: 'blur(6px)',
  },
  sportChip: {
    padding: '6px 14px',
    borderRadius: 999,
    fontSize: 13, fontWeight: 700,
    display: 'inline-flex', alignItems: 'center', gap: 6,
  },
  heroTitle: {
    margin: '0 0 4px',
    fontSize: 'clamp(1.6rem, 3.2vw, 2.2rem)',
    letterSpacing: '-0.02em',
    color: colors.ink[900],
  },
  heroMeta: { margin: 0, color: colors.ink[600], fontSize: 14 },
  heroGrid: {
    marginTop: 22,
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: 12,
  },
  stat: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: 12,
    background: 'rgba(255,255,255,0.8)',
    backdropFilter: 'blur(6px)',
    border: `1px solid ${colors.ink[200]}`,
    borderRadius: radii.md,
  },
  statIcon: { fontSize: 20, width: 36, height: 36, borderRadius: radii.sm,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: colors.ink[50], flexShrink: 0 },
  statLabel: { fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
    textTransform: 'uppercase', color: colors.ink[500] },
  statValue: { fontSize: 14, fontWeight: 600, color: colors.ink[900],
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },

  capacityCard: {
    marginTop: 18,
    padding: 16,
    background: 'rgba(255,255,255,0.8)',
    backdropFilter: 'blur(6px)',
    border: `1px solid ${colors.ink[200]}`,
    borderRadius: radii.md,
  },
  capacityRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 8, gap: 8,
  },
  capacityTrack: { height: 8, borderRadius: 999, background: colors.ink[100] },
  capacityFill: { height: '100%', borderRadius: 999, transition: 'width 0.4s var(--ease-out)' },
  fullPill: {
    marginLeft: 8,
    padding: '2px 8px',
    background: colors.danger[100], color: colors.danger[700],
    borderRadius: 999, fontSize: 10, fontWeight: 700, letterSpacing: '0.05em',
  },

  alertSuccess: {
    padding: '12px 16px',
    background: colors.success[100],
    color: colors.success[900],
    border: `1px solid ${colors.success[300]}`,
    borderRadius: radii.md,
    fontSize: 14, fontWeight: 500,
  },
  alertError: {
    padding: '12px 16px',
    background: colors.danger[100],
    color: colors.danger[900],
    border: `1px solid ${colors.danger[300]}`,
    borderRadius: radii.md,
    fontSize: 14, fontWeight: 500,
  },

  splitGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
    gap: 20,
  },

  panel: {
    padding: 20,
    background: colors.surface,
    border: `1px solid ${colors.ink[200]}`,
    borderRadius: radii.xl,
    boxShadow: shadows.sm,
  },
  panelHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
    flexWrap: 'wrap',
  },
  panelTitle: {
    margin: 0,
    fontSize: 16,
    fontWeight: 700,
    color: colors.ink[900],
  },
  linkBtn: {
    padding: '6px 10px',
    background: 'transparent',
    color: colors.brand[600],
    border: 'none',
    fontSize: 13, fontWeight: 600, cursor: 'pointer',
  },

  detailList: { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 },
  detailRow: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '10px 12px',
    borderRadius: radii.sm,
    background: colors.ink[50],
    fontSize: 14,
  },
  detailLabel: { color: colors.ink[600], fontWeight: 600, minWidth: 80, fontSize: 13 },
  detailValue: { color: colors.ink[900], fontWeight: 600 },
  descriptionBox: {
    marginTop: 14,
    padding: 14,
    background: colors.ink[50],
    border: `1px solid ${colors.ink[200]}`,
    borderRadius: radii.sm,
  },
  cancelBtn: {
    marginTop: 16,
    width: '100%',
    padding: '12px 16px',
    background: colors.danger[500],
    color: '#fff',
    border: 'none',
    borderRadius: radii.sm,
    fontSize: 14, fontWeight: 600, cursor: 'pointer',
    boxShadow: shadows.sm,
  },

  mapContainer: {
    overflow: 'hidden',
    borderTop: `1px solid ${colors.ink[200]}`,
    marginTop: 12,
  },
  mapFooter: {
    padding: '10px 20px',
    borderTop: `1px solid ${colors.ink[200]}`,
    background: colors.ink[50],
  },

  participantGrid: {
    listStyle: 'none',
    padding: 0, margin: 0,
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: 10,
  },
  participant: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: 10,
    background: colors.ink[50],
    border: `1px solid ${colors.ink[200]}`,
    borderRadius: radii.sm,
  },
  participantAvatar: {
    width: 36, height: 36, borderRadius: '50%',
    background: `linear-gradient(135deg, ${colors.brand[500]} 0%, ${colors.accent[500]} 100%)`,
    color: '#fff',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 14, fontWeight: 700,
    overflow: 'hidden',
    flexShrink: 0,
  },
  participantImg: { width: '100%', height: '100%', objectFit: 'cover' },
  participantName: {
    fontSize: 14, fontWeight: 600, color: colors.ink[900],
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  },
  participantRole: { fontSize: 12, color: colors.ink[500] },
  youBadge: { color: colors.success[700], fontWeight: 700 },
  confirmedBadge: { color: colors.brand[600], fontWeight: 600 },

  chatWrapper: {
    height: 600,
    maxHeight: '70vh',
  },
}
