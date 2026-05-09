# Supabase Edge Functions

This directory contains the Supabase Edge Functions for the ShowUp2Move platform.

## Functions

### `ai-proxy`
Proxies AI requests with timeout and graceful degradation.

**Endpoint:** `POST /ai-proxy`

**Request Body:**
```json
{
  "endpoint": "/extract-interests",
  "method": "POST",
  "body": {
    "bio": "I love playing football and basketball"
  }
}
```

**Response (Success):**
```json
{
  "sports": ["football", "basketball"]
}
```

**Response (Degraded):**
```json
{
  "sports": [],
  "error": "service unavailable"
}
```

**Features:**
- 3-second timeout for AI calls
- Health check caching (2-second TTL)
- Auto-resume on AI recovery
- Endpoint-specific degraded responses

---

### `venue-suggestions`
Fetches venue recommendations from the AI service.

**Endpoint:** `POST /venue-suggestions`

**Request Body:**
```json
{
  "sport": "football",
  "participant_count": 10,
  "location": {
    "lat": 48.8566,
    "lng": 2.3522
  }
}
```

**Response (Success):**
```json
{
  "venues": [
    {
      "name": "Central Sports Complex",
      "price_est": 25.50,
      "distance_km": 3.2
    },
    {
      "name": "City Stadium",
      "price_est": 40.00,
      "distance_km": 5.1
    }
  ]
}
```

**Response (Degraded):**
```json
{
  "venues": [],
  "error": "AI suggestions are temporarily unavailable"
}
```

**Features:**
- Returns up to 5 venue options
- 3-second timeout for AI calls
- Graceful degradation on AI failure
- Authentication required

---

### `match-users`
Runs the matching engine to group available users into sport-appropriate teams.

**Trigger:** pg_cron (every 5 minutes) or manual HTTP POST

**Features:**
- Proximity-based clustering (10 km radius)
- Skill-level compatibility filtering
- AI-powered compatibility scoring (optional)
- Captain selection with weighted randomization
- Group creation and notification dispatch

---

### `expire-availability`
Expires user availability declarations after 8 hours.

**Trigger:** pg_cron (every 1 minute)

**Features:**
- Marks expired availability as inactive
- Removes users from matching queue
- Sends expiry notifications

---

### `reassign-captain`
Reassigns captain role when the current captain is inactive for 2+ hours.

**Trigger:** pg_cron (every 15 minutes)

**Features:**
- Detects inactive captains
- Weighted random selection for replacement
- Notification dispatch to all group members

---

### `send-reminders`
Sends reminder notifications for events starting within the next hour.

**Trigger:** pg_cron (every hour)

**Endpoint:** `POST /send-reminders`

**Response (Success):**
```json
{
  "message": "Reminder notifications sent successfully",
  "eventsProcessed": 3,
  "remindersSent": 15,
  "processedEventIds": ["event-1", "event-2", "event-3"]
}
```

**Response (No Events):**
```json
{
  "message": "No upcoming events within the next hour",
  "remindersSent": 0
}
```

**Features:**
- Queries events starting within 1 hour
- Filters by status (confirmed or open)
- Sends notifications to all active participants
- Duplicate prevention (checks for existing reminders)
- Graceful error handling (continues on individual event failures)

---

## Environment Variables

All edge functions require the following environment variables:

- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_ANON_KEY`: Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service role key (for functions that bypass RLS)
- `AI_BASE_URL`: Base URL of the AI microservice (optional, functions degrade gracefully if not set)

## Testing

Run unit tests for all edge functions:

```bash
npm test -- supabase/functions
```

Run tests for a specific function:

```bash
npm test -- supabase/functions/ai-proxy/ai-proxy.test.ts
```

## Deployment

Deploy all functions:

```bash
supabase functions deploy
```

Deploy a specific function:

```bash
supabase functions deploy ai-proxy
supabase functions deploy venue-suggestions
```

## Local Development

Start Supabase locally:

```bash
supabase start
```

Serve a function locally:

```bash
supabase functions serve ai-proxy
supabase functions serve venue-suggestions
```

## Requirements Coverage

### Task 17: Edge Function: `venue-suggestions` and `ai-proxy`

- ✅ Create `supabase/functions/venue-suggestions/index.ts`: call AI `POST /venue-recommendations` with sport, participant count, and location; return up to 5 venues or empty list on failure
- ✅ Create `supabase/functions/ai-proxy/index.ts`: proxy AI requests with 3-second timeout; return degraded response `{ sports: [], error: "service unavailable" }` on failure
- ✅ Implement AI health check: mark AI unavailable when `/health` returns non-200 or times out; auto-resume on recovery
- ✅ Requirements: 11.1, 11.2, 14.1, 14.2, 14.4

All requirements are fully implemented and tested.
