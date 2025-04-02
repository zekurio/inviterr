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
  createUser: publicProcedure
    .input(createUserSchema)
    .mutation(async ({ ctx, input }) => {
      const { username, password } = input;

      let jfUser = await ctx.jellyfinClient.getUserByName(username);

			if (jfUser) {
				throw new TRPCError({ code: "CONFLICT", message: "User already exists" });
			}

			const req: UserApiCreateUserByNameRequest = {
        createUserByName: {
          Name: username,
          Password: password
        }
      };

			const res = await ctx.jellyfinClient.userApi.createUserByName(req);

			if (!res.data) {
				throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create user" });
			}

			jfUser = res.data;

			// create user
			const user = await ctx.db.account.create({
				data: {
					userId: jfUser.Id,
					type: "credentials",
					
				},
			});

			return user;
    }),

    // query 
});
