import { describe, expect, it } from "vitest"

import { createShutdown } from "@/server/shutdown"

const never = () => new Promise<void>(() => undefined)

describe("createShutdown", () => {
  it("closes the listener, runs the close hook, then exits cleanly", async () => {
    const calls: string[] = []
    const shutdown = createShutdown({
      close: async () => {
        calls.push("close")
      },
      beforeExit: async () => {
        calls.push("hook")
      },
      exit: (code) => {
        calls.push(`exit:${code}`)
      },
    })

    await shutdown("SIGTERM")

    expect(calls).toEqual(["close", "hook", "exit:0"])
  })

  it("exits after the grace period when in-flight requests never finish", async () => {
    const calls: string[] = []
    const shutdown = createShutdown({
      close: never,
      beforeExit: async () => {
        calls.push("hook")
      },
      exit: (code) => {
        calls.push(`exit:${code}`)
      },
      graceMs: 20,
    })

    await shutdown("SIGTERM")

    expect(calls).toEqual(["hook", "exit:0"])
  })

  it("still exits when closing the listener fails", async () => {
    const exits: number[] = []
    const shutdown = createShutdown({
      close: () => Promise.reject(new Error("listener broke")),
      exit: (code) => {
        exits.push(code)
      },
    })

    await shutdown("SIGINT")

    expect(exits).toEqual([1])
  })

  it("exits immediately on a second signal while shutting down", async () => {
    const exits: number[] = []
    const shutdown = createShutdown({
      close: never,
      exit: (code) => {
        exits.push(code)
      },
      graceMs: 50,
    })

    const first = shutdown("SIGTERM")
    await shutdown("SIGINT")
    expect(exits).toEqual([1])

    await first
    expect(exits).toEqual([1, 0])
  })
})
