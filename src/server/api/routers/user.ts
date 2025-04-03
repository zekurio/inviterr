import { z } from "zod";
import { createTRPCRouter, publicProcedure, protectedProcedure } from "@/server/api/trpc";
import { TRPCError } from "@trpc/server";
import type { UserApiCreateUserByNameRequest } from "@jellyfin/sdk/lib/generated-client/api/user-api";

// Schema for user creation for Jellyfin
const createUserSchema = z.object({
  username: z.string(),
  password: z.string(),
});

export const userRouter = createTRPCRouter({

});
