# Application Specs — ShowUp2Move

This is what you're building.

---

# Authentication

Users can register and log in securely.

Passwords are hashed and never stored in plaintext. Never return passwords in API responses.

Authentication should feel lightweight and mobile-first. Keep onboarding fast — users should be able to create an account and start joining activities in under a minute.

If a user tries to access protected functionality while unauthenticated:

* explain clearly what requires login,
* redirect them appropriately,
* and avoid vague generic errors.

Optional social login is a plus.

---

# Core Features

## Home Feed — Sports Activity Discovery

Logged-in users see:

* upcoming sports activities,
* suggested matches/groups,
* nearby active sessions,
* and manually created events.

Each activity should display:

* sport type,
* participant count,
* required group size,
* time,
* location,
* organizer/captain,
* and participation status.

Users can:

* filter by sport,
* filter by distance,
* filter by availability/time,
* and join activities directly.

If no activities exist yet, show a clean empty state encouraging users to create or join one.

---

# User Profiles

Users can create lightweight social profiles containing:

* username/display name,
* short bio,
* profile picture (optional),
* preferred sports,
* optional skill levels,
* optional location/proximity preferences.

Profiles should feel fast to set up — avoid long forms.

### AI-Assisted Profile Understanding

The platform can optionally:

* infer sports/interests from profile descriptions,
* infer sports from uploaded images,
* generate compatibility signals between users.

AI suggestions should never overwrite user choices automatically.

---

# Availability System — “ShowUpToday?”

The app periodically asks users whether they are available for sports activities.

The interaction should be extremely lightweight:

* one-tap Yes/No,
* optional preferred time window,
* optional selected sports for today.

Example flow:

1. User receives:

   * “ShowUpToday?”
2. User taps:

   * Yes
3. User becomes eligible for matching.

Availability should expire automatically after a reasonable time window so stale matches don't accumulate.

---

# Smart Matching System

The platform automatically creates sports groups based on:

* selected sports,
* availability,
* group size requirements,
* optional skill level,
* optional location proximity,
* and compatibility between users.

Examples:

| Sport      | Suggested Group Size |
| ---------- | -------------------- |
| Football   | 10–14                |
| Basketball | 6–10                 |
| Tennis     | 2–4                  |
| Volleyball | 8–12                 |

Matching should prioritize:

* minimizing coordination effort,
* creating viable groups quickly,
* and maximizing participation likelihood.

If a group cannot be completed immediately, users can remain in a pending queue.

---

# Captain Selection

Each automatically generated group receives a captain.

Captain assignment should:

* be random or rotation-based,
* avoid repeatedly selecting the same user,
* and provide lightweight coordination tools.

Captains can:

* confirm the event,
* propose venue options,
* finalize time/location,
* and manage participation confirmations.

---

# Group Chat

Every matched group receives a dedicated real-time group chat.

The chat supports:

* event discussion,
* logistics coordination,
* participation confirmations,
* quick reactions/emojis,
* and system-generated updates.

Example system messages:

* “Alex joined the group”
* “Basketball match confirmed”
* “Venue vote started”

Chats should update in real time.

---

# Event Planning & Coordination

The platform assists captains and groups with:

* venue suggestions,
* nearby sports locations,
* estimated pricing,
* map/navigation support,
* weather-aware recommendations,
* and scheduling coordination.

The goal is reducing friction between matching and actually meeting.

---

# Manual Event Creation

Users can manually create events.

The creation flow should include:

* sport type,
* location,
* time,
* participant limit,
* optional skill level,
* optional price/cost,
* and event description.

Other users can:

* request to join,
* accept invitations,
* or discover the event through the feed.

---

# Notifications & Real-Time Features

Users should receive real-time updates for:

* new matches,
* participation confirmations,
* captain announcements,
* chat activity,
* venue updates,
* reminders before events,
* and event cancellations.

Push notifications are strongly encouraged for mobile usability.

---

# Maps & Location Assistance

The platform should support:

* viewing event locations on a map,
* navigation assistance,
* proximity-based matching,
* and nearby venue discovery.

Location sharing should always be optional and privacy-conscious.

---

# AI Service

AI features run in a separate service from the main backend.

The core application must continue functioning even if AI services fail.

The frontend/backend should gracefully degrade if AI is unavailable.

---

# Suggested AI Endpoints

## `POST /extract-interests`

Extract sports/interests from a user description.

```json
Request:
{
  "description": "I usually play football and sometimes tennis after work"
}

Response:
{
  "sports": ["football", "tennis"]
}
```

If the AI fails:

```json
{
  "sports": [],
  "error": "service unavailable"
}
```

The frontend should simply allow manual selection instead.

---

## `POST /profile-compatibility`

Calculate compatibility between users for group recommendations.

```json
Request:
{
  "userA": {...},
  "userB": {...}
}

Response:
{
  "score": 0.87,
  "reasons": [
    "Similar schedule",
    "Both prefer basketball"
  ]
}
```

---

## `POST /venue-recommendations`

Suggest sports venues for a generated group.

```json
Request:
{
  "sport": "football",
  "participants": 12,
  "location": "Cluj-Napoca"
}

Response:
{
  "venues": [
    {
      "name": "Sports Center Arena",
      "priceEstimate": 120,
      "distanceKm": 3.2
    }
  ]
}
```

---

## `GET /health`

Returns AI service status.

```json
Response:
{
  "ok": true,
  "provider": "ollama",
  "model": "llama3"
}
```

---

# AI Failures Must Not Break the App

If AI systems fail:

* users can still create profiles,
* join matches,
* create events,
* use chats,
* and coordinate activities normally.

AI is an enhancement — not a dependency.

---

# Your Own AI Feature

In addition to the provided AI features, the project should include at least one original AI-powered feature that adds real user value.

Examples:

* teammate chemistry prediction,
* automatic balanced team generation,
* weather-aware sport suggestions,
* activity habit analysis,
* smart re-engagement reminders,
* toxicity moderation in group chats,
* AI-generated event summaries,
* or automatic scheduling optimization.

The feature should solve a real coordination or engagement problem.

---

# Suggested Architecture

## Frontend (React Native)

Recommended stack:

* React Native
* Expo or bare React Native
* React Navigation
* Zustand or Redux Toolkit
* React Query / TanStack Query
* Socket.IO client
* NativeWind or Tailwind styling

---

## Backend

Recommended stack:

* Node.js
* Express or NestJS
* PostgreSQL
* Prisma ORM
* Socket.IO
* JWT authentication

---

## AI Service

Separate microservice:

* Python FastAPI or Node.js
* Ollama / OpenAI-compatible models
* Queue system for heavier tasks

---

# Suggested Real-Time Features

Use WebSockets/Socket.IO for:

* chats,
* live group updates,
* notifications,
* participation confirmations,
* and voting systems.

---

# UI / UX Guidelines

The app should feel:

* lightweight,
* fast,
* modern,
* and social-first.

Prioritize:

* minimal friction,
* large touch-friendly interactions,
* clear event cards,
* clean spacing,
* and quick actions.

Avoid:

* cluttered screens,
* long onboarding flows,
* and excessive forms.

The best UX is one where users can:

1. open the app,
2. tap “Yes” to ShowUpToday,
3. join a group,
4. and start playing within minutes.

---

# Edge Cases

Handle gracefully:

* no nearby users,
* incomplete groups,
* users leaving events,
* captain inactivity,
* expired availability,
* empty chats,
* venue unavailability,
* and AI outages.

Never leave users on blank screens without explanation.

---

# Expected Deliverables

By the end of development, the project should include:

* working mobile application,
* backend API,
* real-time communication,
* AI integration,
* source code,
* and demo presentation.

The presentation should explain:

* the problem,
* the solution,
* technical architecture,
* scalability considerations,
* AI usage,
* and future improvements.
