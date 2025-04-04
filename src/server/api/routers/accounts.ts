import { z } from "zod";
import {
  createTRPCRouter,
  publicProcedure,
  protectedProcedure,
} from "@/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { Jellyfin } from "@jellyfin/sdk";
import type {
  UserDto,
  UpdateUserPassword,
} from "@jellyfin/sdk/lib/generated-client/models";

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

const updateUsernameSchema = z.object({
  newUsername: z
    .string()
    .min(1, "Username is required")
    .max(12, "Username cannot be longer than 12 characters")
    .regex(/^[a-zA-Z0-9]+$/, "Username must be alphanumeric"),
});

const updatePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z
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

  getCurrentUser: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.jellyfin?.id;
    const userEmail = ctx.session.user.email;
    const userImage = ctx.session.user.image;

    if (!userId) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Jellyfin User ID not found in session.",
      });
    }
    if (!userEmail) {
      console.warn("User email not found in session.");
    }
    if (!userImage) {
      console.warn("User image not found in session.");
    }

    try {
      const userResponse = await ctx.jellyfinClient.userApi.getUserById({
        userId: userId,
      });

      if (!userResponse.data) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found on Jellyfin server.",
        });
      }

      return {
        id: userResponse.data.Id,
        username: userResponse.data.Name,
        email: userEmail ?? null,
        image: userImage ?? null,
      };
    } catch (error: any) {
      console.error("Failed to fetch Jellyfin user:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Failed to fetch user details. ${error.message ?? ""}`.trim(),
      });
    }
  }),

  updateUsername: protectedProcedure
    .input(updateUsernameSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.jellyfin?.id;
      if (!userId) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }

      try {
        const userResponse = await ctx.jellyfinClient.userApi.getUserById({
          userId: userId,
        });
        const currentUser = userResponse.data;

        if (!currentUser) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "User not found.",
          });
        }

        const updatedUserDto: UserDto = {
          ...currentUser,
          Name: input.newUsername,
        };

        await ctx.jellyfinClient.userApi.updateUserConfiguration({
          userId: userId,
          userConfiguration: updatedUserDto.Configuration ?? {},
        });

        console.warn(
          "Username update relies on updateUserConfiguration, which may not change the login name.",
        );

        return { success: true, username: input.newUsername };
      } catch (error: any) {
        console.error("Failed to update Jellyfin username:", error);
        if (error?.response?.status === 400) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `Failed to update username. ${error.message ?? ""}`.trim(),
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to update username. ${error.message ?? ""}`.trim(),
        });
      }
    }),

  updatePassword: protectedProcedure
    .input(updatePasswordSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.jellyfin?.id;
      if (!userId) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }

      try {
        const payload: UpdateUserPassword = {
          CurrentPassword: input.currentPassword,
          NewPw: input.newPassword,
        };

        await ctx.jellyfinClient.userApi.updateUserPassword({
          userId: userId,
          updateUserPassword: payload,
        });
        return { success: true };
      } catch (error: any) {
        console.error("Failed to update Jellyfin password:", error);
        if (
          error?.response?.status === 401 ||
          error?.response?.status === 403
        ) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Incorrect current password.",
          });
        }
        if (error?.response?.status === 400) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Password update failed. ${error.message ?? ""}`.trim(),
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to update password. ${error.message ?? ""}`.trim(),
        });
      }
    }),

  deleteAccount: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.session.user.jellyfin?.id;
    if (!userId) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }

    try {
      await ctx.jellyfinClient.userApi.deleteUser({ userId: userId });
      return { success: true };
    } catch (error: any) {
      console.error("Failed to delete Jellyfin account:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Failed to delete account. ${error.message ?? ""}`.trim(),
      });
    }
  }),
});
