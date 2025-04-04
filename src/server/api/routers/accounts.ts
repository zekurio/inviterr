import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { TRPCError } from "@trpc/server";

// Input validation schema for account creation
const createAccountSchema = z.object({
  username: z
    .string()
    .min(1, "Username is required")
    .max(12, "Username cannot be longer than 12 characters")
    .regex(/^[a-zA-Z0-9]+$/, "Username must be alphanumeric"),
  password: z
    .string()
    .min(12, "Password must be at least 12 characters long")
    .max(24, "Password cannot be longer than 24 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(
      /[^A-Za-z0-9]/,
      "Password must contain at least one special character",
    ),
});

const applyPolicySchema = z.object({
  userId: z.string(),
  templateId: z.string(),
});

export const accountsRouter = createTRPCRouter({
  create: publicProcedure
    .input(createAccountSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        // Use the Jellyfin API client to create the new user
        const newUserResponse =
          await ctx.jellyfinClient.userApi.createUserByName({
            createUserByName: {
              Name: input.username,
              Password: input.password,
            },
          });

        // Check if user creation was successful
        if (newUserResponse.data?.Id && newUserResponse.data?.Name) {
          const userId = newUserResponse.data.Id;

          // Apply default policy to the newly created user
          try {
            // Get the user's current policy
            const userResponse = await ctx.jellyfinClient.userApi.getUserById({
              userId: userId,
            });

            if (userResponse.data?.Policy) {
              const userPolicy = userResponse.data.Policy;

              // Apply the policy updates
              await ctx.jellyfinClient.userApi.updateUserPolicy({
                userId: userId,
                userPolicy: userPolicy,
              });
            }
          } catch (policyError: any) {
            console.error("Failed to apply policy to new user:", policyError);
            // Continue with user creation even if policy application fails
          }

          return {
            id: userId,
            username: newUserResponse.data.Name,
          };
        } else {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message:
              "Failed to create Jellyfin account: Unexpected response from server.",
          });
        }
      } catch (error: any) {
        // Log the specific error from the Jellyfin client
        console.error("Failed to create Jellyfin user:", error);

        if (
          error?.response?.status === 400 &&
          error?.message?.includes("already exists")
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `Username '${input.username}' already exists on Jellyfin.`,
          });
        }

        // Generic error for other issues
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          // Potentially include parts of the Jellyfin error message if safe
          message:
            `Failed to create Jellyfin account. ${error.message ?? ""}`.trim(),
        });
      }
    }),
});
