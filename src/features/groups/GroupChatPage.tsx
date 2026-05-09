// Feature: show-up-2-move
// Dedicated page that renders the group chat for a given group id.

import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import ChatRoom from '../chat/ChatRoom'
import { colors, radii, shadows, themeForSport } from '../../lib/theme'

interface GroupSummary {
  id: string
  sport: string
  status: string
  event_id: string | null
}

export default function GroupChatPage() {
  const { groupId } = useParams<{ groupId: string }>()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [group, setGroup] = useState<GroupSummary | null>(null)
  const [isMember, setIsMember] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!groupId) { setError('Group id is missing'); setLoading(false); return }
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { navigate('/login'); return }

      const { data: membership } = await supabase
        .from('group_members')
        .select('user_id')
        .eq('group_id', groupId)
        .eq('user_id', user.id)
        .maybeSingle()
      if (cancelled) return

      if (!membership) { setIsMember(false); setLoading(false); return }
      setIsMember(true)

      const { data: groupRow, error: groupErr } = await supabase
        .from('groups')
        .select('id, sport, status, event_id')
        .eq('id', groupId)
        .maybeSingle()
      if (cancelled) return

      if (groupErr || !groupRow) setError('Could not load this group.')
      else setGroup(groupRow as GroupSummary)
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [groupId, navigate])

  if (loading) {
    return <div style={styles.centered}>Loading group…</div>
  }
  if (error) {
    return (
      <div style={styles.centered}>
        <div style={styles.errorBox}>{error}</div>
        <button style={styles.linkBtn} onClick={() => navigate('/groups')}>
          ← Back to your groups
        </button>
      </div>
    )
  }
  if (!isMember) {
    return (
      <div style={styles.centered}>
        <div style={styles.notMemberIcon} aria-hidden="true">🔒</div>
        <h1 style={styles.notMemberTitle}>You're not in this group</h1>
        <p style={styles.notMemberText}>Only members of a matched group can access its chat.</p>
        <button style={styles.primaryBtn} onClick={() => navigate('/groups')}>
          ← Back to your groups
        </button>
      </div>
    )
  }

  const theme = group ? themeForSport(group.sport) : null

  return (
    <div style={styles.page} className="s2m-fade-in">
      <header style={styles.header}>
        <button style={styles.backBtn} onClick={() => navigate('/groups')} aria-label="Back to groups">
          <span aria-hidden="true">←</span> Groups
        </button>
        <div style={styles.headerInfo}>
          {group && theme && (
            <span style={{ ...styles.sportTag, background: theme.bg, color: theme.text }}>
              <span aria-hidden="true">{theme.emoji}</span>
              {group.sport.charAt(0).toUpperCase() + group.sport.slice(1)}
            </span>
          )}
        </div>
        {group?.event_id && (
          <button style={styles.linkBtn} onClick={() => navigate(`/events/${group.event_id}`)}>
            View event →
          </button>
        )}
      </header>

      <div style={styles.chatWrapper}>
        {groupId && <ChatRoom groupId={groupId} onLeave={() => navigate('/groups')} />}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    background: colors.surface,
    border: `1px solid ${colors.ink[200]}`,
    borderRadius: radii.xl,
    boxShadow: shadows.sm,
    padding: 18,
    display: 'flex',
    flexDirection: 'column',
    maxWidth: 960,
    margin: '0 auto',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '0 6px 14px',
    marginBottom: 12,
    borderBottom: `1px solid ${colors.ink[200]}`,
  },
  backBtn: {
    padding: '8px 12px',
    background: colors.surface,
    border: `1px solid ${colors.ink[200]}`,
    borderRadius: radii.sm,
    color: colors.ink[800],
    fontSize: 13, fontWeight: 600, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: 6,
  },
  headerInfo: { flex: 1, display: 'flex', alignItems: 'center', gap: 8 },
  sportTag: {
    padding: '6px 12px',
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
  },
  linkBtn: {
    padding: '8px 12px',
    background: 'transparent',
    color: colors.brand[600],
    border: 'none',
    fontSize: 13, fontWeight: 600, cursor: 'pointer',
  },
  chatWrapper: { height: '72vh', minHeight: 520 },

  centered: {
    minHeight: '70vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
    textAlign: 'center',
  },
  notMemberIcon: { fontSize: 48 },
  notMemberTitle: { margin: 0, fontSize: 22 },
  notMemberText: { color: colors.ink[600], margin: 0, maxWidth: 420 },
  errorBox: {
    padding: '12px 16px',
    background: colors.danger[100],
    border: `1px solid ${colors.danger[300]}`,
    color: colors.danger[700],
    borderRadius: radii.sm,
    fontSize: 13,
  },
  primaryBtn: {
    padding: '10px 18px',
    background: `linear-gradient(135deg, ${colors.brand[500]} 0%, ${colors.accent[500]} 100%)`,
    color: '#fff',
    border: 'none',
    borderRadius: radii.sm,
    fontSize: 14, fontWeight: 600,
    cursor: 'pointer', boxShadow: shadows.md,
    marginTop: 8,
  },
}
