// Feature: show-up-2-move
// Lists the groups the current user belongs to, with a link into each chat.
// Requirements: 9.1, 9.2 (makes group chat reachable from the UI)

import { useNavigate } from 'react-router-dom'
import { useMyGroups, MyGroup } from './useMyGroups'

/**
 * MyGroupsPage
 *
 * Entry point for all groups the user belongs to. Each row links to
 * `/groups/:groupId` where the full chat room is rendered.
 */
export default function MyGroupsPage() {
  const navigate = useNavigate()
  const { groups, loading, error, refresh } = useMyGroups()

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <header style={styles.header}>
          <h1 style={styles.title}>Your Groups</h1>
          <button
            type="button"
            onClick={() => refresh()}
            style={styles.refreshBtn}
            disabled={loading}
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </header>

        {error && <div style={styles.errorBox}>{error}</div>}

        {!loading && !error && groups.length === 0 && (
          <div style={styles.emptyState}>
            <div style={styles.emptyIcon}>👥</div>
            <h2 style={styles.emptyTitle}>No groups yet</h2>
            <p style={styles.emptyText}>
              When you declare availability or join a matched event, a group
              chat will show up here so you can coordinate with your
              teammates.
            </p>
            <button style={styles.ctaBtn} onClick={() => navigate('/feed')}>
              Browse the feed
            </button>
          </div>
        )}

        {groups.length > 0 && (
          <ul style={styles.list}>
            {groups.map((g) => (
              <GroupListItem
                key={g.id}
                group={g}
                onOpen={() => navigate(`/groups/${g.id}`)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function GroupListItem({
  group,
  onOpen,
}: {
  group: MyGroup
  onOpen: () => void
}) {
  const sportLabel = group.sport.charAt(0).toUpperCase() + group.sport.slice(1)
  const eventTime = group.event_start_time
    ? new Date(group.event_start_time).toLocaleString()
    : null

  return (
    <li>
      <button type="button" onClick={onOpen} style={styles.listItem}>
        <div
          style={{
            ...styles.sportBadge,
            backgroundColor: sportColor(group.sport),
          }}
        >
          {sportLabel}
        </div>

        <div style={styles.listMain}>
          <div style={styles.listRow}>
            <span style={styles.listTitle}>
              {group.event_title ?? `${sportLabel} group`}
            </span>
            <span style={{ ...styles.statusChip, ...statusChipStyle(group.status) }}>
              {group.status}
            </span>
          </div>
          <div style={styles.listMeta}>
            {group.member_count} member{group.member_count === 1 ? '' : 's'}
            {eventTime ? ` • ${eventTime}` : ''}
            {group.event_location_name ? ` • ${group.event_location_name}` : ''}
          </div>
          {group.last_message_preview ? (
            <div style={styles.listPreview}>
              {truncate(group.last_message_preview, 120)}
            </div>
          ) : (
            <div style={styles.listPreviewMuted}>
              No messages yet — start the conversation.
            </div>
          )}
        </div>

        <div style={styles.chevron}>›</div>
      </button>
    </li>
  )
}

function sportColor(sport: string): string {
  const map: Record<string, string> = {
    football: '#28a745',
    basketball: '#fd7e14',
    tennis: '#ffc107',
    volleyball: '#17a2b8',
  }
  return map[sport.toLowerCase()] ?? '#007bff'
}

function statusChipStyle(status: MyGroup['status']): React.CSSProperties {
  switch (status) {
    case 'confirmed':
      return { background: '#d4edda', color: '#155724' }
    case 'cancelled':
      return { background: '#f8d7da', color: '#721c24' }
    case 'completed':
      return { background: '#e2e3e5', color: '#495057' }
    case 'pending':
    default:
      return { background: '#fff3cd', color: '#856404' }
  }
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    backgroundColor: '#f0f4f8',
    padding: '2rem 1rem',
    display: 'flex',
    justifyContent: 'center',
  },
  card: {
    background: '#fff',
    borderRadius: 12,
    boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
    padding: '2rem',
    width: '100%',
    maxWidth: 860,
    alignSelf: 'flex-start',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1.5rem',
  },
  title: { margin: 0, fontSize: '2rem', fontWeight: 700, color: '#1a202c' },
  refreshBtn: {
    padding: '0.5rem 1rem',
    background: '#fff',
    border: '1px solid #cbd5e0',
    borderRadius: 6,
    color: '#2d3748',
    cursor: 'pointer',
    fontWeight: 600,
  },
  errorBox: {
    background: '#fff5f5',
    border: '1px solid #fed7d7',
    borderRadius: 6,
    color: '#c53030',
    padding: '0.75rem 1rem',
    marginBottom: '1rem',
  },
  emptyState: {
    textAlign: 'center',
    padding: '3rem 1rem',
    color: '#4a5568',
  },
  emptyIcon: { fontSize: '3rem', marginBottom: '1rem' },
  emptyTitle: { margin: '0 0 0.5rem', color: '#2d3748' },
  emptyText: { margin: '0 auto 1.5rem', maxWidth: 480 },
  ctaBtn: {
    padding: '0.75rem 1.5rem',
    background: '#2563eb',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    fontWeight: 600,
    cursor: 'pointer',
  },
  list: { listStyle: 'none', padding: 0, margin: 0 },
  listItem: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    padding: '1rem',
    marginBottom: '0.75rem',
    background: '#f7fafc',
    border: '1px solid #e2e8f0',
    borderRadius: 8,
    cursor: 'pointer',
    textAlign: 'left',
  },
  sportBadge: {
    color: '#fff',
    borderRadius: 6,
    padding: '0.5rem 0.75rem',
    fontSize: '0.8rem',
    fontWeight: 700,
    minWidth: 90,
    textAlign: 'center',
  },
  listMain: { flex: 1, minWidth: 0 },
  listRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '0.5rem',
    marginBottom: '0.25rem',
  },
  listTitle: { fontWeight: 600, color: '#1a202c', fontSize: '1rem' },
  statusChip: {
    padding: '0.15rem 0.5rem',
    borderRadius: 12,
    fontSize: '0.75rem',
    fontWeight: 600,
    textTransform: 'capitalize',
  },
  listMeta: { color: '#718096', fontSize: '0.85rem', marginBottom: '0.25rem' },
  listPreview: {
    color: '#2d3748',
    fontSize: '0.9rem',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  listPreviewMuted: {
    color: '#a0aec0',
    fontStyle: 'italic',
    fontSize: '0.9rem',
  },
  chevron: { color: '#a0aec0', fontSize: '2rem', lineHeight: 1 },
}
