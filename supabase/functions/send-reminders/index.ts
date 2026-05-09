// Feature: show-up-2-move
// Edge Function: send-reminders
//
// Triggered by pg_cron every hour.
// Responsibilities for task 20:
//   - Query events where start_time BETWEEN NOW() AND NOW() + interval '1 hour'
//   - Filter events with status IN ('confirmed', 'open')
//   - INSERT reminder notifications for all active participants
//
// Requirement: 12.5

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
Deno.serve(async (req: Request): Promise<Response> => {
  // Only allow POST (pg_cron sends POST; manual triggers also use POST)
  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(
      JSON.stringify({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }

  // Use the service role key so the function can bypass RLS
  const supabase = createClient(supabaseUrl, serviceRoleKey)

  // -------------------------------------------------------------------------
  // Step 1: Query events starting within the next hour
  // (Requirement 12.5)
  //
  // Filter:
  //   - start_time BETWEEN NOW() AND NOW() + interval '1 hour'
  //   - status IN ('confirmed', 'open')
  // -------------------------------------------------------------------------
  const now = new Date()
  const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000)

  const { data: upcomingEvents, error: eventsError } = await supabase
    .from('events')
    .select('id, sport, title, start_time, location_name')
    .gte('start_time', now.toISOString())
    .lte('start_time', oneHourFromNow.toISOString())
    .in('status', ['confirmed', 'open'])

  if (eventsError) {
    console.error('Failed to query upcoming events:', eventsError.message)
    return new Response(
      JSON.stringify({ error: 'Failed to query upcoming events', details: eventsError.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }

  if (!upcomingEvents || upcomingEvents.length === 0) {
    return new Response(
      JSON.stringify({ message: 'No upcoming events within the next hour', remindersSent: 0 }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  }

  // -------------------------------------------------------------------------
  // Step 2: For each event, get all active participants
  // -------------------------------------------------------------------------
  let totalRemindersSent = 0
  const processedEvents: string[] = []

  for (const event of upcomingEvents) {
    // Get all active participants (status = 'joined' or 'confirmed')
    const { data: participants, error: participantsError } = await supabase
      .from('event_participants')
      .select('user_id')
      .eq('event_id', event.id)
      .in('status', ['joined', 'confirmed'])

    if (participantsError) {
      console.error(`Failed to query participants for event ${event.id}:`, participantsError.message)
      continue
    }

    if (!participants || participants.length === 0) {
      console.log(`Event ${event.id} has no active participants, skipping`)
      continue
    }

    // -------------------------------------------------------------------------
    // Step 3: Check if reminders have already been sent for this event
    // (Avoid duplicate reminders on subsequent runs)
    // -------------------------------------------------------------------------
    const { data: existingReminders, error: checkError } = await supabase
      .from('notifications')
      .select('id')
      .eq('type', 'event_reminder')
      .eq('data->>event_id', event.id)
      .limit(1)

    if (checkError) {
      console.error(`Failed to check existing reminders for event ${event.id}:`, checkError.message)
      continue
    }

    if (existingReminders && existingReminders.length > 0) {
      console.log(`Reminders already sent for event ${event.id}, skipping`)
      continue
    }

    // -------------------------------------------------------------------------
    // Step 4: INSERT reminder notifications for all participants
    // (Requirement 12.5)
    // -------------------------------------------------------------------------
    const startTimeFormatted = new Date(event.start_time).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })

    const notifications = participants.map((participant) => ({
      user_id: participant.user_id,
      type: 'event_reminder',
      title: '⏰ Event starting soon!',
      body: `Your ${event.sport} event "${event.title || 'match'}" starts at ${startTimeFormatted}${
        event.location_name ? ` at ${event.location_name}` : ''
      }. Get ready!`,
      data: { event_id: event.id },
    }))

    const { error: notifError } = await supabase
      .from('notifications')
      .insert(notifications)

    if (notifError) {
      console.error(`Failed to insert reminders for event ${event.id}:`, notifError.message)
      continue
    }

    totalRemindersSent += notifications.length
    processedEvents.push(event.id)
    console.log(`Sent ${notifications.length} reminders for event ${event.id}`)
  }

  // -------------------------------------------------------------------------
  // Step 5: Return summary
  // -------------------------------------------------------------------------
  return new Response(
    JSON.stringify({
      message: 'Reminder notifications sent successfully',
      eventsProcessed: processedEvents.length,
      remindersSent: totalRemindersSent,
      processedEventIds: processedEvents,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
})
