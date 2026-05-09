import { ChangeEvent, FormEvent, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet'
import { LatLng } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { supabase } from '../../lib/supabaseClient'
import { colors, gradients, radii, shadows, themeForSport } from '../../lib/theme'

const SPORTS = ['football', 'basketball', 'tennis', 'volleyball'] as const
type Sport = (typeof SPORTS)[number]
const SKILL_LEVELS = ['beginner', 'intermediate', 'advanced'] as const
type SkillLevel = (typeof SKILL_LEVELS)[number]
const DESCRIPTION_MAX = 500
const SPORT_SIZES: Record<Sport, { min: number; max: number }> = {
  football: { min: 10, max: 14 },
  basketball: { min: 6, max: 10 },
  tennis: { min: 2, max: 4 },
  volleyball: { min: 8, max: 12 },
}

interface EventFormState {
  sport: Sport | ''
  location_name: string
  location_lat: number | null
  location_lng: number | null
  start_time: string
  participant_limit: number | ''
  skill_requirement: SkillLevel | ''
  price_per_person: string
  description: string
}

function MapClickHandler({ onLocationSelect }: { onLocationSelect: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onLocationSelect(e.latlng.lat, e.latlng.lng) })
  return null
}

export default function CreateEventPage() {
  const navigate = useNavigate()
  const [userId, setUserId] = useState<string | null>(null)
  const [form, setForm] = useState<EventFormState>({
    sport: '', location_name: '', location_lat: null, location_lng: null,
    start_time: '', participant_limit: '', skill_requirement: '',
    price_per_person: '', description: '',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [mapCenter, setMapCenter] = useState<[number, number]>([52.52, 13.405])

  useEffect(() => {
    let cancelled = false
    async function loadUser() {
      setLoading(true); setErrorMessage(null)
      try {
        const { data: { user }, error } = await supabase.auth.getUser()
        if (error || !user) { setErrorMessage('Please log in again.'); return }
        if (cancelled) return
        setUserId(user.id)
        const { data: profile } = await supabase
          .from('profiles').select('location_lat, location_lng').eq('id', user.id).single()
        if (profile?.location_lat && profile?.location_lng) {
          setMapCenter([profile.location_lat, profile.location_lng])
        }
      } catch (err: unknown) {
        if (!cancelled) setErrorMessage(err instanceof Error ? err.message : 'Failed to load user data.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadUser()
    return () => { cancelled = true }
  }, [])

  function handleFieldChange(e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }
  function handleSportChange(e: ChangeEvent<HTMLSelectElement>) {
    const sport = e.target.value as Sport | ''
    setForm((prev) => ({
      ...prev, sport,
      participant_limit: sport ? SPORT_SIZES[sport].max : '',
    }))
  }
  function handleLocationSelect(lat: number, lng: number) {
    setForm((prev) => ({ ...prev, location_lat: lat, location_lng: lng }))
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setErrorMessage(null)
    if (!form.sport) return setErrorMessage('Sport is required.')
    if (!form.location_name.trim()) return setErrorMessage('Location name is required.')
    if (form.location_lat === null || form.location_lng === null) return setErrorMessage('Please select a location on the map.')
    if (!form.start_time) return setErrorMessage('Start time is required.')
    if (!form.participant_limit || form.participant_limit < 1) return setErrorMessage('Participant limit must be at least 1.')
    const sport = form.sport as Sport
    const limit = Number(form.participant_limit)
    if (limit < SPORT_SIZES[sport].min || limit > SPORT_SIZES[sport].max) {
      return setErrorMessage(
        `Participant limit for ${sport} must be between ${SPORT_SIZES[sport].min} and ${SPORT_SIZES[sport].max}.`,
      )
    }
    if (new Date(form.start_time) <= new Date()) return setErrorMessage('Start time must be in the future.')
    if (!userId) return setErrorMessage('User session not found.')

    setSaving(true)
    try {
      const { data, error } = await supabase.from('events').insert({
        sport: form.sport,
        location_name: form.location_name.trim(),
        location_lat: form.location_lat,
        location_lng: form.location_lng,
        start_time: new Date(form.start_time).toISOString(),
        participant_limit: Number(form.participant_limit),
        skill_requirement: form.skill_requirement || null,
        price_per_person: form.price_per_person ? Number(form.price_per_person) : null,
        description: form.description.trim() || null,
        organizer_id: userId, source: 'manual', status: 'open',
      }).select().single()
      if (error) throw error
      if (!data) throw new Error('Event was created but no data was returned.')

      const { error: partError } = await supabase
        .from('event_participants')
        .insert({ event_id: data.id, user_id: userId, status: 'joined' })
      if (partError && partError.code !== '23505') throw partError
      navigate('/feed')
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to create event.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div style={styles.loading}>Loading…</div>

  const selected = form.sport as Sport | ''
  const minLimit = selected ? SPORT_SIZES[selected].min : 1
  const maxLimit = selected ? SPORT_SIZES[selected].max : 100

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <span style={styles.eyebrow}>Create</span>
        <h1 style={styles.title}>Start a pickup event</h1>
        <p style={styles.subtitle}>
          Set the basics — players will see your event on the feed and can join with one tap.
        </p>
      </header>

      <form onSubmit={handleSubmit} noValidate style={styles.form}>
        {errorMessage && (
          <div style={styles.errorBanner} role="alert">
            <span aria-hidden="true">⚠️</span>
            <span>{errorMessage}</span>
            <button type="button" onClick={() => setErrorMessage(null)} style={styles.dismissBtn}>
              Dismiss
            </button>
          </div>
        )}

        <section style={styles.card}>
          <h2 style={styles.cardTitle}>Sport</h2>
          <div style={styles.sportGrid}>
            {SPORTS.map((s) => {
              const theme = themeForSport(s)
              const active = form.sport === s
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleSportChange({ target: { value: s } } as any)}
                  style={{
                    ...styles.sportBtn,
                    ...(active
                      ? { background: theme.bg, borderColor: theme.solid, color: theme.text,
                          boxShadow: `0 6px 18px -6px ${theme.glow}` }
                      : {}),
                  }}
                  aria-pressed={active}
                >
                  <span style={{ fontSize: 26 }} aria-hidden="true">{theme.emoji}</span>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </span>
                  <span style={{ fontSize: 11, color: active ? theme.text : colors.ink[500] }}>
                    {SPORT_SIZES[s].min}–{SPORT_SIZES[s].max} players
                  </span>
                </button>
              )
            })}
          </div>
        </section>

        <section style={styles.card}>
          <h2 style={styles.cardTitle}>Location</h2>

          <label htmlFor="location_name" style={styles.label}>
            Venue name <span style={styles.required}>*</span>
          </label>
          <input
            id="location_name" name="location_name" type="text" required
            value={form.location_name} onChange={handleFieldChange} disabled={saving}
            placeholder="e.g. Tempelhofer Feld basketball court"
          />

          <p style={{ ...styles.hint, marginTop: 14, marginBottom: 8 }}>
            Click anywhere on the map to pin the exact spot.
          </p>
          <div style={styles.mapWrapper}>
            <MapContainer
              center={mapCenter} zoom={13}
              style={{ height: 320, width: '100%' }}
            >
              <TileLayer
                attribution='&copy; OpenStreetMap contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <MapClickHandler onLocationSelect={handleLocationSelect} />
              {form.location_lat !== null && form.location_lng !== null && (
                <Marker position={new LatLng(form.location_lat, form.location_lng)} />
              )}
            </MapContainer>
          </div>
          {form.location_lat !== null && form.location_lng !== null && (
            <p style={styles.coords}>
              📍 {form.location_lat.toFixed(5)}, {form.location_lng.toFixed(5)}
            </p>
          )}
        </section>

        <section style={styles.card}>
          <h2 style={styles.cardTitle}>Details</h2>
          <div style={styles.twoCol}>
            <div>
              <label htmlFor="start_time" style={styles.label}>
                Start time <span style={styles.required}>*</span>
              </label>
              <input
                id="start_time" name="start_time" type="datetime-local" required
                value={form.start_time} onChange={handleFieldChange} disabled={saving}
              />
            </div>
            <div>
              <label htmlFor="participant_limit" style={styles.label}>
                Participant limit <span style={styles.required}>*</span>
              </label>
              <input
                id="participant_limit" name="participant_limit" type="number" required
                min={minLimit} max={maxLimit}
                value={form.participant_limit}
                onChange={handleFieldChange}
                disabled={saving}
              />
              {selected && (
                <p style={styles.hint}>For {selected}: {minLimit}–{maxLimit} players</p>
              )}
            </div>
          </div>

          <div style={styles.twoCol}>
            <div>
              <label htmlFor="skill_requirement" style={styles.label}>Skill level</label>
              <select
                id="skill_requirement" name="skill_requirement"
                value={form.skill_requirement} onChange={handleFieldChange} disabled={saving}
              >
                <option value="">Any skill level</option>
                {SKILL_LEVELS.map((l) => (
                  <option key={l} value={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</option>
                ))}
              </select>
              <p style={styles.hint}>Optional</p>
            </div>
            <div>
              <label htmlFor="price_per_person" style={styles.label}>Price per person (€)</label>
              <input
                id="price_per_person" name="price_per_person" type="number" min="0" step="0.01"
                placeholder="0.00"
                value={form.price_per_person} onChange={handleFieldChange} disabled={saving}
              />
              <p style={styles.hint}>Optional · Leave empty if free</p>
            </div>
          </div>

          <label htmlFor="description" style={{ ...styles.label, marginTop: 10 }}>
            Description{' '}
            <span style={styles.charCount}>
              {form.description.length}/{DESCRIPTION_MAX}
            </span>
          </label>
          <textarea
            id="description" name="description"
            rows={4} maxLength={DESCRIPTION_MAX}
            value={form.description}
            onChange={(e) => {
              if (e.target.value.length <= DESCRIPTION_MAX) handleFieldChange(e)
            }}
            disabled={saving}
            placeholder="Any details players should know…"
          />
        </section>

        <div style={styles.actions}>
          <button type="button" onClick={() => navigate('/feed')} style={styles.cancelBtn} disabled={saving}>
            Cancel
          </button>
          <button type="submit" disabled={saving} style={{ ...styles.submitBtn, ...(saving ? styles.busy : {}) }}>
            {saving ? 'Creating…' : 'Create event'}
          </button>
        </div>
      </form>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  loading: { textAlign: 'center', padding: 48, color: colors.ink[500] },
  page: { maxWidth: 780, margin: '0 auto' },

  header: { marginBottom: 20, textAlign: 'center' },
  eyebrow: {
    display: 'inline-block',
    fontSize: 11, fontWeight: 700,
    letterSpacing: '0.1em', textTransform: 'uppercase',
    color: colors.brand[600],
    marginBottom: 6,
  },
  title: { margin: 0, fontSize: 32, fontWeight: 800, letterSpacing: '-0.02em' },
  subtitle: { margin: '8px auto 0', color: colors.ink[600], maxWidth: 520 },

  form: { display: 'flex', flexDirection: 'column', gap: 18 },

  errorBanner: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '12px 16px',
    background: colors.danger[100],
    border: `1px solid ${colors.danger[300]}`,
    color: colors.danger[700],
    borderRadius: radii.sm, fontSize: 14,
  },
  dismissBtn: {
    marginLeft: 'auto',
    background: 'transparent',
    border: `1px solid ${colors.danger[300]}`,
    borderRadius: radii.sm,
    color: colors.danger[700],
    fontSize: 12, fontWeight: 600,
    padding: '4px 10px',
    cursor: 'pointer',
  },

  card: {
    padding: 24,
    background: colors.surface,
    border: `1px solid ${colors.ink[200]}`,
    borderRadius: radii.xl,
    boxShadow: shadows.sm,
  },
  cardTitle: { margin: '0 0 16px', fontSize: 16, fontWeight: 700 },

  sportGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
    gap: 10,
  },
  sportBtn: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    padding: '16px 12px',
    background: colors.surface,
    border: `1px solid ${colors.ink[200]}`,
    borderRadius: radii.md,
    color: colors.ink[700],
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },

  label: {
    display: 'block',
    fontSize: 13, fontWeight: 600,
    color: colors.ink[700],
    marginBottom: 6,
  },
  required: { color: colors.danger[500] },
  hint: { color: colors.ink[500], fontSize: 12, margin: '6px 0 0' },
  charCount: { color: colors.ink[500], fontSize: 12, fontWeight: 400, marginLeft: 6 },

  twoCol: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: 16,
    marginBottom: 16,
  },

  mapWrapper: {
    borderRadius: radii.md,
    overflow: 'hidden',
    border: `1px solid ${colors.ink[200]}`,
  },
  coords: {
    marginTop: 10,
    fontSize: 12, fontFamily: 'ui-monospace, monospace',
    color: colors.ink[600],
  },

  actions: {
    display: 'flex',
    gap: 10,
    marginTop: 8,
    justifyContent: 'flex-end',
  },
  cancelBtn: {
    padding: '12px 20px',
    background: colors.surface,
    border: `1px solid ${colors.ink[200]}`,
    borderRadius: radii.sm,
    color: colors.ink[700],
    fontSize: 14, fontWeight: 600, cursor: 'pointer',
  },
  submitBtn: {
    padding: '12px 26px',
    background: gradients.brandStrong,
    border: 'none',
    borderRadius: radii.sm,
    color: '#fff',
    fontSize: 14, fontWeight: 600, cursor: 'pointer',
    boxShadow: shadows.md,
  },
  busy: { opacity: 0.85, cursor: 'wait' },
}
