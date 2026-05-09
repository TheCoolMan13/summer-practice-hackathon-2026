// Feature: show-up-2-move
// Shared TypeScript types for the match-users Edge Function matching engine.

/** A candidate user fetched from the database, ready for matching. */
export interface Candidate {
  user_id: string;
  location_lat: number | null;
  location_lng: number | null;
  sport: string;
  skill_level: string | null;
}

/** Sport size constraints (min/max group members). */
export interface SportSize {
  min: number;
  max: number;
}

/** A formed group of user IDs for a specific sport. */
export interface FormedGroup {
  sport: string;
  members: string[];
}

/** Result returned by the matching engine handler. */
export interface MatchResult {
  formedGroups: FormedGroup[];
  queuedUsers: { user_id: string; sport: string }[];
}
