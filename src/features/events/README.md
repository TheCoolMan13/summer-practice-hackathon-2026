# Events Feature

This directory contains components and logic for event management in the ShowUp2Move application.

## Components

### CreateEventPage

Allows authenticated users to manually create sports events with the following features:
- Required fields: sport, location (name + map coordinates), start time, participant limit
- Optional fields: skill requirement, price per person, description (max 500 chars)
- Interactive Leaflet map for location selection
- Automatic validation of participant limits based on sport type
- Auto-adds organizer as first participant

**Requirements covered:** 10.1, 10.2, 10.3, 11.6

### EventDetailPage

Displays comprehensive event details with live updates:

#### Features
- **Event Information Display**
  - All event fields (sport, location, time, description, etc.)
  - Organizer information
  - Event status and type (manual/auto-matched)
  - Skill requirements and pricing

- **Participant Management**
  - Live participant list with display names
  - Real-time participant count updates via Supabase Realtime
  - Identifies organizer and current user in the list
  - Shows participant status (joined/confirmed)
  - Filters out cancelled participants

- **Interactive Map** (Requirements 11.6, 13.1)
  - Embedded Leaflet map showing event location
  - Marker at event coordinates
  - Displays coordinates below map

- **Cancel Participation** (Requirement 10.6)
  - Button to cancel participation for joined users
  - Updates `event_participants.status = 'cancelled'`
  - Refreshes participant count after cancellation
  - Success/error feedback messages

#### Realtime Updates
Subscribes to the `feed` Realtime channel to receive live updates when:
- Participants join or leave
- Participation status changes
- Event details are modified

#### Route
`/events/:eventId` - Protected by AuthGuard

**Requirements covered:** 10.6, 11.6, 13.1

## Testing

### EventDetailPage.test.ts
Unit tests covering:
- Event details display with all fields
- Handling of optional fields
- Participant list structure and filtering
- Cancel participation logic
- Map display conditions
- Realtime update handling
- User participation status identification
- Event capacity calculations

All tests pass successfully (13/13).

## Integration with Feed

The FeedPage has been updated to make event cards clickable, navigating to the EventDetailPage when clicked. The join button on event cards stops propagation to allow joining without navigation.

## Database Schema

The EventDetailPage interacts with the following tables:
- `events` - Event details
- `event_participants` - Participant list and status
- `profiles` - User display names

## Realtime Subscription

The component subscribes to Postgres changes on the `event_participants` table filtered by `event_id` to receive live updates when participants join, leave, or change status.
