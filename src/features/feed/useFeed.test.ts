// Feature: show-up-2-move
// Unit tests for feed utility functions
// Requirements: 5.1, 5.2, 5.3, 5.4

import { describe, it, expect } from 'vitest'
import { haversineDistanceKm, isWithinRadius } from './feedUtils'

describe('feedUtils', () => {
  describe('haversineDistanceKm', () => {
    it('should calculate distance between two points correctly', () => {
      // Distance between New York City and Los Angeles (approx 3936 km)
      const nyLat = 40.7128
      const nyLng = -74.0060
      const laLat = 34.0522
      const laLng = -118.2437

      const distance = haversineDistanceKm(nyLat, nyLng, laLat, laLng)
      
      // Allow for some rounding error
      expect(distance).toBeGreaterThan(3900)
      expect(distance).toBeLessThan(4000)
    })

    it('should return 0 for identical coordinates', () => {
      const lat = 40.7128
      const lng = -74.0060

      const distance = haversineDistanceKm(lat, lng, lat, lng)
      
      expect(distance).toBe(0)
    })

    it('should calculate short distances accurately', () => {
      // Two points about 1 km apart in Central Park, NYC
      const lat1 = 40.785091
      const lng1 = -73.968285
      const lat2 = 40.794891
      const lng2 = -73.968285

      const distance = haversineDistanceKm(lat1, lng1, lat2, lng2)
      
      // Should be approximately 1.09 km
      expect(distance).toBeGreaterThan(1.0)
      expect(distance).toBeLessThan(1.2)
    })
  })

  describe('isWithinRadius', () => {
    it('should return true when event is within radius (Requirement 5.3)', () => {
      const userLat = 40.785091
      const userLng = -73.968285
      const eventLat = 40.794891
      const eventLng = -73.968285
      const radiusKm = 5

      const result = isWithinRadius(userLat, userLng, eventLat, eventLng, radiusKm)
      
      expect(result).toBe(true)
    })

    it('should return false when event is outside radius (Requirement 5.3)', () => {
      const userLat = 40.785091
      const userLng = -73.968285
      const eventLat = 40.758896
      const eventLng = -73.985130
      const radiusKm = 1

      const result = isWithinRadius(userLat, userLng, eventLat, eventLng, radiusKm)
      
      expect(result).toBe(false)
    })

    it('should return true when no radius filter is provided', () => {
      const userLat = 40.785091
      const userLng = -73.968285
      const eventLat = 34.0522
      const eventLng = -118.2437
      const radiusKm = undefined

      const result = isWithinRadius(userLat, userLng, eventLat, eventLng, radiusKm)
      
      expect(result).toBe(true)
    })

    it('should return true when user location is not provided', () => {
      const userLat = undefined
      const userLng = undefined
      const eventLat = 40.785091
      const eventLng = -73.968285
      const radiusKm = 10

      const result = isWithinRadius(userLat, userLng, eventLat, eventLng, radiusKm)
      
      expect(result).toBe(true)
    })

    it('should return false when event has no location and radius is set', () => {
      const userLat = 40.785091
      const userLng = -73.968285
      const eventLat = null
      const eventLng = null
      const radiusKm = 10

      const result = isWithinRadius(userLat, userLng, eventLat, eventLng, radiusKm)
      
      expect(result).toBe(false)
    })

    it('should return true when event has no location and no radius is set', () => {
      const userLat = 40.785091
      const userLng = -73.968285
      const eventLat = null
      const eventLng = null
      const radiusKm = undefined

      const result = isWithinRadius(userLat, userLng, eventLat, eventLng, radiusKm)
      
      expect(result).toBe(true)
    })
  })
})
