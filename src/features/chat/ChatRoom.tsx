// Feature: show-up-2-move
// Group chat UI with real-time messaging and emoji reactions.
// Requirements: 9.3, 9.4, 9.5, 9.7, 8.5, 11.5, 12.2, 12.6

import { useEffect, useRef, useState } from 'react'
import { useGroupChat, Message } from './useGroupChat'
import { supabase } from '../../lib/supabaseClient'
import VenuePoll from './VenuePoll'
import { useLeaveGroup } from '../groups/useLeaveGroup'
import { colors, gradients, radii, shadows, themeForSport } from '../../lib/theme'

interface ChatRoomProps {
  groupId: string
  onLeave?: () => void
}
interface Profile {
  id: string
  display_name: string
  avatar_url: string | null
}
interface Group {
  id: string
  sport: string
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed'
  captain_id: string | null
  event_id: string | null
}
interface VenueOption {
  name: string
  price_est: number | null
  distance_km: number | null
}

const EMOJI_REACTIONS = ['👍', '❤️', '😂', '🔥', '👏'] as const

export default function ChatRoom({ groupId, onLeave }: ChatRoomProps) {
  const { messages, loading, error, sendMessage } = useGroupChat(groupId)
  const { leaving, error: leaveError, leaveGroup } = useLeaveGroup()

  const [messageInput, setMessageInput] = useState('')
  const [sending, setSending] = useState(false)
  const [profiles, setProfiles] = useState<Record<string, Profile>>({})
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [group, setGroup] = useState<Group | null>(null)
  const [isCaptain, setIsCaptain] = useState(false)

  const [showVenueForm, setShowVenueForm] = useState(false)
  const [venueOptions, setVenueOptions] = useState<VenueOption[]>([])
  const [loadingVenues, setLoadingVenues] = useState(false)
  const [finalizeForm, setFinalizeForm] = useState({ location: '', startTime: '' })
  const [showFinalizeForm, setShowFinalizeForm] = useState(false)

  const [reactionPickerFor, setReactionPickerFor] = useState<string | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // ── Auth / group / profile fetching (unchanged logic) ────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null))
  }, [])

  useEffect(() => {
    if (!currentUserId) return
    supabase
      .from('groups')
      .select('id, sport, status, captain_id, event_id')
      .eq('id', groupId)
      .single()
      .then(({ data, error }) => {
        if (!error && data) {
          setGroup(data)
          setIsCaptain(data.captain_id === currentUserId)
        }
      })
  }, [groupId, currentUserId])

  useEffect(() => {
    const senderIds = [
      ...new Set(messages.filter((m) => m.sender_id !== null).map((m) => m.sender_id as string)),
    ]
    if (senderIds.length === 0) return
    supabase
      .from('profiles')
      .select('id, display_name, avatar_url')
      .in('id', senderIds)
      .then(({ data, error }) => {
        if (!error && data) {
          const map: Record<string, Profile> = {}
          data.forEach((p) => { map[p.id] = p })
          setProfiles(map)
        }
      })
  }, [messages])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Close reaction picker when clicking elsewhere
  useEffect(() => {
    if (!reactionPickerFor) return
    const handler = () => setReactionPickerFor(null)
    const t = setTimeout(() => document.addEventListener('click', handler), 0)
    return () => {
      clearTimeout(t)
      document.removeEventListener('click', handler)
    }
  }, [reactionPickerFor])

  // ── Actions (same business logic as before) ──────────────────────────────
  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!messageInput.trim() || sending) return
    setSending(true)
    try {
      await sendMessage(messageInput)
      setMessageInput('')
      inputRef.current?.focus()
    } finally { setSending(false) }
  }

  const handleConfirmEvent = async () => {
    if (!group || !group.event_id || !currentUserId) return
    const { error: eventError } = await supabase.from('events').update({ status: 'confirmed' }).eq('id', group.event_id)
    if (eventError) return
    const { error: groupError } = await supabase.from('groups')
      .update({ status: 'confirmed', confirmed_at: new Date().toISOString() }).eq('id', groupId)
    if (groupError) return
    await supabase.from('messages').insert({
      group_id: groupId, sender_id: null,
      content: `${group.sport} match confirmed`, type: 'system',
    })
    const { data: members } = await supabase.from('group_members').select('user_id').eq('group_id', groupId)
    if (members) {
      const notifications = members.map((m) => ({
        user_id: m.user_id, type: 'event_confirmed',
        title: 'Event Confirmed',
        body: `Your ${group.sport} match has been confirmed by the captain`,
        data: { group_id: groupId, event_id: group.event_id },
      }))
      await supabase.from('notifications').insert(notifications)
    }
    const { data: updated } = await supabase.from('groups')
      .select('id, sport, status, captain_id, event_id').eq('id', groupId).single()
    if (updated) setGroup(updated)
  }

  const handleProposeVenues = async () => {
    if (!group) return
    setLoadingVenues(true); setVenueOptions([])
    try {
      const { data: members } = await supabase.from('group_members').select('user_id').eq('group_id', groupId)
      const participantCount = members?.length || 0
      const { data: profile } = await supabase.from('profiles')
        .select('location_lat, location_lng').eq('id', currentUserId).single()
      const { data, error } = await supabase.functions.invoke('venue-suggestions', {
        body: {
          sport: group.sport,
          participant_count: participantCount,
          location: { lat: profile?.location_lat || 0, lng: profile?.location_lng || 0 },
        },
      })
      if (error || !data?.venues?.length) {
        setShowVenueForm(false); setShowFinalizeForm(true); return
      }
      setVenueOptions(data.venues)
    } catch {
      setShowVenueForm(false); setShowFinalizeForm(true)
    } finally {
      setLoadingVenues(false)
    }
  }

  const handleCreatePoll = async () => {
    if (!group || !currentUserId || venueOptions.length === 0) return
    const { data: pollData, error: pollError } = await supabase.from('venue_polls')
      .insert({ group_id: groupId, created_by: currentUserId, status: 'open' })
      .select().single()
    if (pollError) return
    const options = venueOptions.map((v) => ({
      poll_id: pollData.id, venue_name: v.name,
      price_est: v.price_est, distance_km: v.distance_km, votes: 0,
    }))
    await supabase.from('venue_poll_options').insert(options)
    await supabase.from('messages').insert({
      group_id: groupId, sender_id: null,
      content: 'Captain created a venue poll. Vote for your preferred location!',
      type: 'system',
    })
    setShowVenueForm(false); setVenueOptions([])
  }

  const handleFinalizeLocation = async () => {
    if (!group || !group.event_id || !finalizeForm.location || !finalizeForm.startTime) return
    await supabase.from('events').update({
      location_name: finalizeForm.location,
      start_time: finalizeForm.startTime,
    }).eq('id', group.event_id)
    const { data: members } = await supabase.from('group_members').select('user_id').eq('group_id', groupId)
    if (members) {
      const notifications = members.map((m) => ({
        user_id: m.user_id, type: 'venue_finalized', title: 'Venue Finalized',
        body: `Location: ${finalizeForm.location}, Time: ${new Date(finalizeForm.startTime).toLocaleString()}`,
        data: { group_id: groupId, event_id: group.event_id,
          location: finalizeForm.location, start_time: finalizeForm.startTime },
      }))
      await supabase.from('notifications').insert(notifications)
    }
    await supabase.from('messages').insert({
      group_id: groupId, sender_id: null,
      content: `Venue finalized: ${finalizeForm.location} at ${new Date(finalizeForm.startTime).toLocaleString()}`,
      type: 'system',
    })
    setFinalizeForm({ location: '', startTime: '' })
    setShowFinalizeForm(false); setShowVenueForm(false)
  }

  const handleReaction = async (messageId: string, emoji: string) => {
    if (!currentUserId) return
    const m = messages.find((x) => x.id === messageId)
    if (!m) return
    const reactions = { ...m.reactions }
    const userReactions = reactions[emoji] || []
    if (userReactions.includes(currentUserId)) {
      reactions[emoji] = userReactions.filter((id) => id !== currentUserId)
      if (reactions[emoji].length === 0) delete reactions[emoji]
    } else {
      reactions[emoji] = [...userReactions, currentUserId]
    }
    await supabase.from('messages').update({ reactions }).eq('id', messageId)
    setReactionPickerFor(null)
  }

  const handleLeaveGroup = async () => {
    if (leaving) return
    if (!window.confirm('Leave this group? You will be removed from the chat and any matched event.')) return
    const success = await leaveGroup(groupId)
    if (success) onLeave?.()
  }

  // ── Render ───────────────────────────────────────────────────────────────

  const theme = group ? themeForSport(group.sport) : null

  return (
    <div style={styles.container}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerMain}>
          {theme && (
            <div
              style={{
                ...styles.sportBadge,
                background: theme.bg,
                color: theme.text,
              }}
              aria-hidden="true"
            >
              <span style={{ fontSize: 22 }}>{theme.emoji}</span>
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={styles.title}>Group chat</h2>
            {group && (
              <div style={styles.subtitle}>
                <span style={{ textTransform: 'capitalize' }}>{group.sport}</span>
                <span style={styles.statusDivider}>·</span>
                <span style={{ ...styles.statusChip, ...statusChipStyle(group.status) }}>
                  {group.status}
                </span>
                {isCaptain && (
                  <>
                    <span style={styles.statusDivider}>·</span>
                    <span style={styles.captainBadge}>👑 Captain</span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {currentUserId && group && group.status !== 'cancelled' && group.status !== 'completed' && (
          <button
            type="button"
            onClick={handleLeaveGroup}
            disabled={leaving}
            style={styles.leaveBtn}
            title="Leave this group"
          >
            {leaving ? 'Leaving…' : 'Leave group'}
          </button>
        )}
      </header>

      {leaveError && <div style={styles.alertError} role="alert">{leaveError}</div>}

      {/* Captain controls */}
      {isCaptain && group && group.status === 'pending' && (
        <div style={styles.captainPanel}>
          <div style={styles.captainPanelHeader}>
            <span style={styles.captainEyebrow}>Captain actions</span>
            <p style={styles.captainHint}>Coordinate with the group — confirm, suggest venues, or finalize the time and place.</p>
          </div>
          <div style={styles.captainButtons}>
            <button onClick={handleConfirmEvent} style={styles.captainPrimary}>✓ Confirm event</button>
            <button
              onClick={() => {
                setShowVenueForm(!showVenueForm)
                if (!showVenueForm) handleProposeVenues()
              }}
              disabled={loadingVenues}
              style={styles.captainSecondary}
            >
              {loadingVenues ? 'Loading…' : '📍 Propose venues'}
            </button>
            <button onClick={() => setShowFinalizeForm((v) => !v)} style={styles.captainSecondary}>
              🕐 Finalize time & place
            </button>
          </div>

          {showVenueForm && venueOptions.length > 0 && (
            <div style={styles.captainSubcard}>
              <h4 style={styles.captainSubHeading}>Suggested venues</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                {venueOptions.map((v, idx) => (
                  <div key={idx} style={styles.venueSuggestion}>
                    <strong>{v.name}</strong>
                    <div style={styles.venueMeta}>
                      {v.price_est != null && <span>€{v.price_est.toFixed(2)}</span>}
                      {v.distance_km != null && <span>{v.distance_km.toFixed(1)} km</span>}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleCreatePoll} style={styles.captainPrimary}>Create poll</button>
                <button
                  onClick={() => { setShowVenueForm(false); setVenueOptions([]) }}
                  style={styles.captainSecondary}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {showFinalizeForm && (
            <div style={styles.captainSubcard}>
              <h4 style={styles.captainSubHeading}>Finalize location & time</h4>
              <label style={styles.formLabel} htmlFor="final-loc">Location</label>
              <input
                id="final-loc"
                type="text"
                value={finalizeForm.location}
                onChange={(e) => setFinalizeForm({ ...finalizeForm, location: e.target.value })}
                placeholder="Venue name or address"
              />
              <label style={styles.formLabel} htmlFor="final-time">Start time</label>
              <input
                id="final-time"
                type="datetime-local"
                value={finalizeForm.startTime}
                onChange={(e) => setFinalizeForm({ ...finalizeForm, startTime: e.target.value })}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button onClick={handleFinalizeLocation} style={styles.captainPrimary}>Finalize</button>
                <button
                  onClick={() => { setShowFinalizeForm(false); setFinalizeForm({ location: '', startTime: '' }) }}
                  style={styles.captainSecondary}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} style={styles.messages}>
        {loading && (
          <div style={styles.centeredState}>
            <span className="s2m-spin" style={styles.smallSpinner} aria-hidden="true" />
            Loading messages…
          </div>
        )}
        {error && <div style={styles.alertError}>{error}</div>}

        <VenuePoll groupId={groupId} />

        {!loading && !error && messages.length === 0 && (
          <div style={styles.emptyChat}>
            <div style={styles.emptyChatIcon} aria-hidden="true">💬</div>
            <h3 style={styles.emptyChatTitle}>Start the conversation</h3>
            <p style={styles.emptyChatText}>Drop a hello and coordinate the details with your group.</p>
          </div>
        )}

        {!loading && !error && messages.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {messages.map((message) => renderMessage(message, {
              currentUserId,
              profiles,
              onReactionTarget: setReactionPickerFor,
              pickerFor: reactionPickerFor,
              onReact: handleReaction,
            }))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Composer */}
      <form onSubmit={handleSendMessage} style={styles.composer}>
        <textarea
          ref={inputRef}
          value={messageInput}
          onChange={(e) => setMessageInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSendMessage()
            }
          }}
          placeholder="Write a message…   (Enter to send, Shift+Enter for newline)"
          rows={1}
          disabled={sending}
          style={styles.composerInput}
        />
        <button
          type="submit"
          disabled={sending || !messageInput.trim()}
          style={{
            ...styles.sendBtn,
            ...(sending || !messageInput.trim() ? styles.sendBtnDisabled : {}),
          }}
          aria-label="Send message"
        >
          <SendIcon />
        </button>
      </form>
    </div>
  )
}

// ────────────── Message renderer ──────────────

function renderMessage(
  message: Message,
  ctx: {
    currentUserId: string | null
    profiles: Record<string, Profile>
    onReactionTarget: (id: string | null) => void
    pickerFor: string | null
    onReact: (messageId: string, emoji: string) => void
  },
) {
  const isSystem = message.type === 'system'
  const isOwn = message.sender_id === ctx.currentUserId
  const sender = message.sender_id ? ctx.profiles[message.sender_id] : null

  if (isSystem) {
    return (
      <div key={message.id} style={styles.systemMsg} className="s2m-fade-in">
        <span>{message.content}</span>
      </div>
    )
  }

  return (
    <div
      key={message.id}
      style={{
        ...styles.msgRow,
        justifyContent: isOwn ? 'flex-end' : 'flex-start',
      }}
      className="s2m-fade-in"
    >
      {!isOwn && (
        <div style={styles.avatar} aria-hidden="true">
          {sender?.avatar_url ? (
            <img src={sender.avatar_url} alt="" style={styles.avatarImg} />
          ) : (
            <span>{(sender?.display_name ?? '?').slice(0, 1).toUpperCase()}</span>
          )}
        </div>
      )}

      <div style={{ maxWidth: '72%' }}>
        {!isOwn && sender && (
          <div style={styles.senderName}>{sender.display_name}</div>
        )}
        <div
          style={{
            ...styles.bubble,
            ...(isOwn ? styles.bubbleOwn : styles.bubbleOther),
          }}
        >
          {message.content}
        </div>

        <div style={{ ...styles.reactions, justifyContent: isOwn ? 'flex-end' : 'flex-start' }}>
          {Object.entries(message.reactions).map(([emoji, userIds]) => {
            const reacted = ctx.currentUserId ? userIds.includes(ctx.currentUserId) : false
            return (
              <button
                key={emoji}
                type="button"
                onClick={() => ctx.onReact(message.id, emoji)}
                style={{
                  ...styles.reactionChip,
                  ...(reacted ? styles.reactionChipActive : {}),
                }}
              >
                <span>{emoji}</span>
                <span style={{ fontSize: 11, fontWeight: 700 }}>{userIds.length}</span>
              </button>
            )
          })}

          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                ctx.onReactionTarget(ctx.pickerFor === message.id ? null : message.id)
              }}
              style={styles.addReactionBtn}
              aria-label="Add reaction"
            >
              +
            </button>
            {ctx.pickerFor === message.id && (
              <div style={styles.reactionPicker} onClick={(e) => e.stopPropagation()}>
                {EMOJI_REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => ctx.onReact(message.id, emoji)}
                    style={styles.reactionPickerBtn}
                    aria-label={`React ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div
          style={{
            ...styles.timestamp,
            textAlign: isOwn ? 'right' : 'left',
          }}
        >
          {new Date(message.created_at).toLocaleTimeString([], {
            hour: '2-digit', minute: '2-digit',
          })}
        </div>
      </div>
    </div>
  )
}

function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 12L20 4L14 20L11 13L4 12Z"
        stroke="currentColor" strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  )
}

function statusChipStyle(status: Group['status']): React.CSSProperties {
  switch (status) {
    case 'confirmed': return { background: colors.success[100], color: colors.success[700] }
    case 'cancelled': return { background: colors.danger[100], color: colors.danger[700] }
    case 'completed': return { background: colors.ink[100], color: colors.ink[700] }
    case 'pending':
    default: return { background: colors.warning[100], color: colors.warning[900] }
  }
}

// ────────────── Styles ──────────────

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    minHeight: 0,
    background: colors.surface,
    border: `1px solid ${colors.ink[200]}`,
    borderRadius: radii.lg,
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '14px 18px',
    borderBottom: `1px solid ${colors.ink[200]}`,
    background: gradients.cardGloss,
  },
  headerMain: { display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 },
  sportBadge: {
    width: 44, height: 44,
    borderRadius: radii.md,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  },
  title: { margin: 0, fontSize: 15, fontWeight: 700 },
  subtitle: {
    display: 'flex', alignItems: 'center', gap: 6,
    marginTop: 2, color: colors.ink[600], fontSize: 12,
  },
  statusDivider: { color: colors.ink[300] },
  statusChip: {
    padding: '2px 8px', borderRadius: 999,
    fontSize: 10, fontWeight: 700, letterSpacing: '0.05em',
    textTransform: 'uppercase',
  },
  captainBadge: {
    padding: '2px 8px',
    background: `linear-gradient(135deg, ${colors.warning[100]} 0%, ${colors.warning[300]} 100%)`,
    color: colors.warning[900],
    borderRadius: 999, fontSize: 11, fontWeight: 700,
  },
  leaveBtn: {
    padding: '8px 14px',
    background: colors.surface,
    color: colors.danger[700],
    border: `1px solid ${colors.danger[300]}`,
    borderRadius: radii.sm, fontSize: 13, fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },

  captainPanel: {
    padding: 14,
    background: `linear-gradient(135deg, ${colors.warning[100]} 0%, #fff 100%)`,
    borderBottom: `1px solid ${colors.warning[300]}`,
  },
  captainPanelHeader: { marginBottom: 10 },
  captainEyebrow: {
    display: 'inline-block',
    fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
    textTransform: 'uppercase', color: colors.warning[900],
  },
  captainHint: { margin: '4px 0 0', fontSize: 12, color: colors.ink[700] },
  captainButtons: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  captainPrimary: {
    padding: '8px 14px',
    background: colors.success[500], color: '#fff', border: 'none',
    borderRadius: radii.sm, fontSize: 13, fontWeight: 600, cursor: 'pointer',
    boxShadow: shadows.xs,
  },
  captainSecondary: {
    padding: '8px 14px',
    background: colors.surface, color: colors.ink[800],
    border: `1px solid ${colors.ink[200]}`,
    borderRadius: radii.sm, fontSize: 13, fontWeight: 600, cursor: 'pointer',
  },
  captainSubcard: {
    marginTop: 12, padding: 12,
    background: colors.surface,
    border: `1px solid ${colors.ink[200]}`,
    borderRadius: radii.sm,
  },
  captainSubHeading: { margin: '0 0 10px', fontSize: 13, fontWeight: 700 },
  venueSuggestion: {
    padding: '10px 12px',
    background: colors.ink[50],
    border: `1px solid ${colors.ink[200]}`,
    borderRadius: radii.sm,
    fontSize: 13,
  },
  venueMeta: { display: 'flex', gap: 10, marginTop: 4, fontSize: 12, color: colors.ink[600] },
  formLabel: {
    display: 'block',
    fontSize: 12,
    fontWeight: 600,
    color: colors.ink[700],
    marginTop: 10, marginBottom: 4,
  },

  alertError: {
    margin: '10px 14px',
    padding: '10px 12px',
    background: colors.danger[100],
    border: `1px solid ${colors.danger[300]}`,
    color: colors.danger[700],
    borderRadius: radii.sm, fontSize: 13,
  },

  messages: {
    flex: 1,
    overflowY: 'auto',
    padding: '18px 18px 14px',
    background: `
      radial-gradient(600px 200px at 100% 0%, rgba(79,99,255,0.04), transparent 70%),
      ${colors.ink[50]}
    `,
  },
  centeredState: {
    textAlign: 'center',
    color: colors.ink[500],
    padding: 24,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
  },
  smallSpinner: {
    width: 14, height: 14, borderRadius: '50%',
    border: `2px solid ${colors.ink[200]}`, borderTopColor: colors.brand[500],
    display: 'inline-block',
  },

  emptyChat: {
    textAlign: 'center',
    padding: '48px 16px',
    color: colors.ink[500],
  },
  emptyChatIcon: { fontSize: 44, marginBottom: 12 },
  emptyChatTitle: { margin: 0, color: colors.ink[700] },
  emptyChatText: { margin: '6px 0 0', fontSize: 14 },

  systemMsg: {
    textAlign: 'center',
    color: colors.ink[500],
    fontSize: 12,
    padding: '6px 12px',
    margin: '8px auto',
    maxWidth: '70%',
    background: 'rgba(255,255,255,0.75)',
    border: `1px solid ${colors.ink[200]}`,
    borderRadius: 999,
  },

  msgRow: {
    display: 'flex',
    gap: 8,
    margin: '6px 0',
    alignItems: 'flex-end',
  },
  avatar: {
    width: 32, height: 32,
    borderRadius: '50%',
    background: gradients.brandStrong,
    color: '#fff',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 13, fontWeight: 700,
    flexShrink: 0,
    overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%', objectFit: 'cover' },

  senderName: {
    fontSize: 11, fontWeight: 600,
    color: colors.ink[500],
    margin: '0 10px 4px',
  },
  bubble: {
    padding: '10px 14px',
    borderRadius: 18,
    fontSize: 14,
    lineHeight: 1.4,
    wordWrap: 'break-word',
    whiteSpace: 'pre-wrap',
  },
  bubbleOwn: {
    background: gradients.brandStrong,
    color: '#fff',
    borderBottomRightRadius: 6,
    boxShadow: shadows.xs,
  },
  bubbleOther: {
    background: colors.surface,
    color: colors.ink[900],
    border: `1px solid ${colors.ink[200]}`,
    borderBottomLeftRadius: 6,
  },
  reactions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 4,
    margin: '6px 8px 0',
  },
  reactionChip: {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '3px 8px',
    background: colors.surface,
    border: `1px solid ${colors.ink[200]}`,
    borderRadius: 999,
    cursor: 'pointer',
    fontSize: 13,
    transition: 'all 0.15s ease',
  },
  reactionChipActive: {
    background: colors.brand[50],
    borderColor: colors.brand[400],
    color: colors.brand[700],
  },
  addReactionBtn: {
    width: 24, height: 24,
    background: colors.surface,
    border: `1px dashed ${colors.ink[300]}`,
    borderRadius: '50%',
    color: colors.ink[500],
    fontSize: 14,
    cursor: 'pointer',
  },
  reactionPicker: {
    position: 'absolute',
    bottom: 'calc(100% + 6px)',
    left: 0,
    display: 'flex',
    gap: 2,
    padding: 4,
    background: colors.surface,
    border: `1px solid ${colors.ink[200]}`,
    borderRadius: 999,
    boxShadow: shadows.lg,
    zIndex: 10,
  },
  reactionPickerBtn: {
    width: 28, height: 28,
    background: 'transparent',
    border: 'none',
    borderRadius: '50%',
    fontSize: 18,
    cursor: 'pointer',
    transition: 'transform 0.15s ease',
  },

  timestamp: {
    fontSize: 10,
    color: colors.ink[400],
    margin: '4px 10px 0',
  },

  composer: {
    display: 'flex',
    gap: 8,
    padding: 14,
    borderTop: `1px solid ${colors.ink[200]}`,
    background: colors.surface,
    alignItems: 'flex-end',
  },
  composerInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 140,
    padding: '10px 14px',
    borderRadius: radii.md,
    fontFamily: 'inherit',
    fontSize: 14,
    lineHeight: 1.4,
    resize: 'none',
  },
  sendBtn: {
    width: 44, height: 44,
    borderRadius: radii.md,
    background: gradients.brandStrong,
    color: '#fff',
    border: 'none',
    display: 'inline-flex',
    alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer',
    boxShadow: shadows.md,
    transition: 'transform 0.15s ease, opacity 0.15s ease',
  },
  sendBtnDisabled: {
    background: colors.ink[300],
    color: colors.ink[500],
    cursor: 'not-allowed',
    boxShadow: 'none',
  },
}
