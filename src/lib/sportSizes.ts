// Feature: show-up-2-move
// Shared sport size constants.
// Mirrors SPORT_SIZES in supabase/functions/match-users/index.ts.
// Requirements: 7.1, 7.2, 16.3

export interface SportSize {
  min: number
  max: number
}

export const SPORT_SIZES: Record<string, SportSize> = {
  football: { min: 10, max: 14 },
  basketball: { min: 6, max: 10 },
  tennis: { min: 2, max: 4 },
  volleyball: { min: 8, max: 12 },
}

/**
 * Returns the minimum group size for a sport, or `undefined` if the sport is
 * not known. Callers should treat unknown sports conservatively (e.g. skip
 * the below-min check).
 */
export function minSizeFor(sport: string): number | undefined {
  return SPORT_SIZES[sport]?.min
}
