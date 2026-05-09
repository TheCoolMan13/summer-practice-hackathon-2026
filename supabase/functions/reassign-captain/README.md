# Reassign Captain Edge Function

## Overview

This Edge Function is triggered by pg_cron every 15 minutes to check for inactive captains and reassign the captain role to another eligible group member.

## Requirements

- **8.4**: When a Captain has not confirmed the event within 2 hours of Group creation, the Captain_Selector SHALL reassign the Captain role to another Group member and notify all Group members.
- **16.4**: Edge case handling for captain inactivity.

## Functionality

### Query Criteria

The function queries groups where:
- `status = 'pending'`
- Captain has `confirmed = false` in `group_members`
- `created_at < NOW() - interval '2 hours'`

### Reassignment Process

For each group with an inactive captain:

1. **Select Replacement Captain**
   - Excludes the current captain (who failed to confirm)
   - Uses weighted random selection
   - Reduces weight for users who appear in their last 3 `captain_history` entries
   - Base weight: 3
   - Weight reduction: 1 per recent captain entry
   - If all weights are 0, resets to equal weights

2. **Update Database**
   - UPDATE `groups.captain_id` to the new captain
   - INSERT into `captain_history` for the new captain
   - INSERT notifications for all group members
   - INSERT system message: "New captain assigned due to inactivity. Welcome, captain! 🎖️"

### Notifications

All group members receive a notification:
- **New captain**: "You are now the captain! Please confirm the event."
- **Other members**: "A new captain has been assigned to your group."

## Schedule

Runs every 15 minutes via pg_cron:

```sql
SELECT cron.schedule(
  'reassign-captain-every-15-minutes',
  '*/15 * * * *',
  $$
  SELECT
    net.http_post(
      url := current_setting('app.settings.supabase_url', true) || '/functions/v1/reassign-captain',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $$
);
```

## Manual Invocation

For testing or manual triggers:

```bash
# Local development
curl -X POST http://127.0.0.1:54321/functions/v1/reassign-captain \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json"

# Production
curl -X POST https://your-project.supabase.co/functions/v1/reassign-captain \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json"
```

## Response Format

### Success Response

```json
{
  "message": "Captain reassignment completed successfully",
  "reassignedCount": 2,
  "reassignedGroups": [
    "group-id-1",
    "group-id-2"
  ]
}
```

### No Inactive Captains

```json
{
  "message": "No inactive captains found",
  "reassignedCount": 0
}
```

### Error Response

```json
{
  "error": "Failed to query inactive groups",
  "details": "error message"
}
```

## Implementation Notes

- Uses service role key to bypass RLS policies
- Gracefully handles errors at each step (continues processing other groups if one fails)
- Logs all operations for debugging
- Follows the same weighted random selection algorithm as the initial captain selection in `match-users`
- Ensures the current inactive captain is excluded from the replacement pool
