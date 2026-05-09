import { ChangeEvent, FormEvent, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet'
import { LatLng } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { supabase } from '../../lib/supabaseClient'

// ─── Constants ────────────────────────────────────────────────────────────────

const SPORTS = ['football', 'basketball', 'tennis', 'volleyball'] as const
type Sport = (typeof SPORTS)[number]

const SKILL_LEVELS = ['beginner', 'intermediate', 'advanced'] as const
type SkillLevel = (typeof SKILL_LEVELS)[number]

const DESCRIPTION_MAX = 500

// Sport size constants (from design.md)
const SPORT_SIZES: Record<Sport, { min: number; max: number }> = {
  football: { min: 10, max: 14 },
  basketball: { min: 6, max: 10 },
  tennis: { min: 2, max: 4 },
  volleyball: { min: 8, max: 12 },
}

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Map Click Handler Component ─────────────────────────────────────────────

interface MapClickHandlerProps {
  onLocationSelect: (lat: number, lng: number) => void
}

function MapClickHandler({ onLocationSelect }: MapClickHandlerProps) {
  useMapEvents({
    click: (e) => {
      onLocationSelect(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * CreateEventPage
 *
 * Allows authenticated users to manually create sports events.
 *
 * Requirements covered:
 *  - 10.1: Required fields: sport, location, start_time, participant_limit
 *  - 10.2: Optional fields: skill_requirement, price_per_person, description (max 500 chars)
 *  - 10.3: Event appears in feed within 10 seconds
 *  - 11.6: Display event location on embedded Leaflet map
 *
 * The event is inserted with organizer_id = auth.uid() and source='manual'.
 */
export default function CreateEventPage() {
  const navigate = useNavigate()
  const [userId, setUserId] = useState<string | null>(null)

  // Form state
  const [form, setForm] = useState<EventFormState>({
    sport: '',
    location_name: '',
    location_lat: null,
    location_lng: null,
    start_time: '',
    participant_limit: '',
    skill_requirement: '',
    price_per_person: '',
    description: '',
  })

  // UI state
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Map state
  const [mapCenter, setMapCenter] = useState<[number, number]>([52.52, 13.405]) // Default: Berlin

  // ── Load user on mount ──────────────────────────────────────────────────────

  useEffect(() => {
    async function loadUser() {
      setLoading(true)
      setErrorMessage(null)

      try {
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

        // Try to get user's location from profile for map centering
        const { data: profile } = await supabase
          .from('profiles')
          .select('location_lat, location_lng')
          .eq('id', user.id)
          .single()

        if (profile?.location_lat && profile?.location_lng) {
          setMapCenter([profile.location_lat, profile.location_lng])
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to load user data.'
        setErrorMessage(message)
      } finally {
        setLoading(false)
      }
    }

    loadUser()
  }, [])

  // ── Form field handlers ─────────────────────────────────────────────────────

  function handleFieldChange(
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  function handleSportChange(e: ChangeEvent<HTMLSelectElement>) {
    const sport = e.target.value as Sport | ''
    setForm((prev) => ({
      ...prev,
      sport,
      // Auto-set participant limit to sport's max when sport is selected
      participant_limit: sport ? SPORT_SIZES[sport].max : '',
    }))
  }

  // ── Map handlers ────────────────────────────────────────────────────────────

  function handleLocationSelect(lat: number, lng: number) {
    setForm((prev) => ({
      ...prev,
      location_lat: lat,
      location_lng: lng,
    }))
  }

  // ── Save handler ────────────────────────────────────────────────────────────

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErrorMessage(null)

    // Req 10.1: Required fields validation
    if (!form.sport) {
      setErrorMessage('Sport is required.')
      return
    }
    if (!form.location_name.trim()) {
      setErrorMessage('Location name is required.')
      return
    }
    if (form.location_lat === null || form.location_lng === null) {
      setErrorMessage('Please select a location on the map.')
      return
    }
    if (!form.start_time) {
      setErrorMessage('Start time is required.')
      return
    }
    if (!form.participant_limit || form.participant_limit < 1) {
      setErrorMessage('Participant limit must be at least 1.')
      return
    }

    // Validate participant limit against sport constraints
    const sport = form.sport as Sport
    const limit = Number(form.participant_limit)
    if (limit < SPORT_SIZES[sport].min || limit > SPORT_SIZES[sport].max) {
      setErrorMessage(
        `Participant limit for ${sport} must be between ${SPORT_SIZES[sport].min} and ${SPORT_SIZES[sport].max}.`,
      )
      return
    }

    // Validate start time is in the future
    const startTime = new Date(form.start_time)
    if (startTime <= new Date()) {
      setErrorMessage('Start time must be in the future.')
      return
    }

    if (!userId) {
      setErrorMessage('User session not found. Please log in again.')
      return
    }

    setSaving(true)

    try {
      // Req 10.1, 10.2: INSERT event with organizer_id = auth.uid() and source='manual'
      const { data, error: insertError } = await supabase
        .from('events')
        .insert({
          sport: form.sport,
          location_name: form.location_name.trim(),
          location_lat: form.location_lat,
          location_lng: form.location_lng,
          start_time: new Date(form.start_time).toISOString(),
          participant_limit: Number(form.participant_limit),
          skill_requirement: form.skill_requirement || null,
          price_per_person: form.price_per_person ? Number(form.price_per_person) : null,
          description: form.description.trim() || null,
          organizer_id: userId,
          source: 'manual',
          status: 'open',
        })
        .select()
        .single()

      if (insertError) throw insertError

      // Add organizer as first participant
      if (data) {
        const { error: participantError } = await supabase
          .from('event_participants')
          .insert({
            event_id: data.id,
            user_id: userId,
            status: 'joined',
          })

        if (participantError) throw participantError
      }

      // Req 10.3: Event appears in feed (redirect to feed)
      navigate('/feed')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create event.'
      setErrorMessage(message)
    } finally {
      setSaving(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={styles.loadingContainer} aria-live="polite" aria-label="Loading">
        Loading…
      </div>
    )
  }

  const selectedSport = form.sport as Sport | ''
  const minLimit = selectedSport ? SPORT_SIZES[selectedSport].min : 1
  const maxLimit = selectedSport ? SPORT_SIZES[selectedSport].max : 100

  return (
    <main style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Create Event</h1>

        {/* Error message */}
        {errorMessage && (
          <div style={styles.errorBox} role="alert">
            <p style={styles.errorText}>{errorMessage}</p>
            <button
              type="button"
              style={styles.dismissButton}
              onClick={() => setErrorMessage(null)}
            >
              Dismiss
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate style={styles.form}>
          {/* ── Sport (required) ── */}
          <section style={styles.section}>
            <label htmlFor="sport" style={styles.label}>
              Sport <span style={styles.required}>*</span>
            </label>
            <select
              id="sport"
              name="sport"
              required
              value={form.sport}
              onChange={handleSportChange}
              disabled={saving}
              style={styles.select}
              aria-required="true"
            >
              <option value="">Select a sport</option>
              {SPORTS.map((sport) => (
                <option key={sport} value={sport}>
                  {sport.charAt(0).toUpperCase() + sport.slice(1)}
                </option>
              ))}
            </select>
          </section>

          {/* ── Location name (required) ── */}
          <section style={styles.section}>
            <label htmlFor="location_name" style={styles.label}>
              Location name <span style={styles.required}>*</span>
            </label>
            <input
              id="location_name"
              name="location_name"
              type="text"
              required
              value={form.location_name}
              onChange={handleFieldChange}
              disabled={saving}
              style={styles.input}
              placeholder="e.g. Central Park Basketball Court"
              aria-required="true"
            />
          </section>

          {/* ── Map (required) ── */}
          <section style={styles.section}>
            <label style={styles.label}>
              Location on map <span style={styles.required}>*</span>
            </label>
            <p style={styles.hint}>Click on the map to select the event location</p>
            <div style={styles.mapContainer}>
              <MapContainer
                center={mapCenter}
                zoom={13}
                style={{ height: '300px', width: '100%', borderRadius: '8px' }}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <MapClickHandler onLocationSelect={handleLocationSelect} />
                {form.location_lat !== null && form.location_lng !== null && (
                  <Marker position={new LatLng(form.location_lat, form.location_lng)} />
                )}
              </MapContainer>
            </div>
            {form.location_lat !== null && form.location_lng !== null && (
              <p style={styles.coordinatesText}>
                Selected: {form.location_lat.toFixed(5)}, {form.location_lng.toFixed(5)}
              </p>
            )}
          </section>

          {/* ── Start time (required) ── */}
          <section style={styles.section}>
            <label htmlFor="start_time" style={styles.label}>
              Start time <span style={styles.required}>*</span>
            </label>
            <input
              id="start_time"
              name="start_time"
              type="datetime-local"
              required
              value={form.start_time}
              onChange={handleFieldChange}
              disabled={saving}
              style={styles.input}
              aria-required="true"
            />
          </section>

          {/* ── Participant limit (required) ── */}
          <section style={styles.section}>
            <label htmlFor="participant_limit" style={styles.label}>
              Participant limit <span style={styles.required}>*</span>
            </label>
            <input
              id="participant_limit"
              name="participant_limit"
              type="number"
              required
              min={minLimit}
              max={maxLimit}
              value={form.participant_limit}
              onChange={handleFieldChange}
              disabled={saving}
              style={styles.input}
              aria-required="true"
              aria-describedby="participant-hint"
            />
            {selectedSport && (
              <p id="participant-hint" style={styles.hint}>
                For {selectedSport}: {minLimit}–{maxLimit} participants
              </p>
            )}
          </section>

          {/* ── Skill requirement (optional) ── */}
          <section style={styles.section}>
            <label htmlFor="skill_requirement" style={styles.label}>
              Skill requirement
            </label>
            <select
              id="skill_requirement"
              name="skill_requirement"
              value={form.skill_requirement}
              onChange={handleFieldChange}
              disabled={saving}
              style={styles.select}
            >
              <option value="">Any skill level</option>
              {SKILL_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {level.charAt(0).toUpperCase() + level.slice(1)}
                </option>
              ))}
            </select>
            <p style={styles.hint}>Optional</p>
          </section>

          {/* ── Price per person (optional) ── */}
          <section style={styles.section}>
            <label htmlFor="price_per_person" style={styles.label}>
              Price per person (€)
            </label>
            <input
              id="price_per_person"
              name="price_per_person"
              type="number"
              min="0"
              step="0.01"
              value={form.price_per_person}
              onChange={handleFieldChange}
              disabled={saving}
              style={styles.input}
              placeholder="0.00"
              aria-describedby="price-hint"
            />
            <p id="price-hint" style={styles.hint}>
              Optional · Leave empty if free
            </p>
          </section>

          {/* ── Description (optional) ── */}
          <section style={styles.section}>
            <label htmlFor="description" style={styles.label}>
              Description{' '}
              <span style={styles.charCount}>
                {form.description.length}/{DESCRIPTION_MAX}
              </span>
            </label>
            <textarea
              id="description"
              name="description"
              value={form.description}
              onChange={(e) => {
                if (e.target.value.length <= DESCRIPTION_MAX) handleFieldChange(e)
              }}
              disabled={saving}
              style={styles.textarea}
              placeholder="Add any additional details about the event…"
              maxLength={DESCRIPTION_MAX}
              rows={4}
              aria-describedby="description-hint"
            />
            <p id="description-hint" style={styles.hint}>
              Optional · max {DESCRIPTION_MAX} characters
            </p>
          </section>

          {/* ── Action buttons ── */}
          <div style={styles.buttonRow}>
            <button
              type="button"
              style={styles.cancelButton}
              onClick={() => navigate('/feed')}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{
                ...styles.submitButton,
                ...(saving ? styles.submitButtonDisabled : {}),
              }}
              aria-busy={saving}
            >
              {saving ? 'Creating…' : 'Create event'}
            </button>
          </div>
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
    maxWidth: '640px',
    alignSelf: 'flex-start',
  },
  title: {
    margin: '0 0 1.5rem',
    fontSize: '1.75rem',
    fontWeight: 700,
    color: '#1a202c',
  },
  section: {
    marginBottom: '1.5rem',
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
  select: {
    border: '1px solid #cbd5e0',
    borderRadius: '6px',
    fontSize: '1rem',
    padding: '0.625rem 0.75rem',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
    backgroundColor: '#fff',
    cursor: 'pointer',
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
  mapContainer: {
    marginTop: '0.5rem',
    borderRadius: '8px',
    overflow: 'hidden',
    border: '1px solid #cbd5e0',
  },
  coordinatesText: {
    color: '#718096',
    fontSize: '0.8rem',
    margin: '0.5rem 0 0',
    fontFamily: 'monospace',
  },
  buttonRow: {
    display: 'flex',
    gap: '0.75rem',
    marginTop: '0.5rem',
  },
  cancelButton: {
    backgroundColor: 'transparent',
    border: '1px solid #cbd5e0',
    borderRadius: '6px',
    color: '#2d3748',
    cursor: 'pointer',
    fontSize: '1rem',
    fontWeight: 600,
    padding: '0.75rem',
    flex: 1,
  },
  submitButton: {
    backgroundColor: '#3182ce',
    border: 'none',
    borderRadius: '6px',
    color: '#ffffff',
    cursor: 'pointer',
    fontSize: '1rem',
    fontWeight: 600,
    padding: '0.75rem',
    flex: 2,
    transition: 'background-color 0.15s',
  },
  submitButtonDisabled: {
    backgroundColor: '#90cdf4',
    cursor: 'not-allowed',
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
  dismissButton: {
    background: 'none',
    border: '1px solid #fc8181',
    borderRadius: '4px',
    color: '#c53030',
    cursor: 'pointer',
    fontSize: '0.8rem',
    padding: '0.25rem 0.5rem',
    flexShrink: 0,
  },
}
