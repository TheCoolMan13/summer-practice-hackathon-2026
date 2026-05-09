# Re-engagement Users Edge Function

## Overview

The `reengage-users` Edge Function identifies inactive users and sends personalized re-engagement notifications to encourage them to return to the platform.

## Requirements

- **15.1**: Trigger re-engagement for users with no availability declaration for 5+ consecutive days
- **15.2**: Generate personalized messages using AI based on user sport preferences and activity history
- **15.3**: Fall back to generic message when AI is unavailable
- **15.4**: Rate limit: maximum one re-engagement notification per user per 48-hour period

## Trigger

This function is triggered by `pg_cron` daily at 10:00 AM UTC.

## Logic Flow

1. **Query Inactive Users**
   - Find users with no availability record in the last 5 days
   - Exclude users who received a re-engagement notification within the last 48 hours
   - Exclude users without sport preferences

2. **Generate Messages**
   - For each inactive user, attempt to call AI service `POST /generate-message`
   - If AI is available and returns a message, use the personalized message
   - If AI is unavailable or fails, use generic fallback: "It's been a while — ready to ShowUp2Move today?"

3. **Send Notifications**
   - Insert notifications into the `notifications` table with type `re_engagement`
   - Include user's sports and last activity date in the notification data

4. **Return Summary**
   - Return count of notifications sent
   - Return count of AI-generated vs. generic fallback messages

## Environment Variables

- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Service role key for bypassing RLS
- `AI_BASE_URL`: (Optional) Base URL of the AI microservice

## Database Dependencies

### Tables
- `profiles`: User profiles
- `availability`: User availability records
- `user_sports`: User sport preferences
- `notifications`: Notification records

### RPC Functions
- `get_inactive_users_for_reengagement(inactivity_cutoff, rate_limit_cutoff)`: Efficiently queries eligible users

## Testing

Run unit tests:
```bash
npm test -- supabase/functions/reengage-users/index.test.ts
```

## Manual Trigger

To manually trigger the function (requires service role key):

```bash
curl -X POST \
  http://127.0.0.1:54321/functions/v1/reengage-users \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

## Response Format

### Success Response
```json
{
  "message": "Re-engagement notifications sent successfully",
  "count": 5,
  "ai_generated": 3,
  "generic_fallback": 2
}
```

### No Inactive Users
```json
{
  "message": "No inactive users to re-engage",
  "count": 0
}
```

### Error Response
```json
{
  "error": "Failed to query inactive users",
  "details": "error message"
}
```

## Rate Limiting

The function enforces a 48-hour rate limit at the query level. Users who received a re-engagement notification within the last 48 hours are excluded from the inactive users query.

## AI Graceful Degradation

When the AI service is unavailable:
- The function logs a warning
- Falls back to the generic message
- Continues processing all users
- Returns success with `generic_fallback` count

This ensures core functionality (sending re-engagement notifications) is never blocked by AI service failures.

## Future Enhancements (Task 21.2)

Task 21.2 will implement 7-day suppression after a user declares availability:
- When a user declares availability, set a suppression flag
- The `get_inactive_users_for_reengagement` RPC will respect this flag
- No re-engagement notifications will be sent for 7 days after availability declaration
