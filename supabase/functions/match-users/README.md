# match-users Edge Function

## Overview

This Edge Function implements the core matching engine that automatically groups available users into sport-appropriate teams. It runs every 5 minutes via pg_cron.

## Responsibilities

1. **Query active available users**: Find all users with active availability declarations grouped by sport
2. **Apply proximity filtering**: Use Haversine distance to group users within 10 km of each other
3. **Apply skill compatibility**: Group users with compatible skill levels (within one tier)
4. **AI compatibility scoring** (optional): Request compatibility scores from AI microservice and use as secondary ranking signal
5. **Form groups**: Create groups that meet sport-specific min/max size requirements
6. **Queue unmatched users**: Place users who cannot form complete groups into matching queue
7. **Persist groups**: Create group records, assign members, create events, send notifications
8. **Assign captain**: Select and assign a captain for each group using weighted random selection

## Requirements

- **7.1**: Group available users by sport and form groups meeting min/max size
- **7.2**: Respect sport-specific group size constraints
- **7.3**: Prioritize grouping users within 10 km radius
- **7.4**: Prefer grouping users with compatible skill levels
- **7.5**: Use AI compatibility scores when available
- **7.6**: Queue users when insufficient for complete group
- **7.7**: Notify queued users
- **7.8**: Complete group creation within 5 seconds
- **8.1, 8.2, 8.3**: Captain selection and notification
- **14.3**: Graceful degradation when AI unavailable

## Sport Size Constraints

| Sport       | Min Size | Max Size |
|-------------|----------|----------|
| Football    | 10       | 14       |
| Basketball  | 6        | 10       |
| Tennis      | 2        | 4        |
| Volleyball  | 8        | 12       |

## API

### Endpoint
```
POST /functions/v1/match-users
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
  "formedGroups": [
    {
      "sport": "football",
      "members": ["uuid1", "uuid2", "uuid3", ...]
    }
  ],
  "queuedUsers": [
    {
      "user_id": "uuid4",
      "sport": "tennis"
    }
  ],
  "createdGroupIds": ["group-uuid1", "group-uuid2"]
}
```

## Scheduling

The function is scheduled to run every 5 minutes via pg_cron:

```sql
SELECT cron.schedule(
  'match-users-every-5-minutes',
  '*/5 * * * *',
  $$
  SELECT
    net.http_post(
      url := current_setting('app.settings.supabase_url', true) || '/functions/v1/match-users',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $$
);
```

## Configuration

### Database Settings

After applying the migration, configure the database settings for pg_cron:

```sql
-- Production (run via Supabase dashboard SQL editor)
ALTER DATABASE postgres SET app.settings.supabase_url = 'https://your-project.supabase.co';
ALTER DATABASE postgres SET app.settings.service_role_key = '<your-service-role-key>';
```

**Note**: The service role key can be found in Supabase dashboard → Settings → API → service_role key

### Environment Variables

The Edge Function requires the following environment variables:

- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Service role key for bypassing RLS
- `AI_BASE_URL` (optional): Base URL of AI microservice (e.g., `http://ai:8000`)

## Testing

### Manual Trigger (Production)
```bash
curl -X POST https://hdmqkrkzxnqvchgccthl.supabase.co/functions/v1/match-users \
  -H "Authorization: Bearer <service-role-key>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

### Test Scenario

1. Create test users and declare availability:
```sql
-- Create test profiles
INSERT INTO profiles (id, username, display_name, location_lat, location_lng)
VALUES 
  ('user1', 'player1', 'Player One', 52.5200, 13.4050),
  ('user2', 'player2', 'Player Two', 52.5210, 13.4060),
  -- ... (add 8 more for football)
  ('user10', 'player10', 'Player Ten', 52.5220, 13.4070);

-- Declare availability for all users
INSERT INTO availability (user_id, is_available, expires_at)
SELECT id, true, NOW() + INTERVAL '8 hours'
FROM profiles
WHERE username LIKE 'player%';

-- Add sport preferences
INSERT INTO availability_sports (availability_id, sport)
SELECT a.id, 'football'
FROM availability a
JOIN profiles p ON a.user_id = p.id
WHERE p.username LIKE 'player%';

-- Add skill levels
INSERT INTO user_sports (user_id, sport, skill_level)
SELECT id, 'football', 'intermediate'
FROM profiles
WHERE username LIKE 'player%';
```

2. Trigger the function manually (see above)

3. Verify the results:
```sql
-- Should have created groups
SELECT * FROM groups WHERE sport = 'football';

-- Should have group members
SELECT g.id, COUNT(gm.user_id) as member_count
FROM groups g
JOIN group_members gm ON g.id = gm.group_id
GROUP BY g.id;

-- Should have assigned captains
SELECT * FROM groups WHERE captain_id IS NOT NULL;

-- Should have created events
SELECT * FROM events WHERE source = 'matched';

-- Should have sent notifications
SELECT * FROM notifications WHERE type = 'match_found';
```

## Verification

To verify the pg_cron schedule is active:

```sql
-- Check if pg_cron extension is enabled
SELECT * FROM pg_extension WHERE extname = 'pg_cron';

-- Check scheduled jobs
SELECT * FROM cron.job WHERE jobname = 'match-users-every-5-minutes';

-- Check job run history
SELECT * FROM cron.job_run_details 
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'match-users-every-5-minutes')
ORDER BY start_time DESC
LIMIT 10;
```

## Error Handling

- **Missing environment variables**: Returns 500 with error message
- **Query failure**: Returns 500 with error details
- **AI service unavailable**: Logs warning and proceeds without AI scores (graceful degradation)
- **Group creation failure**: Logs error and continues with next group
- **Captain selection failure**: Logs error but group is still created
- **Notification failure**: Logs error but core matching logic has succeeded

## Deployment

The function is automatically deployed when you:

1. Push the code to the repository
2. Run `supabase functions deploy match-users` (manual deployment)
3. Apply the migration `20240001000006_pg_cron_schedules.sql` to set up the schedule

## Monitoring

Check the function logs:

```bash
# Production (via dashboard)
# Navigate to: Edge Functions → match-users → Logs
```

Monitor pg_cron execution:

```sql
-- Check recent job runs
SELECT 
  jobname,
  start_time,
  end_time,
  status,
  return_message
FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'match-users-every-5-minutes')
ORDER BY start_time DESC
LIMIT 20;
```

## Related Files

- `supabase/functions/match-users/index.ts` — Main function implementation
- `supabase/functions/match-users/captainSelector.ts` — Captain selection logic
- `supabase/functions/match-users/types.ts` — TypeScript type definitions
- `supabase/migrations/20240001000006_pg_cron_schedules.sql` — pg_cron schedule setup
- `supabase/migrations/20240001000002_groups_events.sql` — groups and events table schema
- `supabase/migrations/20240001000003_messages_notifications_polls_queue.sql` — matching_queue and notifications tables

## Algorithm Details

### Matching Algorithm

The matching engine uses a greedy proximity + skill clustering algorithm:

1. **Seed selection**: Pick the first unassigned candidate as a "seed"
2. **Cluster formation**: Collect all unassigned candidates within 10 km of the seed with compatible skill levels
3. **Group formation**: Greedily fill a group up to max_size from the cluster
4. **Validation**: If cluster has ≥ min_size members, form a group; otherwise, queue them
5. **Iteration**: Repeat until no unassigned candidates remain

### AI Integration

When `AI_BASE_URL` is configured:

1. **Pairwise scoring**: Request compatibility scores for all candidate pairs
2. **Re-ranking**: Sort candidates by average compatibility score
3. **Graceful degradation**: If AI is unavailable (timeout, error), proceed with original order
4. **Timeout**: AI requests timeout after 3 seconds

### Captain Selection

Captain selection uses weighted random selection:

1. **History check**: Query last 3 captain assignments for each candidate
2. **Weight adjustment**: Reduce probability for users with recent captain history
3. **Random selection**: Select captain using weighted random algorithm
4. **Notification**: Send "You are the captain" notification to selected user
5. **History update**: Record captain assignment in `captain_history` table

## Performance Considerations

- **Target execution time**: ≤ 5 seconds per run (Requirement 7.8)
- **Proximity calculation**: Uses Haversine formula (JavaScript) instead of PostGIS for Edge Function compatibility
- **AI timeout**: 3 seconds to prevent blocking (Requirement 14.3)
- **Batch operations**: Uses batch inserts for notifications and group members
- **Transaction safety**: Each group creation is independent to prevent cascading failures

## Future Improvements

- [ ] Implement PostGIS RPC function for server-side proximity filtering
- [ ] Add caching for AI compatibility scores
- [ ] Implement more sophisticated matching algorithms (e.g., stable matching)
- [ ] Add metrics and monitoring for matching success rates
- [ ] Support for multi-sport groups
- [ ] Time-window based matching (match users with overlapping availability windows)
