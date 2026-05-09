// Feature: show-up-2-move
// Unit tests for reassign-captain Edge Function
// Requirements: 8.4, 16.4

import { describe, it, expect } from 'vitest'

// ============================================================
// Mock captain selection logic (extracted for testing)
// ============================================================

/**
 * Calculate weights for captain selection.
 * Base weight: 3
 * Reduce by 1 for each of the last 3 captain_history entries.
 */
function calculateWeights(
  memberIds: string[],
  recentCaptainCount: Record<string, number>,
  currentCaptainId: string,
): { userId: string; weight: number }[] {
  const eligibleMembers = memberIds.filter((id) => id !== currentCaptainId)

  const weights = eligibleMembers.map((id) => ({
    userId: id,
    weight: Math.max(0, 3 - (recentCaptainCount[id] ?? 0)),
  }))

  // If all weights are 0, reset to equal weights
  const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0)
  return totalWeight === 0
    ? eligibleMembers.map((id) => ({ userId: id, weight: 1 }))
    : weights
}

// ============================================================
// Tests
// ============================================================

describe('reassign-captain: captain selection logic', () => {
  it('should exclude the current captain from selection', () => {
    const memberIds = ['user1', 'user2', 'user3']
    const recentCaptainCount = {}
    const currentCaptainId = 'user1'

    const weights = calculateWeights(memberIds, recentCaptainCount, currentCaptainId)

    expect(weights).toHaveLength(2)
    expect(weights.map((w) => w.userId)).not.toContain('user1')
    expect(weights.map((w) => w.userId)).toContain('user2')
    expect(weights.map((w) => w.userId)).toContain('user3')
  })

  it('should assign base weight of 3 to users with no recent captain history', () => {
    const memberIds = ['user1', 'user2', 'user3']
    const recentCaptainCount = {}
    const currentCaptainId = 'user1'

    const weights = calculateWeights(memberIds, recentCaptainCount, currentCaptainId)

    expect(weights).toEqual([
      { userId: 'user2', weight: 3 },
      { userId: 'user3', weight: 3 },
    ])
  })

  it('should reduce weight by 1 for each recent captain entry', () => {
    const memberIds = ['user1', 'user2', 'user3', 'user4']
    const recentCaptainCount = {
      user2: 1, // was captain once recently → weight 2
      user3: 2, // was captain twice recently → weight 1
      user4: 3, // was captain 3 times recently → weight 0
    }
    const currentCaptainId = 'user1'

    const weights = calculateWeights(memberIds, recentCaptainCount, currentCaptainId)

    expect(weights).toEqual([
      { userId: 'user2', weight: 2 },
      { userId: 'user3', weight: 1 },
      { userId: 'user4', weight: 0 },
    ])
  })

  it('should reset to equal weights when all weights are 0', () => {
    const memberIds = ['user1', 'user2', 'user3']
    const recentCaptainCount = {
      user2: 3, // weight 0
      user3: 3, // weight 0
    }
    const currentCaptainId = 'user1'

    const weights = calculateWeights(memberIds, recentCaptainCount, currentCaptainId)

    expect(weights).toEqual([
      { userId: 'user2', weight: 1 },
      { userId: 'user3', weight: 1 },
    ])
  })

  it('should handle single eligible member (current captain excluded)', () => {
    const memberIds = ['user1', 'user2']
    const recentCaptainCount = {}
    const currentCaptainId = 'user1'

    const weights = calculateWeights(memberIds, recentCaptainCount, currentCaptainId)

    expect(weights).toEqual([{ userId: 'user2', weight: 3 }])
  })

  it('should handle no eligible members (only current captain)', () => {
    const memberIds = ['user1']
    const recentCaptainCount = {}
    const currentCaptainId = 'user1'

    const weights = calculateWeights(memberIds, recentCaptainCount, currentCaptainId)

    expect(weights).toEqual([])
  })

  it('should prefer users with lower recent captain count', () => {
    const memberIds = ['user1', 'user2', 'user3', 'user4']
    const recentCaptainCount = {
      user2: 0, // weight 3 (highest)
      user3: 1, // weight 2
      user4: 2, // weight 1 (lowest)
    }
    const currentCaptainId = 'user1'

    const weights = calculateWeights(memberIds, recentCaptainCount, currentCaptainId)

    // user2 should have the highest weight
    const user2Weight = weights.find((w) => w.userId === 'user2')?.weight
    const user3Weight = weights.find((w) => w.userId === 'user3')?.weight
    const user4Weight = weights.find((w) => w.userId === 'user4')?.weight

    expect(user2Weight).toBeGreaterThan(user3Weight!)
    expect(user3Weight).toBeGreaterThan(user4Weight!)
  })
})

describe('reassign-captain: edge cases', () => {
  it('should handle empty member list', () => {
    const memberIds: string[] = []
    const recentCaptainCount = {}
    const currentCaptainId = 'user1'

    const weights = calculateWeights(memberIds, recentCaptainCount, currentCaptainId)

    expect(weights).toEqual([])
  })

  it('should handle missing captain history data', () => {
    const memberIds = ['user1', 'user2', 'user3']
    const recentCaptainCount = {
      user2: 1,
      // user3 has no entry → should default to 0
    }
    const currentCaptainId = 'user1'

    const weights = calculateWeights(memberIds, recentCaptainCount, currentCaptainId)

    expect(weights).toEqual([
      { userId: 'user2', weight: 2 },
      { userId: 'user3', weight: 3 }, // no history → full weight
    ])
  })
})
