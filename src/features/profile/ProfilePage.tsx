import { ChangeEvent, FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { uploadAvatar } from '../../lib/storage'
import SportSuggestions from './SportSuggestions'

// ─── Constants ────────────────────────────────────────────────────────────────

const SPORTS = ['football', 'basketball', 'tennis', 'volleyball'] as const
type Sport = (typeof SPORTS)[number]

const SKILL_LEVELS = ['beginner', 'intermediate', 'advanced'] as const
type SkillLevel = (typeof SKILL_LEVELS)[number]

const BIO_MAX = 280

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserSport {
  sport: Sport
  skill_level: SkillLevel
}

interface ProfileFormState {
  display_name: string
  bio: string
  location_city: string
  avatar_url: string
  location_lat: number | null
  location_lng: number | null
}

// Geolocation permission UI state.
// 'idle'        — user has not interacted with location sharing
// 'notice'      — privacy notice shown, awaiting user's choice (Req 13.4)
// 'requesting'  — browser geolocation API call in-flight
// 'granted'     — coordinates captured and stored in form state
// 'denied'      — user denied the request; fall back to manual city entry (Req 13.3)
// 'error'       — geolocation is unavailable or timed out
type GeoState = 'idle' | 'notice' | 'requesting' | 'granted' | 'denied' | 'error'

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * ProfilePage
 *
 * Allows authenticated users to view and edit their profile.
 *
 * Requirements covered:
 *  - 3.1: Display name + at least one sport required to save
 *  - 3.2: Optional bio (max 280 chars), avatar URL, skill levels, location city
 *  - 3.3: Profile update completes within 2 seconds under normal load
 *  - 3.5: Avatar upload accepts JPEG/PNG up to 5 MB (delegated to uploadAvatar helper)
 */
export default function ProfilePage() {
  const [userId, setUserId] = useState<string | null>(null)
  // Username is NOT NULL on the profiles table. We don't expose it as an
  // editable field on this page, but we need to carry it so upserts don't
  // fail with 400 when no profile row exists yet (new users). It's captured
  // at registration in auth user_metadata, with the email local-part as a
  // last-resort fallback.
  const [username, setUsername] = useState<string>('')

  // Form fields
  const [form, setForm] = useState<ProfileFormState>({
    display_name: '',
    bio: '',
    location_city: '',
    avatar_url: '',
    location_lat: null,
    location_lng: null,
  })

  // Sport preferences
  const [userSports, setUserSports] = useState<UserSport[]>([])

  // Avatar file selection (not yet uploaded)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // UI state
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [avatarError, setAvatarError] = useState<string | null>(null)

  // Location / geolocation state (Req 13.2, 13.3, 13.4)
  const [geoState, setGeoState] = useState<GeoState>('idle')
  const [geoError, setGeoError] = useState<string | null>(null)

  // ── Load data on mount ──────────────────────────────────────────────────────

  useEffect(() => {
    async function loadProfile() {
      setLoading(true)
      setErrorMessage(null)

      try {
        // Get current authenticated user (Req 3.1)
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser()

        if (userError || !user) {
          setErrorMessage('Unable to load user session. Please log in again.')
          setLoading(false)
          return
        }

        setUserId(user.id)

        // Derive a username: stored row first, then signup metadata, then
        // email local-part. Needed because profiles.username is NOT NULL
        // and this page is allowed to create the row on first save.
        const metadataUsername =
          (user.user_metadata?.username as string | undefined)?.trim() ?? ''
        const emailLocalPart = (user.email ?? '').split('@')[0] ?? ''
        setUsername(metadataUsername || emailLocalPart || `user_${user.id.slice(0, 8)}`)

        // Load profile and user_sports in parallel.
        // maybeSingle() returns data:null (no error) when the row doesn't
        // exist yet — avoids the ugly HTTP 406 in the console that .single()
        // produces for new users who haven't saved a profile yet.
        const [profileResult, sportsResult] = await Promise.all([
          supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
          supabase.from('user_sports').select('*').eq('user_id', user.id),
        ])

        if (profileResult.error) {
          throw profileResult.error
        }

        if (sportsResult.error) {
          throw sportsResult.error
        }

        if (profileResult.data) {
          const p = profileResult.data
          // Prefer the stored username over anything we derived above.
          if (p.username) setUsername(p.username)
          setForm({
            display_name: p.display_name ?? '',
            bio: p.bio ?? '',
            location_city: p.location_city ?? '',
            avatar_url: p.avatar_url ?? '',
            location_lat: typeof p.location_lat === 'number' ? p.location_lat : null,
            location_lng: typeof p.location_lng === 'number' ? p.location_lng : null,
          })
          // If coordinates were previously stored, surface that in the UI
          if (typeof p.location_lat === 'number' && typeof p.location_lng === 'number') {
            setGeoState('granted')
          }
        }

        if (sportsResult.data) {
          setUserSports(
            sportsResult.data.map((s: { sport: Sport; skill_level: SkillLevel }) => ({
              sport: s.sport,
              skill_level: s.skill_level,
            })),
          )
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to load profile.'
        setErrorMessage(message)
      } finally {
        setLoading(false)
      }
    }

    loadProfile()
  }, [])

  // ── Form field handlers ─────────────────────────────────────────────────────

  function handleFieldChange(
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  // ── Avatar handlers ─────────────────────────────────────────────────────────

  function handleAvatarChange(e: ChangeEvent<HTMLInputElement>) {
    setAvatarError(null)
    const file = e.target.files?.[0]
    if (!file) return

    // Client-side validation (mirrors uploadAvatar helper — Req 3.5)
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setAvatarError('Only JPEG and PNG files are supported.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setAvatarError('File size must not exceed 5 MB.')
      return
    }

    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  // ── Sport preference handlers ───────────────────────────────────────────────

  function addSport(sport: Sport) {
    if (userSports.some((s) => s.sport === sport)) return
    setUserSports((prev) => [...prev, { sport, skill_level: 'beginner' }])
  }

  function removeSport(sport: Sport) {
    setUserSports((prev) => prev.filter((s) => s.sport !== sport))
  }

  function updateSkillLevel(sport: Sport, skill_level: SkillLevel) {
    setUserSports((prev) =>
      prev.map((s) => (s.sport === sport ? { ...s, skill_level } : s)),
    )
  }

  /**
   * handleAISportsConfirm
   *
   * Called by SportSuggestions after the user explicitly confirms AI-suggested
   * sports. Merges the confirmed sports into the existing userSports state
   * WITHOUT overwriting manually set sports (Req 3.4).
   *
   * Sports that are already in userSports are skipped; new ones are added with
   * a default skill level of 'beginner'.
   */
  const handleAISportsConfirm = useCallback((confirmedSports: string[]) => {
    setUserSports((prev) => {
      const existingSports = new Set(prev.map((s) => s.sport))
      const newSports = confirmedSports
        .filter((s) => !existingSports.has(s as Sport) && (SPORTS as readonly string[]).includes(s))
        .map((s) => ({ sport: s as Sport, skill_level: 'beginner' as SkillLevel }))
      return [...prev, ...newSports]
    })
  }, [])

  // ── Geolocation handlers (Req 13.2, 13.3, 13.4) ─────────────────────────────

  /**
   * Show the privacy notice before requesting browser geolocation.
   * The notice explains exactly how the coordinates will be used so the
   * user can make an informed decision (Req 13.4).
   */
  function openLocationNotice() {
    setGeoError(null)
    setGeoState('notice')
  }

  function cancelLocationNotice() {
    setGeoState((prev) => (prev === 'notice' ? 'idle' : prev))
  }

  /**
   * Request the user's current coordinates via navigator.geolocation.
   * Only called after the user has accepted the in-app privacy notice
   * (Req 13.4). If the browser permission is denied or geolocation is
   * unavailable, the user can still fall back to manual city entry
   * (Req 13.3).
   */
  function requestBrowserGeolocation() {
    setGeoError(null)

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeoState('error')
      setGeoError('Geolocation is not supported by your browser. You can still enter a city manually below.')
      return
    }

    setGeoState('requesting')

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords
        setForm((prev) => ({
          ...prev,
          location_lat: latitude,
          location_lng: longitude,
        }))
        setGeoState('granted')
      },
      (err) => {
        // err.code 1 = PERMISSION_DENIED, 2 = POSITION_UNAVAILABLE, 3 = TIMEOUT
        if (err.code === 1) {
          setGeoState('denied')
          setGeoError(
            'Location permission was denied. You can still enter a city manually below for matching.',
          )
        } else {
          setGeoState('error')
          setGeoError(
            'Unable to determine your location right now. You can still enter a city manually below.',
          )
        }
      },
      {
        enableHighAccuracy: false,
        timeout: 10_000,
        maximumAge: 5 * 60 * 1000, // accept a cached fix up to 5 min old
      },
    )
  }

  /**
   * Clear the stored coordinates. The DB trigger (profiles_location_sync)
   * will reset the PostGIS geography column to NULL on save, removing the
   * user from proximity-based matching (Req 13.3).
   */
  function clearStoredLocation() {
    setForm((prev) => ({ ...prev, location_lat: null, location_lng: null }))
    setGeoState('idle')
    setGeoError(null)
  }

  // ── Save handler ────────────────────────────────────────────────────────────

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSuccessMessage(null)
    setErrorMessage(null)

    // Req 3.1: display name + at least one sport required
    if (!form.display_name.trim()) {
      setErrorMessage('Display name is required.')
      return
    }
    if (userSports.length === 0) {
      setErrorMessage('Please add at least one sport preference.')
      return
    }

    if (!userId) {
      setErrorMessage('User session not found. Please log in again.')
      return
    }

    setSaving(true)

    try {
      let avatarUrl = form.avatar_url

      // Upload avatar if a new file was selected (Req 3.5)
      if (avatarFile) {
        avatarUrl = await uploadAvatar(userId, avatarFile)
      }

      // UPDATE profiles (Req 3.1, 3.2, 3.3, 13.2, 13.3)
      // location_lat / location_lng are written as numeric columns; a
      // BEFORE INSERT/UPDATE trigger (profiles_sync_location) converts
      // them into the PostGIS `location` geography column so proximity
      // queries (ST_DWithin) stay consistent.
      //
      // We include `username` on every upsert because profiles.username is
      // NOT NULL; when this is an INSERT (new user), Postgres requires it.
      // When it's an UPDATE, writing the existing value is a no-op.
      const { error: profileError } = await supabase.from('profiles').upsert(
        {
          id: userId,
          username: username || `user_${userId.slice(0, 8)}`,
          display_name: form.display_name.trim(),
          bio: form.bio.trim() || null,
          avatar_url: avatarUrl || null,
          location_city: form.location_city.trim() || null,
          location_lat: form.location_lat,
          location_lng: form.location_lng,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' },
      )

      if (profileError) throw profileError

      // UPSERT user_sports for each selected sport
      if (userSports.length > 0) {
        const { error: upsertError } = await supabase.from('user_sports').upsert(
          userSports.map((s) => ({
            user_id: userId,
            sport: s.sport,
            skill_level: s.skill_level,
          })),
          { onConflict: 'user_id,sport' },
        )
        if (upsertError) throw upsertError
      }

      // DELETE user_sports for removed sports
      const selectedSports = userSports.map((s) => s.sport)
      const removedSports = SPORTS.filter((s) => !selectedSports.includes(s))
      if (removedSports.length > 0) {
        const { error: deleteError } = await supabase
          .from('user_sports')
          .delete()
          .eq('user_id', userId)
          .in('sport', removedSports)
        if (deleteError) throw deleteError
      }

      // Update local avatar URL state after successful upload
      if (avatarFile) {
        setForm((prev) => ({ ...prev, avatar_url: avatarUrl }))
        setAvatarFile(null)
      }

      setSuccessMessage('Profile saved successfully!')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save profile.'
      setErrorMessage(message)
    } finally {
      setSaving(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={styles.loadingContainer} aria-live="polite" aria-label="Loading profile">
        Loading profile…
      </div>
    )
  }

  const availableSportsToAdd = SPORTS.filter(
    (s) => !userSports.some((us) => us.sport === s),
  )

  const displayAvatar = avatarPreview ?? (form.avatar_url || null)

  return (
    <main style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Edit Profile</h1>

        {/* Success message */}
        {successMessage && (
          <p style={styles.successMessage} role="status" aria-live="polite">
            {successMessage}
          </p>
        )}

        {/* Error message with retry */}
        {errorMessage && (
          <div style={styles.errorBox} role="alert">
            <p style={styles.errorText}>{errorMessage}</p>
            <button
              type="button"
              style={styles.retryButton}
              onClick={() => {
                setErrorMessage(null)
                setSuccessMessage(null)
              }}
            >
              Dismiss
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate style={styles.form}>
          {/* ── Avatar ── */}
          <section style={styles.section} aria-labelledby="avatar-heading">
            <h2 id="avatar-heading" style={styles.sectionTitle}>
              Profile Picture
            </h2>

            <div style={styles.avatarRow}>
              {displayAvatar ? (
                <img
                  src={displayAvatar}
                  alt="Profile avatar"
                  style={styles.avatarPreview}
                />
              ) : (
                <div style={styles.avatarPlaceholder} aria-hidden="true">
                  👤
                </div>
              )}

              <div style={styles.avatarControls}>
                <button
                  type="button"
                  style={styles.secondaryButton}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {displayAvatar ? 'Change photo' : 'Upload photo'}
                </button>
                <p style={styles.hint}>JPEG or PNG, max 5 MB</p>
                {avatarError && (
                  <p style={styles.fieldError} role="alert">
                    {avatarError}
                  </p>
                )}
              </div>
            </div>

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png"
              style={{ display: 'none' }}
              aria-label="Upload profile picture"
              onChange={handleAvatarChange}
            />
          </section>

          {/* ── Display name ── */}
          <section style={styles.section} aria-labelledby="basic-heading">
            <h2 id="basic-heading" style={styles.sectionTitle}>
              Basic Info
            </h2>

            <label htmlFor="display_name" style={styles.label}>
              Display name <span style={styles.required}>*</span>
            </label>
            <input
              id="display_name"
              name="display_name"
              type="text"
              required
              value={form.display_name}
              onChange={handleFieldChange}
              disabled={saving}
              style={styles.input}
              placeholder="Your name"
              aria-required="true"
            />

            {/* ── Bio ── */}
            <label htmlFor="bio" style={styles.label}>
              Bio{' '}
              <span style={styles.charCount}>
                {form.bio.length}/{BIO_MAX}
              </span>
            </label>
            <textarea
              id="bio"
              name="bio"
              value={form.bio}
              onChange={(e) => {
                if (e.target.value.length <= BIO_MAX) handleFieldChange(e)
              }}
              disabled={saving}
              style={styles.textarea}
              placeholder="Tell others about yourself and your sports interests…"
              maxLength={BIO_MAX}
              rows={4}
              aria-describedby="bio-hint"
            />
            <p id="bio-hint" style={styles.hint}>
              Optional · max {BIO_MAX} characters
            </p>

            {/* ── AI sport suggestions (Req 4.1–4.3) ── */}
            {userId && (
              <SportSuggestions
                userId={userId}
                bio={form.bio}
                onConfirm={handleAISportsConfirm}
              />
            )}
          </section>

          {/* ── Location (Req 13.2, 13.3, 13.4) ── */}
          <section style={styles.section} aria-labelledby="location-heading">
            <h2 id="location-heading" style={styles.sectionTitle}>
              Location
            </h2>

            <p style={styles.hint}>
              Location helps us match you with nearby players and suggest
              relevant events. Sharing precise coordinates is optional — you
              can enter a city manually instead.
            </p>

            {/* Current state pill */}
            {geoState === 'granted' &&
              form.location_lat !== null &&
              form.location_lng !== null && (
                <div style={styles.locationGranted} role="status">
                  <div>
                    <strong>Precise location on</strong>
                    <p style={styles.coordText}>
                      {form.location_lat.toFixed(4)}, {form.location_lng.toFixed(4)}
                    </p>
                  </div>
                  <div style={styles.locationButtonRow}>
                    <button
                      type="button"
                      onClick={requestBrowserGeolocation}
                      disabled={saving}
                      style={styles.secondaryButton}
                    >
                      Update
                    </button>
                    <button
                      type="button"
                      onClick={clearStoredLocation}
                      disabled={saving}
                      style={styles.dangerButton}
                      aria-label="Stop sharing precise location"
                    >
                      Turn off
                    </button>
                  </div>
                </div>
              )}

            {/* Privacy notice shown before we call navigator.geolocation (Req 13.4) */}
            {geoState === 'notice' && (
              <div style={styles.privacyNotice} role="dialog" aria-labelledby="privacy-notice-heading">
                <h3 id="privacy-notice-heading" style={styles.privacyNoticeTitle}>
                  Privacy notice
                </h3>
                <ul style={styles.privacyList}>
                  <li>Your coordinates are stored only on your profile.</li>
                  <li>We use them to match you with players within a 10 km radius.</li>
                  <li>Other users never see your exact coordinates — only your city.</li>
                  <li>You can turn location off at any time from this screen.</li>
                </ul>
                <div style={styles.locationButtonRow}>
                  <button
                    type="button"
                    onClick={requestBrowserGeolocation}
                    disabled={saving}
                    style={styles.primaryInlineButton}
                  >
                    I understand, share my location
                  </button>
                  <button
                    type="button"
                    onClick={cancelLocationNotice}
                    disabled={saving}
                    style={styles.secondaryButton}
                  >
                    Not now
                  </button>
                </div>
              </div>
            )}

            {/* Idle / denied / error: show CTA to request location */}
            {(geoState === 'idle' ||
              geoState === 'denied' ||
              geoState === 'error') && (
              <div style={styles.locationCta}>
                <button
                  type="button"
                  onClick={openLocationNotice}
                  disabled={saving}
                  style={styles.secondaryButton}
                >
                  📍 Use my current location
                </button>
                {geoError && (
                  <p style={styles.fieldError} role="alert">
                    {geoError}
                  </p>
                )}
              </div>
            )}

            {/* Requesting state */}
            {geoState === 'requesting' && (
              <p style={styles.hint} role="status" aria-live="polite">
                Requesting your location…
              </p>
            )}

            {/* Manual city entry — always available as fallback (Req 13.3) */}
            <label htmlFor="location_city" style={styles.label}>
              City or area
            </label>
            <input
              id="location_city"
              name="location_city"
              type="text"
              value={form.location_city}
              onChange={handleFieldChange}
              disabled={saving}
              style={styles.input}
              placeholder="e.g. Berlin"
              aria-describedby="location-hint"
            />
            <p id="location-hint" style={styles.hint}>
              {form.location_lat === null || form.location_lng === null
                ? 'Used for matching when precise location is off.'
                : 'Shown on your profile to other players.'}
            </p>
          </section>

          {/* ── Sport preferences ── */}
          <section style={styles.section} aria-labelledby="sports-heading">
            <h2 id="sports-heading" style={styles.sectionTitle}>
              Sport Preferences <span style={styles.required}>*</span>
            </h2>

            {userSports.length === 0 && (
              <p style={styles.emptyState}>
                No sports added yet. Add at least one sport below.
              </p>
            )}

            {/* Selected sports list */}
            <ul style={styles.sportsList} aria-label="Selected sports">
              {userSports.map(({ sport, skill_level }) => (
                <li key={sport} style={styles.sportItem}>
                  <span style={styles.sportName}>
                    {sport.charAt(0).toUpperCase() + sport.slice(1)}
                  </span>

                  <label htmlFor={`skill-${sport}`} style={styles.srOnly}>
                    Skill level for {sport}
                  </label>
                  <select
                    id={`skill-${sport}`}
                    value={skill_level}
                    onChange={(e) =>
                      updateSkillLevel(sport, e.target.value as SkillLevel)
                    }
                    disabled={saving}
                    style={styles.select}
                    aria-label={`Skill level for ${sport}`}
                  >
                    {SKILL_LEVELS.map((level) => (
                      <option key={level} value={level}>
                        {level.charAt(0).toUpperCase() + level.slice(1)}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    style={styles.removeButton}
                    onClick={() => removeSport(sport)}
                    disabled={saving}
                    aria-label={`Remove ${sport}`}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>

            {/* Add sport buttons */}
            {availableSportsToAdd.length > 0 && (
              <div style={styles.addSportsRow} aria-label="Add a sport">
                {availableSportsToAdd.map((sport) => (
                  <button
                    key={sport}
                    type="button"
                    style={styles.addSportButton}
                    onClick={() => addSport(sport)}
                    disabled={saving}
                  >
                    + {sport.charAt(0).toUpperCase() + sport.slice(1)}
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* ── Save button ── */}
          <button
            type="submit"
            disabled={saving}
            style={{
              ...styles.saveButton,
              ...(saving ? styles.saveButtonDisabled : {}),
            }}
            aria-busy={saving}
          >
            {saving ? 'Saving…' : 'Save profile'}
          </button>
        </form>
      </div>
    </main>
  )
}

// ─── Inline styles ────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  loadingContainer: {
    alignItems: 'center',
    display: 'flex',
    justifyContent: 'center',
    minHeight: '100vh',
    color: '#718096',
    fontSize: '1rem',
  },
  container: {
    minHeight: '100vh',
    backgroundColor: '#f0f4f8',
    padding: '2rem 1rem',
    display: 'flex',
    justifyContent: 'center',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
    padding: '2.5rem 2rem',
    width: '100%',
    maxWidth: '560px',
    alignSelf: 'flex-start',
  },
  title: {
    margin: '0 0 1.5rem',
    fontSize: '1.75rem',
    fontWeight: 700,
    color: '#1a202c',
  },
  section: {
    marginBottom: '1.75rem',
  },
  sectionTitle: {
    fontSize: '1rem',
    fontWeight: 700,
    color: '#2d3748',
    margin: '0 0 0.75rem',
    paddingBottom: '0.5rem',
    borderBottom: '1px solid #e2e8f0',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
  },
  label: {
    display: 'block',
    fontSize: '0.875rem',
    fontWeight: 600,
    color: '#2d3748',
    marginBottom: '0.25rem',
    marginTop: '0.75rem',
  },
  required: {
    color: '#e53e3e',
    marginLeft: '2px',
  },
  charCount: {
    fontWeight: 400,
    color: '#718096',
    fontSize: '0.8rem',
    marginLeft: '0.5rem',
  },
  input: {
    border: '1px solid #cbd5e0',
    borderRadius: '6px',
    fontSize: '1rem',
    padding: '0.625rem 0.75rem',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  },
  textarea: {
    border: '1px solid #cbd5e0',
    borderRadius: '6px',
    fontSize: '1rem',
    padding: '0.625rem 0.75rem',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
    resize: 'vertical',
    fontFamily: 'inherit',
  },
  hint: {
    color: '#718096',
    fontSize: '0.8rem',
    margin: '0.25rem 0 0',
  },
  avatarRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
  },
  avatarPreview: {
    width: '72px',
    height: '72px',
    borderRadius: '50%',
    objectFit: 'cover',
    border: '2px solid #e2e8f0',
    flexShrink: 0,
  },
  avatarPlaceholder: {
    width: '72px',
    height: '72px',
    borderRadius: '50%',
    backgroundColor: '#e2e8f0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '2rem',
    flexShrink: 0,
  },
  avatarControls: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    border: '1px solid #3182ce',
    borderRadius: '6px',
    color: '#3182ce',
    cursor: 'pointer',
    fontSize: '0.875rem',
    fontWeight: 600,
    padding: '0.5rem 0.875rem',
    alignSelf: 'flex-start',
  },
  fieldError: {
    color: '#c53030',
    fontSize: '0.8rem',
    margin: '0.25rem 0 0',
  },
  emptyState: {
    color: '#718096',
    fontSize: '0.875rem',
    fontStyle: 'italic',
    margin: '0 0 0.75rem',
  },
  sportsList: {
    listStyle: 'none',
    margin: '0 0 0.75rem',
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  sportItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    backgroundColor: '#f7fafc',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    padding: '0.5rem 0.75rem',
  },
  sportName: {
    flex: 1,
    fontWeight: 600,
    color: '#2d3748',
    fontSize: '0.9rem',
  },
  select: {
    border: '1px solid #cbd5e0',
    borderRadius: '6px',
    fontSize: '0.875rem',
    padding: '0.375rem 0.5rem',
    backgroundColor: '#fff',
    cursor: 'pointer',
  },
  removeButton: {
    background: 'none',
    border: 'none',
    color: '#a0aec0',
    cursor: 'pointer',
    fontSize: '0.875rem',
    padding: '0.25rem',
    lineHeight: 1,
  },
  addSportsRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.5rem',
  },
  addSportButton: {
    backgroundColor: '#ebf8ff',
    border: '1px solid #bee3f8',
    borderRadius: '6px',
    color: '#2b6cb0',
    cursor: 'pointer',
    fontSize: '0.875rem',
    fontWeight: 600,
    padding: '0.375rem 0.75rem',
  },
  saveButton: {
    backgroundColor: '#3182ce',
    border: 'none',
    borderRadius: '6px',
    color: '#ffffff',
    cursor: 'pointer',
    fontSize: '1rem',
    fontWeight: 600,
    marginTop: '0.5rem',
    padding: '0.75rem',
    transition: 'background-color 0.15s',
  },
  saveButtonDisabled: {
    backgroundColor: '#90cdf4',
    cursor: 'not-allowed',
  },
  successMessage: {
    backgroundColor: '#f0fff4',
    border: '1px solid #9ae6b4',
    borderRadius: '6px',
    color: '#276749',
    fontSize: '0.875rem',
    marginBottom: '1rem',
    padding: '0.75rem 1rem',
  },
  errorBox: {
    backgroundColor: '#fff5f5',
    border: '1px solid #fed7d7',
    borderRadius: '6px',
    color: '#c53030',
    fontSize: '0.875rem',
    marginBottom: '1rem',
    padding: '0.75rem 1rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
  },
  errorText: {
    margin: 0,
    flex: 1,
  },
  retryButton: {
    background: 'none',
    border: '1px solid #fc8181',
    borderRadius: '4px',
    color: '#c53030',
    cursor: 'pointer',
    fontSize: '0.8rem',
    padding: '0.25rem 0.5rem',
    flexShrink: 0,
  },
  // ── Location section styles (Req 13.2, 13.3, 13.4) ──
  locationCta: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    margin: '0.75rem 0',
  },
  locationGranted: {
    backgroundColor: '#f0fff4',
    border: '1px solid #9ae6b4',
    borderRadius: '8px',
    padding: '0.75rem 1rem',
    margin: '0.75rem 0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '1rem',
    flexWrap: 'wrap',
  },
  locationButtonRow: {
    display: 'flex',
    gap: '0.5rem',
    flexWrap: 'wrap',
  },
  coordText: {
    color: '#276749',
    fontSize: '0.8rem',
    fontFamily: 'monospace',
    margin: '0.1rem 0 0',
  },
  privacyNotice: {
    backgroundColor: '#ebf8ff',
    border: '1px solid #bee3f8',
    borderRadius: '8px',
    padding: '1rem',
    margin: '0.75rem 0',
  },
  privacyNoticeTitle: {
    color: '#2b6cb0',
    fontSize: '0.95rem',
    fontWeight: 700,
    margin: '0 0 0.5rem',
  },
  privacyList: {
    color: '#2c5282',
    fontSize: '0.85rem',
    margin: '0 0 0.75rem',
    paddingLeft: '1.25rem',
  },
  primaryInlineButton: {
    backgroundColor: '#3182ce',
    border: 'none',
    borderRadius: '6px',
    color: '#ffffff',
    cursor: 'pointer',
    fontSize: '0.875rem',
    fontWeight: 600,
    padding: '0.5rem 0.875rem',
  },
  dangerButton: {
    backgroundColor: 'transparent',
    border: '1px solid #e53e3e',
    borderRadius: '6px',
    color: '#c53030',
    cursor: 'pointer',
    fontSize: '0.875rem',
    fontWeight: 600,
    padding: '0.5rem 0.875rem',
  },
  srOnly: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: 0,
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0,0,0,0)',
    whiteSpace: 'nowrap',
    border: 0,
  },
}
