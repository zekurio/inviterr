import { createTRPCRouter } from "@/server/api/trpc";
import { invitesRouter } from "@/server/api/routers/invites";
import { profilesRouter } from "@/server/api/routers/profiles";
import { jellyfinRouter } from "@/server/api/routers/jellyfin";
import { accountsRouter } from "@/server/api/routers/accounts";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  invites: invitesRouter,
  profiles: profilesRouter,
  jellyfin: jellyfinRouter,
  accounts: accountsRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
