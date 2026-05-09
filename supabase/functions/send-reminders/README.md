# send-reminders Edge Function

## Overview

The `send-reminders` Edge Function sends reminder notifications to users for events starting within the next hour. It is triggered automatically by pg_cron every hour.

## Requirements

**Requirement 12.5**: WHEN an Event the User has joined starts within 1 hour, THE Notification_Service SHALL deliver a reminder notification.

## Functionality

### Query Logic

The function queries events that meet the following criteria:
- `start_time` is between NOW() and NOW() + 1 hour
- `status` is either 'confirmed' or 'open'

### Notification Logic

For each qualifying event:
1. Retrieves all active participants (status = 'joined' or 'confirmed')
2. Checks if reminders have already been sent (to avoid duplicates)
3. Creates reminder notifications for all participants
4. Includes event details (sport, title, start time, location)

### Notification Format

```json
{
  "user_id": "uuid",
  "type": "event_reminder",
  "title": "⏰ Event starting soon!",
  "body": "Your {sport} event \"{title}\" starts at {time} at {location}. Get ready!",
  "data": {
    "event_id": "uuid"
  }
}
```

## Scheduling

The function is scheduled to run every hour via pg_cron:

```sql
SELECT cron.schedule(
  'send-reminders-every-hour',
  '0 * * * *',  -- Every hour at minute 0
  ...
);
```

## Environment Variables

Required environment variables:
- `SUPABASE_URL`: The Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Service role key for bypassing RLS

These are automatically provided by Supabase Edge Functions runtime.

## Manual Testing

You can manually trigger the function for testing:

```bash
curl -X POST https://your-project.supabase.co/functions/v1/send-reminders \
  -H "Authorization: Bearer <service-role-key>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

## Response Format

### Success Response

```json
{
  "message": "Reminder notifications sent successfully",
  "eventsProcessed": 3,
  "remindersSent": 15,
  "processedEventIds": ["uuid1", "uuid2", "uuid3"]
}
```

### No Events Response

```json
{
  "message": "No upcoming events within the next hour",
  "remindersSent": 0
}
```

### Error Response

```json
{
  "error": "Failed to query upcoming events",
  "details": "error message"
}
```

## Duplicate Prevention

The function checks for existing `event_reminder` notifications with the same `event_id` before sending new reminders. This prevents duplicate notifications if the function runs multiple times within the same hour window.

## Logging

The function logs:
- Events with no active participants (skipped)
- Events that already have reminders sent (skipped)
- Number of reminders sent per event
- Any errors encountered during processing

## Error Handling

- If querying events fails, returns 500 error
- If querying participants fails for an event, skips that event and continues
- If checking existing reminders fails, skips that event and continues
- If inserting notifications fails, skips that event and continues
- Errors are logged to console for debugging

## Database Tables Used

### Read Operations
- `events`: Query upcoming events
- `event_participants`: Get active participants
- `notifications`: Check for existing reminders

### Write Operations
- `notifications`: Insert reminder notifications

## Related Documentation

- [pg_cron Setup Guide](../../../docs/pg-cron-setup.md)
- [Requirements Document](../../../.kiro/specs/show-up-2-move/requirements.md)
- [Design Document](../../../.kiro/specs/show-up-2-move/design.md)

## Monitoring

To monitor the function's execution:

```sql
-- Check recent executions
SELECT 
  jobname,
  status,
  return_message,
  start_time,
  end_time - start_time as duration
FROM cron.job_run_details jrd
JOIN cron.job j ON jrd.jobid = j.jobid
WHERE j.jobname = 'send-reminders-every-hour'
ORDER BY start_time DESC
LIMIT 10;

-- Check reminders sent in last 24 hours
SELECT 
  COUNT(*) as total_reminders,
  COUNT(DISTINCT data->>'event_id') as unique_events
FROM notifications
WHERE type = 'event_reminder'
  AND created_at > NOW() - INTERVAL '24 hours';
```

## Deployment

Deploy the function using the Supabase CLI:

```bash
supabase functions deploy send-reminders
```

The pg_cron schedule is automatically created when the migration `20240001000006_pg_cron_schedules.sql` is applied.
