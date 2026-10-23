import { describe, expect, it } from "vitest"

import { interpolatePlaceholders } from "@/lib/placeholders"

describe("interpolatePlaceholders", () => {
  it("does not resolve inherited Object.prototype members", () => {
    expect(
      interpolatePlaceholders("{{constructor}} {{toString}} {{valueOf}}", {}),
    ).toBe("{{constructor}} {{toString}} {{valueOf}}")
  })
})
