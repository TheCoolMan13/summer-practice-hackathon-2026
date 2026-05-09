# AI Compatibility Scoring Integration (Task 8.2)

## Overview

This document describes the AI compatibility scoring integration implemented in the `match-users` Edge Function as part of Task 8.2.

## Implementation Summary

The AI compatibility scoring feature has been fully implemented with the following components:

### 1. `getCompatibilityScores()` Function

**Location:** `supabase/functions/match-users/index.ts` (lines 108-175)

**Purpose:** Fetches pairwise compatibility scores from the AI microservice for all candidate pairs.

**Key Features:**
- Calls `POST {AI_BASE_URL}/profile-compatibility` for each unique pair of candidates
- Uses a 3-second timeout (`AI_TIMEOUT_MS = 3000`) per Requirement 14.3
- Returns a `Map<string, number>` keyed by `"userId1:userId2"` with scores in [0, 1]
- **Graceful Degradation:** Returns an empty Map on any failure (timeout, non-200, network error)
- Handles partial failures: if some pairs fail, returns scores for successful pairs

**Request Format:**
```json
{
  "user_ids": ["user1_id", "user2_id"]
}
```

**Expected Response:**
```json
{
  "score": 0.87
}
```

### 2. `rankCandidatesByCompatibility()` Function

**Location:** `supabase/functions/match-users/index.ts` (lines 177-215)

**Purpose:** Re-ranks candidates by their average pairwise compatibility score.

**Algorithm:**
1. For each candidate, compute the average compatibility score with all other candidates
2. Sort candidates in descending order by average score
3. Higher-compatibility users are placed first, so `formGroups()` seeds clusters from the most compatible users

**Graceful Degradation:** When the scores map is empty (AI unavailable), preserves the original candidate order.

### 3. Integration in Main Handler

**Location:** `supabase/functions/match-users/index.ts` (lines 530-545)

**Flow:**
1. Query active available users grouped by sport
2. **Check for `AI_BASE_URL` environment variable**
3. If AI is configured:
   - Call `getCompatibilityScores()` for each sport's candidate pool
   - If scores are returned, call `rankCandidatesByCompatibility()` to re-rank
   - If scores map is empty, log a warning and proceed with original order
4. Continue with proximity + skill clustering using the (possibly re-ranked) candidate list

**Code:**
```typescript
const aiBaseUrl = Deno.env.get('AI_BASE_URL')

for (const sport of Object.keys(bySport)) {
  if (aiBaseUrl) {
    const scores = await getCompatibilityScores(bySport[sport], aiBaseUrl)
    if (scores.size === 0) {
      console.warn(
        `[match-users] AI compatibility scores unavailable for sport "${sport}". ` +
        'Proceeding without AI ranking (graceful degradation).',
      )
    }
    bySport[sport] = rankCandidatesByCompatibility(bySport[sport], scores)
  }
}
```

## Configuration

### Environment Variables

The AI compatibility scoring feature requires the following environment variable to be set in the Supabase Edge Function environment:

- **`AI_BASE_URL`**: Base URL of the AI microservice (e.g., `http://ai:8000` or `https://ai.example.com`)

**How to set:**

1. **Local Development (Supabase CLI):**
   ```bash
   # Create or edit supabase/.env.local
   echo "AI_BASE_URL=http://localhost:8000" >> supabase/.env.local
   ```

2. **Production (Supabase Dashboard):**
   - Navigate to Project Settings → Edge Functions → Environment Variables
   - Add `AI_BASE_URL` with your production AI service URL

3. **Supabase CLI Secrets:**
   ```bash
   supabase secrets set AI_BASE_URL=https://ai.example.com
   ```

### Graceful Degradation Behavior

When `AI_BASE_URL` is **not set** or the AI service is **unavailable**:

1. The matching engine proceeds without AI compatibility scores
2. Candidates are matched using only:
   - Sport preference
   - Location proximity (10 km radius)
   - Skill level compatibility (within one tier)
3. A warning is logged: `"AI compatibility scores unavailable for sport X. Proceeding without AI ranking (graceful degradation)."`
4. **No errors are thrown** — the system continues to function normally

This satisfies **Requirements 7.5 and 14.3**: AI enhances matching but never blocks core functionality.

## Requirements Validation

### Requirement 7.5
> WHEN the AI_Service is available, THE Matching_Engine SHALL request compatibility scores from `POST /profile-compatibility` and use them as a secondary ranking signal; WHEN the AI_Service is unavailable, THE Matching_Engine SHALL proceed with matching using only sport, availability, location, and skill criteria.

**Status:** ✅ **Implemented**
- AI scores are requested when `AI_BASE_URL` is set
- Scores are used to re-rank candidates before forming groups
- When AI is unavailable, matching proceeds with proximity + skill only

### Requirement 14.3
> WHILE the AI_Service is marked unavailable, THE backend SHALL continue to serve profile creation, availability declaration, matching, group chat, event creation, and notifications without interruption.

**Status:** ✅ **Implemented**
- Empty scores map triggers graceful degradation
- 3-second timeout prevents blocking
- Matching engine continues without AI scores

## Testing

### Manual Testing

To manually test the AI compatibility scoring integration:

1. **Start the AI microservice** (if available) on the configured `AI_BASE_URL`
2. **Set the `AI_BASE_URL` environment variable** in your Supabase Edge Function environment
3. **Trigger the match-users function:**
   ```bash
   curl -X POST http://localhost:54321/functions/v1/match-users \
     -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY"
   ```
4. **Check the logs** for:
   - AI compatibility score requests
   - Re-ranking messages
   - Graceful degradation warnings (if AI is unavailable)

### Test Scenarios

#### Scenario 1: AI Available
- **Setup:** AI service running, `AI_BASE_URL` set
- **Expected:** Candidates are re-ranked by compatibility scores before forming groups
- **Verification:** Check logs for successful AI calls and re-ranking

#### Scenario 2: AI Unavailable (Service Down)
- **Setup:** AI service not running, `AI_BASE_URL` set
- **Expected:** Warning logged, matching proceeds without AI scores
- **Verification:** Check logs for graceful degradation warning

#### Scenario 3: AI Not Configured
- **Setup:** `AI_BASE_URL` not set
- **Expected:** AI compatibility scoring is skipped entirely
- **Verification:** No AI-related logs, matching proceeds normally

#### Scenario 4: AI Timeout
- **Setup:** AI service responds slowly (>3 seconds)
- **Expected:** Request times out, empty scores map returned, graceful degradation
- **Verification:** Check logs for timeout and graceful degradation warning

## Implementation Notes

### Why Pairwise Scoring?

The implementation calls the AI service for **every unique pair** of candidates in a sport's pool. For N candidates, this results in N*(N-1)/2 API calls.

**Rationale:**
- Provides the most accurate compatibility assessment
- Allows the AI to consider pairwise relationships (e.g., user A and B have similar schedules)
- Enables sophisticated ranking based on average compatibility

**Performance Consideration:**
- For large candidate pools (e.g., 20 users = 190 pairs), this could be slow
- The 3-second timeout applies to the entire batch, not per-pair
- Future optimization: batch scoring endpoint or caching

### Score Storage Format

Scores are stored in a `Map<string, number>` with keys in the format `"userId1:userId2"`.

**Example:**
```typescript
scores.set("user1:user2", 0.87)
scores.set("user1:user3", 0.65)
scores.set("user2:user3", 0.92)
```

The `rankCandidatesByCompatibility()` function handles bidirectional lookups (checks both `"userA:userB"` and `"userB:userA"`).

### Average Compatibility Calculation

For each candidate, the average compatibility score is computed as:

```
avg_score(candidate) = sum(scores with all other candidates) / count(available scores)
```

Candidates with no available scores (all pairs failed) get an average score of 0.

## Future Enhancements

1. **Batch Scoring Endpoint:** Modify the AI service to accept multiple pairs in a single request
2. **Score Caching:** Cache compatibility scores for recently matched users
3. **Weighted Scoring:** Combine AI scores with proximity and skill scores using configurable weights
4. **Async Scoring:** Pre-compute scores for all available users in the background

## Related Files

- `supabase/functions/match-users/index.ts` - Main implementation
- `supabase/functions/match-users/types.ts` - Type definitions
- `.kiro/specs/show-up-2-move/requirements.md` - Requirements 7.5, 14.3
- `.kiro/specs/show-up-2-move/design.md` - Design specification
- `.kiro/specs/show-up-2-move/tasks.md` - Task 8.2 definition

## Status

**Task 8.2: Implement AI compatibility scoring integration** - ✅ **COMPLETE**

All requirements have been implemented:
- ✅ Calls AI microservice `POST /profile-compatibility` for candidate pairs
- ✅ Uses scores as a secondary ranking signal
- ✅ Falls back gracefully when AI is unavailable
- ✅ Respects 3-second timeout
- ✅ Handles partial failures
- ✅ Logs warnings for debugging
