import { describe, expect, it } from "vitest"

import {
  buildRateLimitKey,
  consumeRateLimit,
  type RateLimiterDefinition,
} from "@/server/rate-limit"

function createTestLimiter(): RateLimiterDefinition {
  return {
    keyPrefix: `test_${crypto.randomUUID()}`,
    points: 2,
    duration: 60,
    blockDuration: 60,
  }
}

describe("buildRateLimitKey", () => {
  it("delimits parts so adjacent strings do not collide", () => {
    expect(buildRateLimitKey("ab", "c")).not.toBe(buildRateLimitKey("a", "bc"))
  })
})

describe("consumeRateLimit", () => {
  it("fails closed for an overweight consume", async () => {
    const result = await consumeRateLimit(
      createTestLimiter(),
      crypto.randomUUID(),
      3,
    )

    expect(result.allowed).toBe(false)
    expect(result.remainingPoints).toBe(0)
    expect(result.msBeforeNext).toBeGreaterThan(0)
  })
})
