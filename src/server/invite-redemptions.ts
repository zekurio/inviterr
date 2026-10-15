import { eq, lt } from "drizzle-orm"

import { db, ensureMigrated } from "@/server/db"
import { pending_redemptions, users } from "@/server/db/schema"
import { deleteUser, getAllUsers } from "@/server/jellyfin"
import { createChildLogger } from "@/server/logger"

const log = createChildLogger({ module: "invite-redemptions" })

// Long enough that no in-flight redemption is still between its Jellyfin
// create and its local user record when the periodic sweep looks at it.
export const ABANDONED_REDEMPTION_GRACE_MS = 10 * 60 * 1000

export async function beginPendingRedemption(input: {
  inviteId: string
  username: string
}): Promise<string> {
  const id = crypto.randomUUID()
  await db.insert(pending_redemptions).values({
    id,
    invite_id: input.inviteId,
    username: input.username,
    user_id: null,
    started_at: new Date(),
  })
  return id
}

// Best effort: the row still identifies the account by username if this
// write is lost, and the redemption must not fail over bookkeeping.
export async function attachPendingRedemptionUser(
  id: string,
  userId: string,
): Promise<void> {
  try {
    await db
      .update(pending_redemptions)
      .set({ user_id: userId })
      .where(eq(pending_redemptions.id, id))
  } catch (err) {
    log.warn(
      { err, pendingRedemptionId: id, userId },
      "Failed to attach the Jellyfin user to its pending redemption",
    )
  }
}

// Best effort: a leftover row for a recorded account is dropped by the next
// sweep without touching the account.
export async function finishPendingRedemption(id: string): Promise<void> {
  try {
    await db.delete(pending_redemptions).where(eq(pending_redemptions.id, id))
  } catch (err) {
    log.warn(
      { err, pendingRedemptionId: id },
      "Failed to remove the completed pending redemption",
    )
  }
}

// Resolves every pending redemption started before the cutoff. An account
// that matches a row but has no local record never had its outcome
// recorded, so it is removed from Jellyfin; the applicant can simply redeem
// again. The account was never handed to Seerr, since that happens after the
// local record is written. Matching by username only applies while Jellyfin
// never returned the ID, and the username check immediately before the
// create makes that account ours.
export async function cleanupAbandonedRedemptions(options: {
  olderThanMs: number
  now?: Date
}): Promise<void> {
  await ensureMigrated()
  const now = options.now ?? new Date()
  const cutoff = new Date(now.getTime() - options.olderThanMs)
  const abandoned = await db
    .select()
    .from(pending_redemptions)
    .where(lt(pending_redemptions.started_at, cutoff))

  if (abandoned.length === 0) return

  const [jellyfinUsers, recordedUsers] = await Promise.all([
    getAllUsers(),
    db.select({ userId: users.userId }).from(users),
  ])
  const recordedUserIds = new Set(recordedUsers.map((user) => user.userId))

  for (const redemption of abandoned) {
    const account = jellyfinUsers.find((user) =>
      redemption.user_id === null
        ? user.name.toLowerCase() === redemption.username.toLowerCase()
        : user.id === redemption.user_id,
    )

    if (account && !recordedUserIds.has(account.id)) {
      try {
        await deleteUser(account.id)
        log.warn(
          {
            pendingRedemptionId: redemption.id,
            inviteId: redemption.invite_id,
            userId: account.id,
            username: account.name,
          },
          "Removed Jellyfin account left behind by an abandoned invite redemption",
        )
      } catch (err) {
        log.error(
          { err, pendingRedemptionId: redemption.id, userId: account.id },
          "Failed to remove the Jellyfin account of an abandoned invite redemption; retrying on the next pass",
        )
        continue
      }
    }

    await db
      .delete(pending_redemptions)
      .where(eq(pending_redemptions.id, redemption.id))
  }
}
