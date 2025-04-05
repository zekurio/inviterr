import { createCallerFactory, createTRPCRouter } from "@/server/api/trpc";
import { invitesRouter } from "./routers/invites";
import { profilesRouter } from "./routers/profiles";
import { jellyfinRouter } from "./routers/jellyfin";
import { accountsRouter } from "./routers/accounts";

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

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.post.all();
 *       ^? Post[]
 */
export const createCaller = createCallerFactory(appRouter);
