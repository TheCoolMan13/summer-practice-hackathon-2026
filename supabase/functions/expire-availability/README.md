# expire-availability Edge Function

## Overview

This Edge Function is responsible for automatically expiring user availability declarations and cleaning up related data. It runs every 1 minute via pg_cron.

## Responsibilities

1. **Query expired availability records**: Find all `availability` records where `expires_at <= NOW()` and `is_available = true`
2. **Mark as unavailable**: Set `is_available = false` for all expired records
3. **Clean up matching queue**: Delete corresponding rows from `matching_queue` for affected users
4. **Notify users**: Insert a notification for each affected user informing them their availability has expired

## Requirements

- **6.4**: Automatic availability expiry after 8 hours
- **16.5**: Remove expired users from matching queue and notify them

## API

### Endpoint
```
POST /functions/v1/expire-availability
```

### Authentication
Requires service role key (bypasses RLS)

### Request Body
```json
{}
```

### Response
```json
{
  "message": "Availability expiry completed successfully",
  "expiredCount": 3,
  "expiredUserIds": ["uuid1", "uuid2", "uuid3"]
}
```

## Scheduling

The function is scheduled to run every 1 minute via pg_cron:

```sql
SELECT cron.schedule(
  'expire-availability-every-minute',
  '* * * * *',
  $$ ... $$
);
```

## Testing

### Manual Trigger (Local)
```bash
curl -X POST http://127.0.0.1:54321/functions/v1/expire-availability \
  -H "Authorization: Bearer <service-role-key>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

### Manual Trigger (Production)
```bash
curl -X POST https://your-project.supabase.co/functions/v1/expire-availability \
  -H "Authorization: Bearer <service-role-key>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

### Test Scenario

1. Create a user and declare availability with `expires_at` in the past:
```sql
INSERT INTO availability (user_id, is_available, expires_at)
VALUES ('test-user-id', true, NOW() - INTERVAL '1 minute');
```

2. Add the user to the matching queue:
```sql
INSERT INTO matching_queue (user_id, sport)
VALUES ('test-user-id', 'football');
```

3. Trigger the function manually (see above)

4. Verify the results:
```sql
-- Should be false
SELECT is_available FROM availability WHERE user_id = 'test-user-id';

-- Should return no rows
SELECT * FROM matching_queue WHERE user_id = 'test-user-id';

-- Should have a notification
SELECT * FROM notifications WHERE user_id = 'test-user-id' AND type = 'availability_expired';
```

## Error Handling

- **Query failure**: Returns 500 with error details
- **Update failure**: Returns 500 with error details
- **Delete failure**: Logs error but continues (availability is already marked expired)
- **Notification failure**: Logs error but continues (core expiry logic has succeeded)

## Deployment

The function is automatically deployed when you:

1. Push the code to the repository
2. Run `supabase functions deploy expire-availability` (manual deployment)
3. Apply the migration `20240001000006_pg_cron_schedules.sql` to set up the schedule

## Configuration

After deploying, configure the database settings for pg_cron:

```sql
-- Local development
ALTER DATABASE postgres SET app.settings.supabase_url = 'http://127.0.0.1:54321';
ALTER DATABASE postgres SET app.settings.service_role_key = '<local-service-role-key>';

-- Production
ALTER DATABASE postgres SET app.settings.supabase_url = 'https://your-project.supabase.co';
ALTER DATABASE postgres SET app.settings.service_role_key = '<production-service-role-key>';
```

## Monitoring

Check the function logs:

```bash
# Local
supabase functions logs expire-availability

# Production (via dashboard)
# Navigate to: Edge Functions → expire-availability → Logs
```

## Related Files

- `supabase/functions/expire-availability/index.ts` — Function implementation
- `supabase/migrations/20240001000006_pg_cron_schedules.sql` — pg_cron schedule setup
- `supabase/migrations/20240001000001_profiles_sports_availability.sql` — availability table schema
- `supabase/migrations/20240001000003_messages_notifications_polls_queue.sql` — matching_queue and notifications tables
