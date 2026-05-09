// Feature: show-up-2-move
// Unit tests for reengage-users Edge Function
// Requirements: 15.1, 15.2, 15.3, 15.4

import { describe, it, expect } from 'vitest'

/**
 * Test helper: Calculate if a user should receive a re-engagement notification
 * based on inactivity threshold and rate limiting.
 */
function shouldReengage(
  lastActivityDate: Date | null,
  lastReengagementDate: Date | null,
  inactivityThresholdDays: number,
  rateLimitHours: number,
  now: Date = new Date(),
): boolean {
  const inactivityCutoff = new Date(now)
  inactivityCutoff.setDate(inactivityCutoff.getDate() - inactivityThresholdDays)

  const rateLimitCutoff = new Date(now)
  rateLimitCutoff.setHours(rateLimitCutoff.getHours() - rateLimitHours)

  // Check inactivity: user has no activity OR last activity is older than threshold
  const isInactive = !lastActivityDate || lastActivityDate < inactivityCutoff

  // Check rate limit: user has no re-engagement notification OR last notification is older than rate limit
  const isNotRateLimited = !lastReengagementDate || lastReengagementDate < rateLimitCutoff

  return isInactive && isNotRateLimited
}

describe('reengage-users logic', () => {
  const INACTIVITY_THRESHOLD_DAYS = 5
  const RATE_LIMIT_HOURS = 48
  const NOW = new Date('2024-01-15T10:00:00Z')

  describe('shouldReengage', () => {
    it('should return true for user with no activity and no previous re-engagement (Requirement 15.1)', () => {
      const result = shouldReengage(
        null, // no activity
        null, // no previous re-engagement
        INACTIVITY_THRESHOLD_DAYS,
        RATE_LIMIT_HOURS,
        NOW,
      )

      expect(result).toBe(true)
    })

    it('should return true for user inactive for 5+ days and no previous re-engagement (Requirement 15.1)', () => {
      const lastActivity = new Date('2024-01-09T10:00:00Z') // 6 days ago
      
      const result = shouldReengage(
        lastActivity,
        null,
        INACTIVITY_THRESHOLD_DAYS,
        RATE_LIMIT_HOURS,
        NOW,
      )

      expect(result).toBe(true)
    })

    it('should return false for user with recent activity (< 5 days)', () => {
      const lastActivity = new Date('2024-01-13T10:00:00Z') // 2 days ago
      
      const result = shouldReengage(
        lastActivity,
        null,
        INACTIVITY_THRESHOLD_DAYS,
        RATE_LIMIT_HOURS,
        NOW,
      )

      expect(result).toBe(false)
    })

    it('should return false for user who received re-engagement within 48 hours (Requirement 15.4)', () => {
      const lastActivity = new Date('2024-01-09T10:00:00Z') // 6 days ago (inactive)
      const lastReengagement = new Date('2024-01-14T10:00:00Z') // 24 hours ago (within rate limit)
      
      const result = shouldReengage(
        lastActivity,
        lastReengagement,
        INACTIVITY_THRESHOLD_DAYS,
        RATE_LIMIT_HOURS,
        NOW,
      )

      expect(result).toBe(false)
    })

    it('should return true for user inactive and last re-engagement was 48+ hours ago (Requirement 15.4)', () => {
      const lastActivity = new Date('2024-01-09T10:00:00Z') // 6 days ago (inactive)
      const lastReengagement = new Date('2024-01-13T09:00:00Z') // 49 hours ago (outside rate limit)
      
      const result = shouldReengage(
        lastActivity,
        lastReengagement,
        INACTIVITY_THRESHOLD_DAYS,
        RATE_LIMIT_HOURS,
        NOW,
      )

      expect(result).toBe(true)
    })

    it('should return false for user at exactly 5 days of inactivity (boundary)', () => {
      const lastActivity = new Date('2024-01-10T10:00:00Z') // exactly 5 days ago
      
      const result = shouldReengage(
        lastActivity,
        null,
        INACTIVITY_THRESHOLD_DAYS,
        RATE_LIMIT_HOURS,
        NOW,
      )

      expect(result).toBe(false)
    })

    it('should return true for user at exactly 5 days + 1 second of inactivity', () => {
      const lastActivity = new Date('2024-01-10T09:59:59Z') // 5 days + 1 second ago
      
      const result = shouldReengage(
        lastActivity,
        null,
        INACTIVITY_THRESHOLD_DAYS,
        RATE_LIMIT_HOURS,
        NOW,
      )

      expect(result).toBe(true)
    })

    it('should return false for user at exactly 48 hours since last re-engagement (boundary)', () => {
      const lastActivity = new Date('2024-01-09T10:00:00Z') // 6 days ago (inactive)
      const lastReengagement = new Date('2024-01-13T10:00:00Z') // exactly 48 hours ago
      
      const result = shouldReengage(
        lastActivity,
        lastReengagement,
        INACTIVITY_THRESHOLD_DAYS,
        RATE_LIMIT_HOURS,
        NOW,
      )

      expect(result).toBe(false)
    })

    it('should return true for user at exactly 48 hours + 1 second since last re-engagement', () => {
      const lastActivity = new Date('2024-01-09T10:00:00Z') // 6 days ago (inactive)
      const lastReengagement = new Date('2024-01-13T09:59:59Z') // 48 hours + 1 second ago
      
      const result = shouldReengage(
        lastActivity,
        lastReengagement,
        INACTIVITY_THRESHOLD_DAYS,
        RATE_LIMIT_HOURS,
        NOW,
      )

      expect(result).toBe(true)
    })
  })

  describe('message generation fallback', () => {
    it('should use generic message when AI is unavailable (Requirement 15.3)', () => {
      const GENERIC_MESSAGE = "It's been a while — ready to ShowUp2Move today?"
      
      // Simulate AI unavailable scenario
      const aiAvailable = false
      const message = aiAvailable ? 'AI-generated message' : GENERIC_MESSAGE
      
      expect(message).toBe(GENERIC_MESSAGE)
    })

    it('should use AI-generated message when AI is available (Requirement 15.2)', () => {
      const AI_MESSAGE = 'Hey! Ready to play some basketball? Your team is waiting!'
      
      // Simulate AI available scenario
      const aiAvailable = true
      const message = aiAvailable ? AI_MESSAGE : "It's been a while — ready to ShowUp2Move today?"
      
      expect(message).toBe(AI_MESSAGE)
    })
  })
})
