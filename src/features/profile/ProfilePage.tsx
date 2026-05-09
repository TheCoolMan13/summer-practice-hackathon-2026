import { ChangeEvent, FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { uploadAvatar } from '../../lib/storage'
import SportSuggestions from './SportSuggestions'
import { colors, gradients, radii, shadows, themeForSport } from '../../lib/theme'

const SPORTS = ['football', 'basketball', 'tennis', 'volleyball'] as const
type Sport = (typeof SPORTS)[number]
const SKILL_LEVELS = ['beginner', 'intermediate', 'advanced'] as const
type SkillLevel = (typeof SKILL_LEVELS)[number]
const BIO_MAX = 280

interface UserSport { sport: Sport; skill_level: SkillLevel }
interface ProfileFormState {
  display_name: string
  bio: string
  location_city: string
  avatar_url: string
  location_lat: number | null
  location_lng: number | null
}
type GeoState = 'idle' | 'notice' | 'requesting' | 'granted' | 'denied' | 'error'

export default function ProfilePage() {
  const [userId, setUserId] = useState<string | null>(null)
  const [username, setUsername] = useState<string>('')
  const [form, setForm] = useState<ProfileFormState>({
    display_name: '', bio: '', location_city: '',
    avatar_url: '', location_lat: null, location_lng: null,
  })
  const [userSports, setUserSports] = useState<UserSport[]>([])
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const [geoState, setGeoState] = useState<GeoState>('idle')
  const [geoError, setGeoError] = useState<string | null>(null)

  useEffect(() => {
    async function loadProfile() {
      setLoading(true); setErrorMessage(null)
      try {
        const { data: { user }, error: userError } = await supabase.auth.getUser()
        if (userError || !user) {
          setErrorMessage('Unable to load user session. Please log in again.')
          setLoading(false); return
        }
        setUserId(user.id)
        const metaUsername = (user.user_metadata?.username as string | undefined)?.trim() ?? ''
        const emailLocalPart = (user.email ?? '').split('@')[0] ?? ''
        setUsername(metaUsername || emailLocalPart || `user_${user.id.slice(0, 8)}`)
        const [profileResult, sportsResult] = await Promise.all([
          supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
          supabase.from('user_sports').select('*').eq('user_id', user.id),
        ])
        if (profileResult.error) throw profileResult.error
        if (sportsResult.error) throw sportsResult.error
        if (profileResult.data) {
          const p = profileResult.data
          if (p.username) setUsername(p.username)
          setForm({
            display_name: p.display_name ?? '', bio: p.bio ?? '',
            location_city: p.location_city ?? '', avatar_url: p.avatar_url ?? '',
            location_lat: typeof p.location_lat === 'number' ? p.location_lat : null,
            location_lng: typeof p.location_lng === 'number' ? p.location_lng : null,
          })
          if (typeof p.location_lat === 'number' && typeof p.location_lng === 'number') {
            setGeoState('granted')
          }
        }
        if (sportsResult.data) {
          setUserSports(sportsResult.data.map((s: { sport: Sport; skill_level: SkillLevel }) => ({
            sport: s.sport, skill_level: s.skill_level,
          })))
        }
      } catch (err: unknown) {
        setErrorMessage(err instanceof Error ? err.message : 'Failed to load profile.')
      } finally { setLoading(false) }
    }
    loadProfile()
  }, [])

  function handleFieldChange(e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  function handleAvatarChange(e: ChangeEvent<HTMLInputElement>) {
    setAvatarError(null)
    const file = e.target.files?.[0]
    if (!file) return
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setAvatarError('Only JPEG and PNG files are supported.'); return
    }
    if (file.size > 5 * 1024 * 1024) {
      setAvatarError('File size must not exceed 5 MB.'); return
    }
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  function addSport(sport: Sport) {
    if (userSports.some((s) => s.sport === sport)) return
    setUserSports((prev) => [...prev, { sport, skill_level: 'beginner' }])
  }
  function removeSport(sport: Sport) {
    setUserSports((prev) => prev.filter((s) => s.sport !== sport))
  }
  function updateSkillLevel(sport: Sport, skill_level: SkillLevel) {
    setUserSports((prev) => prev.map((s) => s.sport === sport ? { ...s, skill_level } : s))
  }

  const handleAISportsConfirm = useCallback((confirmedSports: string[]) => {
    setUserSports((prev) => {
      const existing = new Set(prev.map((s) => s.sport))
      const next = confirmedSports
        .filter((s) => !existing.has(s as Sport) && (SPORTS as readonly string[]).includes(s))
        .map((s) => ({ sport: s as Sport, skill_level: 'beginner' as SkillLevel }))
      return [...prev, ...next]
    })
  }, [])

  function openLocationNotice() { setGeoError(null); setGeoState('notice') }
  function cancelLocationNotice() { setGeoState((prev) => (prev === 'notice' ? 'idle' : prev)) }
  function requestBrowserGeolocation() {
    setGeoError(null)
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeoState('error'); setGeoError('Geolocation is not supported by your browser.'); return
    }
    setGeoState('requesting')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords
        setForm((prev) => ({ ...prev, location_lat: latitude, location_lng: longitude }))
        setGeoState('granted')
      },
      (err) => {
        if (err.code === 1) {
          setGeoState('denied')
          setGeoError('Location permission denied. You can still enter a city manually.')
        } else {
          setGeoState('error')
          setGeoError('Unable to determine your location right now.')
        }
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60 * 1000 },
    )
  }
  function clearStoredLocation() {
    setForm((prev) => ({ ...prev, location_lat: null, location_lng: null }))
    setGeoState('idle'); setGeoError(null)
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setSuccessMessage(null); setErrorMessage(null)
    if (!form.display_name.trim()) return setErrorMessage('Display name is required.')
    if (userSports.length === 0) return setErrorMessage('Please add at least one sport preference.')
    if (!userId) return setErrorMessage('User session not found. Please log in again.')
    setSaving(true)
    try {
      let avatarUrl = form.avatar_url
      if (avatarFile) avatarUrl = await uploadAvatar(userId, avatarFile)
      const { error: profileError } = await supabase.from('profiles').upsert({
        id: userId,
        username: username || `user_${userId.slice(0, 8)}`,
        display_name: form.display_name.trim(),
        bio: form.bio.trim() || null,
        avatar_url: avatarUrl || null,
        location_city: form.location_city.trim() || null,
        location_lat: form.location_lat,
        location_lng: form.location_lng,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' })
      if (profileError) throw profileError
      if (userSports.length > 0) {
        const { error } = await supabase.from('user_sports').upsert(
          userSports.map((s) => ({ user_id: userId, sport: s.sport, skill_level: s.skill_level })),
          { onConflict: 'user_id,sport' },
        )
        if (error) throw error
      }
      const selected = userSports.map((s) => s.sport)
      const removed = SPORTS.filter((s) => !selected.includes(s))
      if (removed.length > 0) {
        const { error } = await supabase.from('user_sports')
          .delete().eq('user_id', userId).in('sport', removed)
        if (error) throw error
      }
      if (avatarFile) {
        setForm((prev) => ({ ...prev, avatar_url: avatarUrl }))
        setAvatarFile(null)
      }
      setSuccessMessage('Profile saved.')
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to save profile.')
    } finally { setSaving(false) }
  }

  if (loading) return <div style={styles.loading}>Loading profile…</div>

  const availableToAdd = SPORTS.filter((s) => !userSports.some((us) => us.sport === s))
  const displayAvatar = avatarPreview ?? (form.avatar_url || null)
  const firstInitial = (form.display_name || username || 'You').slice(0, 1).toUpperCase()

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={styles.avatarBlock}>
          {displayAvatar ? (
            <img src={displayAvatar} alt="Profile avatar" style={styles.avatar} />
          ) : (
            <div style={styles.avatarFallback} aria-hidden="true">{firstInitial}</div>
          )}
          <button
            type="button"
            style={styles.avatarEdit}
            onClick={() => fileInputRef.current?.click()}
            aria-label="Upload new avatar"
          >
            ✎
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png"
            style={{ display: 'none' }}
            onChange={handleAvatarChange}
          />
        </div>
        <div style={{ minWidth: 0 }}>
          <span style={styles.eyebrow}>Your profile</span>
          <h1 style={styles.title}>
            {form.display_name || 'New player'}
          </h1>
          <p style={styles.username}>@{username}</p>
          {avatarError && <p style={styles.inlineError}>{avatarError}</p>}
        </div>
      </header>

      {successMessage && <div style={styles.alertSuccess} role="status">{successMessage}</div>}
      {errorMessage && (
        <div style={styles.alertError} role="alert">
          <span>{errorMessage}</span>
          <button type="button" onClick={() => setErrorMessage(null)} style={styles.dismissBtn}>
            Dismiss
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate style={styles.form}>
        {/* Basic info */}
        <section style={styles.card}>
          <h2 style={styles.cardTitle}>Basic info</h2>
          <label htmlFor="display_name" style={styles.label}>
            Display name <span style={styles.required}>*</span>
          </label>
          <input
            id="display_name" name="display_name" type="text" required
            value={form.display_name} onChange={handleFieldChange}
            disabled={saving} placeholder="Your name"
          />
          <label htmlFor="bio" style={{ ...styles.label, marginTop: 16 }}>
            Bio{' '}
            <span style={styles.charCount}>{form.bio.length}/{BIO_MAX}</span>
          </label>
          <textarea
            id="bio" name="bio" rows={4} maxLength={BIO_MAX}
            value={form.bio}
            onChange={(e) => {
              if (e.target.value.length <= BIO_MAX) handleFieldChange(e)
            }}
            disabled={saving}
            placeholder="Tell others about yourself and your sports interests…"
          />
          <p style={styles.hint}>Optional · max {BIO_MAX} characters</p>

          {userId && (
            <div style={{ marginTop: 16 }}>
              <SportSuggestions
                userId={userId}
                bio={form.bio}
                onConfirm={handleAISportsConfirm}
              />
            </div>
          )}
        </section>

        {/* Location */}
        <section style={styles.card}>
          <h2 style={styles.cardTitle}>Location</h2>
          <p style={styles.hint}>
            We match you with players nearby. Sharing precise coordinates is optional.
          </p>

          {geoState === 'granted' && form.location_lat !== null && form.location_lng !== null && (
            <div style={styles.locationPanel} role="status">
              <div style={styles.locationOn}>
                <span style={styles.locationDot} className="s2m-pulse" />
                <strong>Precise location is on</strong>
              </div>
              <p style={styles.locationCoords}>
                {form.location_lat.toFixed(4)}, {form.location_lng.toFixed(4)}
              </p>
              <div style={styles.locationActions}>
                <button type="button" onClick={requestBrowserGeolocation} disabled={saving}
                        style={styles.secondaryBtn}>Update</button>
                <button type="button" onClick={clearStoredLocation} disabled={saving}
                        style={styles.dangerBtn}>Turn off</button>
              </div>
            </div>
          )}

          {geoState === 'notice' && (
            <div style={styles.privacyCard} role="dialog">
              <h3 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700 }}>Privacy notice</h3>
              <ul style={styles.privacyList}>
                <li>Coordinates are stored only on your profile.</li>
                <li>Used to match you with players within a 10 km radius.</li>
                <li>Other users see your city, not your exact coordinates.</li>
                <li>You can turn it off anytime.</li>
              </ul>
              <div style={styles.locationActions}>
                <button type="button" onClick={requestBrowserGeolocation} disabled={saving} style={styles.primaryBtn}>
                  Share my location
                </button>
                <button type="button" onClick={cancelLocationNotice} disabled={saving} style={styles.secondaryBtn}>
                  Not now
                </button>
              </div>
            </div>
          )}

          {(geoState === 'idle' || geoState === 'denied' || geoState === 'error') && (
            <div style={{ marginTop: 10 }}>
              <button type="button" onClick={openLocationNotice} disabled={saving} style={styles.secondaryBtn}>
                📍 Use my current location
              </button>
              {geoError && <p style={styles.inlineError}>{geoError}</p>}
            </div>
          )}

          {geoState === 'requesting' && (
            <p style={styles.hint} role="status">Requesting your location…</p>
          )}

          <label htmlFor="location_city" style={{ ...styles.label, marginTop: 16 }}>City or area</label>
          <input
            id="location_city" name="location_city" type="text"
            value={form.location_city} onChange={handleFieldChange}
            disabled={saving} placeholder="e.g. Berlin"
          />
          <p style={styles.hint}>
            {form.location_lat === null
              ? 'Used for matching when precise location is off.'
              : 'Shown on your profile to other players.'}
          </p>
        </section>

        {/* Sports */}
        <section style={styles.card}>
          <div style={styles.cardHeaderRow}>
            <h2 style={styles.cardTitle}>Sport preferences <span style={styles.required}>*</span></h2>
            <span style={styles.countPill}>{userSports.length} chosen</span>
          </div>

          {userSports.length === 0 && (
            <p style={styles.emptyInline}>No sports added yet. Pick at least one below.</p>
          )}

          <ul style={styles.sportList}>
            {userSports.map(({ sport, skill_level }) => {
              const theme = themeForSport(sport)
              return (
                <li key={sport} style={{ ...styles.sportItem, background: theme.bg, color: theme.text }}>
                  <span style={{ fontSize: 22 }} aria-hidden="true">{theme.emoji}</span>
                  <span style={{ fontWeight: 700, flex: 1 }}>
                    {sport.charAt(0).toUpperCase() + sport.slice(1)}
                  </span>
                  <select
                    value={skill_level}
                    onChange={(e) => updateSkillLevel(sport, e.target.value as SkillLevel)}
                    disabled={saving}
                    style={styles.skillSelect}
                    aria-label={`Skill level for ${sport}`}
                  >
                    {SKILL_LEVELS.map((l) => (
                      <option key={l} value={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</option>
                    ))}
                  </select>
                  <button
                    type="button" onClick={() => removeSport(sport)} disabled={saving}
                    style={styles.removeBtn} aria-label={`Remove ${sport}`}
                  >
                    ✕
                  </button>
                </li>
              )
            })}
          </ul>

          {availableToAdd.length > 0 && (
            <div style={styles.addRow}>
              <span style={styles.addRowLabel}>Add a sport:</span>
              {availableToAdd.map((sport) => {
                const theme = themeForSport(sport)
                return (
                  <button
                    key={sport} type="button" onClick={() => addSport(sport)} disabled={saving}
                    style={{ ...styles.addChip, borderColor: theme.solid, color: theme.text }}
                  >
                    <span aria-hidden="true">{theme.emoji}</span>
                    {sport.charAt(0).toUpperCase() + sport.slice(1)}
                  </button>
                )
              })}
            </div>
          )}
        </section>

        <div style={styles.footerActions}>
          <button
            type="submit" disabled={saving}
            style={{ ...styles.primaryBtnLarge, ...(saving ? styles.busy : {}) }}
          >
            {saving ? 'Saving…' : 'Save profile'}
          </button>
        </div>
      </form>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  loading: { textAlign: 'center', padding: 48, color: colors.ink[500] },
  page: { maxWidth: 780, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 },

  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 20,
    padding: 24,
    background: gradients.cardGloss,
    border: `1px solid ${colors.ink[200]}`,
    borderRadius: radii.xl,
    boxShadow: shadows.md,
  },
  avatarBlock: { position: 'relative', flexShrink: 0 },
  avatar: {
    width: 96, height: 96, borderRadius: '50%',
    objectFit: 'cover',
    border: `4px solid ${colors.surface}`,
    boxShadow: shadows.md,
  },
  avatarFallback: {
    width: 96, height: 96, borderRadius: '50%',
    background: gradients.brandStrong, color: '#fff',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 36, fontWeight: 800,
    border: `4px solid ${colors.surface}`,
    boxShadow: shadows.md,
  },
  avatarEdit: {
    position: 'absolute',
    right: -4, bottom: -4,
    width: 32, height: 32, borderRadius: '50%',
    background: colors.brand[500], color: '#fff',
    border: `2px solid ${colors.surface}`,
    fontSize: 14,
    cursor: 'pointer',
    boxShadow: shadows.sm,
  },

  eyebrow: {
    display: 'inline-block',
    fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
    textTransform: 'uppercase', color: colors.brand[600],
  },
  title: {
    margin: '4px 0 0', fontSize: 28, fontWeight: 800,
    letterSpacing: '-0.02em',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  },
  username: { margin: '4px 0 0', color: colors.ink[500], fontSize: 14 },
  inlineError: { color: colors.danger[700], fontSize: 13, margin: '6px 0 0' },

  alertSuccess: {
    padding: '12px 16px',
    background: colors.success[100], color: colors.success[900],
    border: `1px solid ${colors.success[300]}`,
    borderRadius: radii.md, fontSize: 14,
  },
  alertError: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    gap: 12,
    padding: '12px 16px',
    background: colors.danger[100], color: colors.danger[900],
    border: `1px solid ${colors.danger[300]}`,
    borderRadius: radii.md, fontSize: 14,
  },
  dismissBtn: {
    background: 'transparent',
    border: `1px solid ${colors.danger[300]}`,
    borderRadius: radii.sm,
    color: colors.danger[700],
    fontSize: 12, fontWeight: 600, padding: '4px 10px', cursor: 'pointer',
  },

  form: { display: 'flex', flexDirection: 'column', gap: 18 },

  card: {
    padding: 24,
    background: colors.surface,
    border: `1px solid ${colors.ink[200]}`,
    borderRadius: radii.xl,
    boxShadow: shadows.sm,
  },
  cardTitle: { margin: '0 0 12px', fontSize: 16, fontWeight: 700 },
  cardHeaderRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 16, gap: 8,
  },
  countPill: {
    padding: '4px 10px',
    background: colors.brand[50],
    color: colors.brand[700],
    borderRadius: 999, fontSize: 11, fontWeight: 700,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
  },

  label: { display: 'block', fontSize: 13, fontWeight: 600, color: colors.ink[700], marginBottom: 6 },
  required: { color: colors.danger[500] },
  hint: { color: colors.ink[500], fontSize: 12, margin: '6px 0 0' },
  charCount: { color: colors.ink[500], fontSize: 12, fontWeight: 400, marginLeft: 6 },
  emptyInline: { color: colors.ink[500], fontStyle: 'italic', margin: '4px 0 12px' },

  primaryBtn: {
    padding: '10px 16px',
    background: gradients.brandStrong,
    color: '#fff', border: 'none',
    borderRadius: radii.sm,
    fontSize: 14, fontWeight: 600, cursor: 'pointer',
    boxShadow: shadows.sm,
  },
  primaryBtnLarge: {
    padding: '12px 28px',
    background: gradients.brandStrong,
    color: '#fff', border: 'none',
    borderRadius: radii.sm,
    fontSize: 15, fontWeight: 700, cursor: 'pointer',
    boxShadow: shadows.md,
  },
  secondaryBtn: {
    padding: '10px 16px',
    background: colors.surface,
    color: colors.ink[800],
    border: `1px solid ${colors.ink[200]}`,
    borderRadius: radii.sm,
    fontSize: 14, fontWeight: 600, cursor: 'pointer',
  },
  dangerBtn: {
    padding: '10px 16px',
    background: colors.surface,
    color: colors.danger[700],
    border: `1px solid ${colors.danger[300]}`,
    borderRadius: radii.sm,
    fontSize: 14, fontWeight: 600, cursor: 'pointer',
  },
  busy: { opacity: 0.85, cursor: 'wait' },

  locationPanel: {
    marginTop: 12,
    padding: 14,
    background: colors.success[100],
    border: `1px solid ${colors.success[300]}`,
    borderRadius: radii.md,
  },
  locationOn: { display: 'flex', alignItems: 'center', gap: 8, color: colors.success[900] },
  locationDot: {
    width: 10, height: 10, borderRadius: '50%',
    background: colors.success[500], display: 'inline-block',
  },
  locationCoords: { margin: '6px 0 10px', fontFamily: 'ui-monospace, monospace', fontSize: 13 },
  locationActions: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 },

  privacyCard: {
    marginTop: 12,
    padding: 16,
    background: colors.brand[50],
    border: `1px solid ${colors.brand[200]}`,
    borderRadius: radii.md,
    color: colors.brand[900],
  },
  privacyList: {
    margin: '0 0 10px', paddingLeft: 18,
    listStyle: 'disc',
    color: colors.ink[700], fontSize: 13, lineHeight: 1.5,
  },

  sportList: {
    listStyle: 'none', padding: 0, margin: 0,
    display: 'flex', flexDirection: 'column', gap: 8,
  },
  sportItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 14px',
    borderRadius: radii.md,
    border: `1px solid ${colors.ink[200]}`,
  },
  skillSelect: {
    width: 'auto',
    minWidth: 140,
    padding: '6px 28px 6px 10px',
    background: colors.surface,
    border: `1px solid ${colors.ink[200]}`,
    borderRadius: radii.sm,
    color: colors.ink[800],
    fontSize: 13,
  },
  removeBtn: {
    width: 32, height: 32,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: colors.surface,
    border: `1px solid ${colors.ink[200]}`,
    borderRadius: '50%',
    color: colors.ink[500], cursor: 'pointer',
    transition: 'color 0.15s, background 0.15s',
  },
  addRow: {
    display: 'flex', flexWrap: 'wrap', alignItems: 'center',
    gap: 8,
    marginTop: 14,
  },
  addRowLabel: {
    fontSize: 12, fontWeight: 600,
    color: colors.ink[500],
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  addChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 14px',
    background: colors.surface,
    border: '1px solid',
    borderRadius: 999,
    fontSize: 13, fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },

  footerActions: {
    display: 'flex', justifyContent: 'flex-end', marginTop: 8,
  },
}
