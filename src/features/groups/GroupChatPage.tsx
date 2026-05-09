// Feature: show-up-2-move
// Dedicated page that renders the group chat room for a given group id.
// Requirements: 9.1, 9.2, 9.6 (makes group chat reachable and primary)

import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import ChatRoom from '../chat/ChatRoom'

interface GroupSummary {
  id: string
  sport: string
  status: string
  event_id: string | null
}

/**
 * GroupChatPage
 *
 * Route: /groups/:groupId
 *
 * Guards access: first verifies the caller is a member of the group.
 * Non-members see a "not a member" notice rather than an empty chat.
 */
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
      if (!groupId) {
        setError('Group id is missing')
        setLoading(false)
        return
      }

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        navigate('/login')
        return
      }

      // Membership check first — RLS on `groups` also blocks non-members,
      // but checking explicitly lets us show a helpful message.
      const { data: membership } = await supabase
        .from('group_members')
        .select('user_id')
        .eq('group_id', groupId)
        .eq('user_id', user.id)
        .maybeSingle()

      if (cancelled) return

      if (!membership) {
        setIsMember(false)
        setLoading(false)
        return
      }
      setIsMember(true)

      const { data: groupRow, error: groupErr } = await supabase
        .from('groups')
        .select('id, sport, status, event_id')
        .eq('id', groupId)
        .maybeSingle()

      if (cancelled) return

      if (groupErr || !groupRow) {
        setError('Could not load this group.')
      } else {
        setGroup(groupRow as GroupSummary)
      }
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
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
        <h1 style={styles.notMemberTitle}>You're not in this group</h1>
        <p style={styles.notMemberText}>
          Only members of a matched group can access its chat.
        </p>
        <button style={styles.linkBtn} onClick={() => navigate('/groups')}>
          ← Back to your groups
        </button>
      </div>
    )
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.header}>
          <button style={styles.backBtn} onClick={() => navigate('/groups')}>
            ← All groups
          </button>
          {group?.event_id && (
            <button
              style={styles.linkBtn}
              onClick={() => navigate(`/events/${group.event_id}`)}
            >
              View event →
            </button>
          )}
        </div>

        <div style={styles.chatWrapper}>
          {groupId && (
            <ChatRoom
              groupId={groupId}
              onLeave={() => navigate('/groups')}
            />
          )}
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#f0f4f8',
    padding: '2rem 1rem',
    display: 'flex',
    justifyContent: 'center',
  },
  card: {
    background: '#fff',
    borderRadius: 12,
    boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
    padding: '1.5rem',
    width: '100%',
    maxWidth: 900,
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1rem',
  },
  backBtn: {
    background: 'transparent',
    border: '1px solid #cbd5e0',
    borderRadius: 6,
    color: '#2d3748',
    cursor: 'pointer',
    fontWeight: 600,
    padding: '0.5rem 1rem',
  },
  linkBtn: {
    background: 'transparent',
    border: 'none',
    color: '#2563eb',
    cursor: 'pointer',
    fontWeight: 600,
    padding: '0.5rem 0.75rem',
  },
  chatWrapper: { height: '70vh', minHeight: 500 },
  centered: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2rem',
    gap: '1rem',
    textAlign: 'center',
  },
  notMemberTitle: { margin: 0, color: '#2d3748' },
  notMemberText: { color: '#4a5568', marginTop: 0 },
  errorBox: {
    background: '#fff5f5',
    border: '1px solid #fed7d7',
    borderRadius: 6,
    color: '#c53030',
    padding: '0.75rem 1rem',
  },
}
