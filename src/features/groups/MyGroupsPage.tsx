// Feature: show-up-2-move
// Lists the groups the current user belongs to.

import { useNavigate } from 'react-router-dom'
import { useMyGroups, MyGroup } from './useMyGroups'
import { colors, radii, shadows, themeForSport } from '../../lib/theme'

export default function MyGroupsPage() {
  const navigate = useNavigate()
  const { groups, loading, error, refresh } = useMyGroups()

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <span style={styles.eyebrow}>Groups</span>
          <h1 style={styles.title}>Your group chats</h1>
          <p style={styles.subtitle}>
            Every event you join has its own chat with teammates, venue polls, and coordination tools.
          </p>
        </div>
        <button onClick={() => refresh()} disabled={loading} style={styles.refreshBtn}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>

      {error && <div style={styles.errorBox} role="alert">{error}</div>}

      {!loading && !error && groups.length === 0 && (
        <div style={styles.empty}>
          <div style={styles.emptyIcon} aria-hidden="true">💬</div>
          <h2 style={styles.emptyTitle}>No groups yet</h2>
          <p style={styles.emptyText}>
            Join an event from the feed or declare availability, and your group chats will show up here.
          </p>
          <button style={styles.cta} onClick={() => navigate('/feed')}>
            Browse the feed
          </button>
        </div>
      )}

      {groups.length > 0 && (
        <ul style={styles.list}>
          {groups.map((g) => (
            <GroupListItem key={g.id} group={g} onOpen={() => navigate(`/groups/${g.id}`)} />
          ))}
        </ul>
      )}
    </div>
  )
}

function GroupListItem({ group, onOpen }: { group: MyGroup; onOpen: () => void }) {
  const theme = themeForSport(group.sport)
  const sportLabel = group.sport.charAt(0).toUpperCase() + group.sport.slice(1)
  const eventTime = group.event_start_time
    ? new Date(group.event_start_time).toLocaleString([], {
        weekday: 'short', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : null
  const lastAt = group.last_message_at ? new Date(group.last_message_at) : null
  const lastStamp = lastAt ? formatRelative(lastAt) : null

  return (
    <li>
      <button type="button" onClick={onOpen} style={styles.listItem} className="s2m-fade-in">
        <div
          style={{
            ...styles.sportBadge,
            background: theme.bg,
            color: theme.text,
            boxShadow: `0 6px 14px -4px ${theme.glow}`,
          }}
        >
          <span style={styles.sportEmoji} aria-hidden="true">{theme.emoji}</span>
          <span>{sportLabel}</span>
        </div>

        <div style={styles.main}>
          <div style={styles.row}>
            <h3 style={styles.itemTitle}>{group.event_title ?? `${sportLabel} group`}</h3>
            <span style={{ ...styles.chip, ...statusChipStyle(group.status) }}>
              {group.status}
            </span>
          </div>
          <div style={styles.meta}>
            <span>
              <strong>{group.member_count}</strong> member{group.member_count === 1 ? '' : 's'}
            </span>
            {eventTime && <span>· {eventTime}</span>}
            {group.event_location_name && <span>· {group.event_location_name}</span>}
          </div>
          {group.last_message_preview ? (
            <div style={styles.preview}>
              <span style={styles.previewText}>{truncate(group.last_message_preview, 110)}</span>
              {lastStamp && <span style={styles.previewStamp}>{lastStamp}</span>}
            </div>
          ) : (
            <div style={styles.previewMuted}>No messages yet — say hi.</div>
          )}
        </div>

        <div style={styles.chevron} aria-hidden="true">›</div>
      </button>
    </li>
  )
}

function statusChipStyle(status: MyGroup['status']): React.CSSProperties {
  switch (status) {
    case 'confirmed': return { background: colors.success[100], color: colors.success[700] }
    case 'cancelled': return { background: colors.danger[100], color: colors.danger[700] }
    case 'completed': return { background: colors.ink[100], color: colors.ink[700] }
    case 'pending':
    default: return { background: colors.warning[100], color: colors.warning[900] }
  }
}

function truncate(s: string, n: number) { return s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…` }

function formatRelative(date: Date) {
  const diffMs = Date.now() - date.getTime()
  const mins = Math.floor(diffMs / 60_000)
  const hours = Math.floor(diffMs / 3_600_000)
  const days = Math.floor(diffMs / 86_400_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m`
  if (hours < 24) return `${hours}h`
  if (days < 7) return `${days}d`
  return date.toLocaleDateString()
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    background: colors.surface,
    border: `1px solid ${colors.ink[200]}`,
    borderRadius: radii.xl,
    padding: '28px 24px',
    boxShadow: shadows.sm,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
    marginBottom: 24,
  },
  eyebrow: {
    display: 'inline-block',
    fontSize: 11, fontWeight: 700,
    letterSpacing: '0.1em', textTransform: 'uppercase',
    color: colors.brand[600],
    marginBottom: 4,
  },
  title: { margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em' },
  subtitle: { margin: '6px 0 0', color: colors.ink[600], maxWidth: 620 },
  refreshBtn: {
    padding: '8px 14px',
    background: colors.surface,
    border: `1px solid ${colors.ink[200]}`,
    borderRadius: radii.sm,
    color: colors.ink[700],
    fontSize: 13, fontWeight: 600, cursor: 'pointer',
  },

  errorBox: {
    padding: '12px 16px',
    background: colors.danger[100],
    border: `1px solid ${colors.danger[300]}`,
    color: colors.danger[700],
    borderRadius: radii.sm,
    fontSize: 13,
    marginBottom: 16,
  },

  empty: {
    textAlign: 'center',
    padding: '64px 24px',
    border: `1px dashed ${colors.ink[300]}`,
    borderRadius: radii.lg,
    background: colors.ink[50],
  },
  emptyIcon: { fontSize: 52, marginBottom: 16 },
  emptyTitle: { margin: 0, fontSize: 20, fontWeight: 700 },
  emptyText: { margin: '8px auto 20px', color: colors.ink[600], maxWidth: 440 },
  cta: {
    padding: '10px 20px',
    background: `linear-gradient(135deg, ${colors.brand[500]} 0%, ${colors.accent[500]} 100%)`,
    color: '#fff', border: 'none',
    borderRadius: radii.sm, fontSize: 14, fontWeight: 600,
    cursor: 'pointer', boxShadow: shadows.md,
  },

  list: { padding: 0, margin: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 },
  listItem: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    padding: 16,
    background: colors.surface,
    border: `1px solid ${colors.ink[200]}`,
    borderRadius: radii.md,
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease',
  },
  sportBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 14px',
    borderRadius: radii.sm,
    fontSize: 12,
    fontWeight: 700,
    minWidth: 130,
    justifyContent: 'center',
  },
  sportEmoji: { fontSize: 18 },
  main: { flex: 1, minWidth: 0 },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  itemTitle: { margin: 0, fontSize: 15, fontWeight: 700, color: colors.ink[900] },
  chip: {
    padding: '2px 10px',
    borderRadius: 999,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
  },
  meta: {
    color: colors.ink[500],
    fontSize: 12,
    display: 'flex',
    gap: 6,
    flexWrap: 'wrap',
    marginBottom: 6,
  },
  preview: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    color: colors.ink[700],
    fontSize: 13,
  },
  previewText: {
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  previewStamp: {
    marginLeft: 'auto',
    color: colors.ink[400],
    fontSize: 11,
    whiteSpace: 'nowrap',
  },
  previewMuted: { color: colors.ink[400], fontStyle: 'italic', fontSize: 13 },
  chevron: { color: colors.ink[300], fontSize: 28, lineHeight: 1 },
}
