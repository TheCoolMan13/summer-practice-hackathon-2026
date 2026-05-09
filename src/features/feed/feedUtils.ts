// Feature: show-up-2-move
// Feed utility functions — client-side distance calculation

/**
 * Haversine formula: calculates the great-circle distance between two
 * geographic coordinates in kilometres.
 *
 * Used for client-side distance filtering because PostgREST does not expose
 * ST_DWithin directly from the browser client. (Requirement 5.3)
 *
 * @param lat1 - Latitude of point A in decimal degrees
 * @param lng1 - Longitude of point A in decimal degrees
 * @param lat2 - Latitude of point B in decimal degrees
 * @param lng2 - Longitude of point B in decimal degrees
 * @returns Distance in kilometres
 */
export function haversineDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371 // Earth's mean radius in km
  const toRad = (deg: number) => (deg * Math.PI) / 180

  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

/**
 * Returns true when the event location is within `radiusKm` of the user's
 * position, or when either coordinate set is missing (no filter applied).
 */
export function isWithinRadius(
  userLat: number | undefined,
  userLng: number | undefined,
  eventLat: number | null,
  eventLng: number | null,
  radiusKm: number | undefined,
): boolean {
  // If no radius filter or no user location, include the event
  if (radiusKm === undefined || userLat === undefined || userLng === undefined) {
    return true
  }
  // If the event has no location coordinates, exclude it when a radius is set
  if (eventLat === null || eventLng === null) {
    return false
  }
  return haversineDistanceKm(userLat, userLng, eventLat, eventLng) <= radiusKm
}
