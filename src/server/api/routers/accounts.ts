import { z } from "zod";
import {
  createTRPCRouter,
  publicProcedure,
  protectedProcedure,
} from "@/server/api/trpc";
import { TRPCError } from "@trpc/server";
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

const linkJellyfinAccountSchema = z.object({
  username: z.string().min(1, "Jellyfin username is required"),
  password: z.string().min(1, "Jellyfin password is required"),
});

// Update the enum to include 'resend'
const unlinkProviderSchema = z.object({
  provider: z.enum(["discord", "jellyfin", "resend"]),
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
          } catch (error) {
            console.error("Failed to apply policy to new user:", error);
          }

          return {
            id: userId,
            username: newUserResponse.data.Name,
          };
        } else {
          // Attempt to parse Jellyfin API error if possible
          let message = "Unexpected response from Jellyfin server.";
          if (newUserResponse.status === 400) {
            // Assuming 400 might mean username exists or other validation
            message =
              "Could not create Jellyfin user. The username might already exist or is invalid.";
          }
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR", // Or CONFLICT if appropriate
            message: `Failed to create Jellyfin account: ${message}`,
          });
        }
      } catch (error: any) {
        console.error("Failed to create Jellyfin user:", error);
        let errorMessage = "An internal error occurred.";
        // Check for specific Jellyfin client errors if possible (structure depends on sdk)
        if (error?.response?.status === 400) {
          errorMessage = "The username is taken or invalid.";
        }
        // Check for TRPCError specifically
        else if (error instanceof TRPCError) {
          throw error; // Re-throw existing TRPC errors
        } else if (error instanceof Error) {
          errorMessage = error.message;
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to create Jellyfin account. ${errorMessage}`.trim(),
        });
      }
    }),

  getCurrentUser: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    // Get core details from session first
    let userEmail = ctx.session.user.email;
    const userImage = ctx.session.user.image;
    const userName = ctx.session.user.name;

    if (!userId) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "User ID not found in session.",
      });
    }

    let jellyfinDetails: {
      id: string;
      username: string;
      isAdmin: boolean;
    } | null = null;
    let discordLinked = false;
    let linkedEmail: string | null = null; // Variable for linked email

    try {
      // Perform DB lookups in parallel
      const [jellyfinLink, discordAccount, emailAccount] = await Promise.all([
        ctx.db.jellyfinUser.findFirst({
          where: { userId: userId },
        }),
        ctx.db.account.findFirst({
          where: { userId: userId, providerId: "discord" },
        }),
        // Check for an account linked via 'resend' provider
        ctx.db.account.findFirst({
          where: { userId: userId, providerId: "resend" },
          include: { user: true }, // Include user to get email
        }),
      ]);

      // Process Jellyfin Link
      if (jellyfinLink) {
        console.log(
          `[getCurrentUser] Found Jellyfin link for user ${userId}: JF ID ${jellyfinLink.jellyfinUserId}`,
        );
        try {
          const jellyfinUserInfo = await ctx.jellyfinClient.userApi.getUserById(
            {
              userId: jellyfinLink.jellyfinUserId,
            },
          );
          if (jellyfinUserInfo.data) {
            jellyfinDetails = {
              id: jellyfinLink.jellyfinUserId,
              username: jellyfinUserInfo.data.Name ?? jellyfinLink.username,
              isAdmin: jellyfinUserInfo.data.Policy?.IsAdministrator ?? false,
            };
            console.log(
              `[getCurrentUser] Fetched live Jellyfin details for ${jellyfinDetails.username}`,
            );
          } else {
            console.warn(
              `[getCurrentUser] Could not fetch live Jellyfin details for JF ID ${jellyfinLink.jellyfinUserId}. Using stored username.`,
            );
            jellyfinDetails = {
              id: jellyfinLink.jellyfinUserId,
              username: jellyfinLink.username,
              isAdmin: false,
            };
          }
        } catch (apiError) {
          console.error(
            `[getCurrentUser] Error fetching live Jellyfin details for JF ID ${jellyfinLink.jellyfinUserId}:`,
            apiError,
          );
          jellyfinDetails = {
            id: jellyfinLink.jellyfinUserId,
            username: jellyfinLink.username,
            isAdmin: false,
          };
        }
      } else {
        console.log(
          `[getCurrentUser] No Jellyfin link found for user ${userId}.`,
        );
      }

      // Process Discord Link
      if (discordAccount) {
        discordLinked = true;
        console.log(`[getCurrentUser] Found Discord link for user ${userId}.`);
        // Prioritize Discord name/image if available and user doesn't have one yet? (Optional)
        // if (!userName) userName = discordAccount.user?.name;
        // if (!userImage) userImage = discordAccount.user?.image;
      } else {
        console.log(
          `[getCurrentUser] No Discord link found for user ${userId}.`,
        );
      }

      // Process Email Link (Resend)
      if (emailAccount) {
        // The email is stored on the associated User record
        linkedEmail = emailAccount.user?.email ?? null;
        if (linkedEmail) {
          console.log(
            `[getCurrentUser] Found Email (Resend) link for user ${userId}: ${linkedEmail}.`,
          );
          // If session email is missing, populate it from the linked account user data
          if (!userEmail) {
            userEmail = linkedEmail;
          }
        } else {
          console.warn(
            `[getCurrentUser] Found Resend account link for user ${userId} but no email on associated user record.`,
          );
        }
      } else {
        console.log(`[getCurrentUser] No Email link found for user ${userId}.`);
      }
    } catch (dbError) {
      console.error(
        `[getCurrentUser] Database error checking links for user ${userId}:`,
        dbError,
      );
      // Proceed without link details if DB lookups fail
    }

    // Return combined user data
    return {
      id: userId,
      name: userName ?? null, // Use potentially updated userName
      email: userEmail ?? null, // Use potentially updated userEmail
      image: userImage ?? null, // Use potentially updated userImage
      jellyfin: jellyfinDetails,
      discordLinked: discordLinked,
      linkedEmail: linkedEmail, // Add the linked email status/address
    };
  }),

  // --- NEW MUTATION --- //
  linkJellyfinAccount: protectedProcedure
    .input(linkJellyfinAccountSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // 1. Check if user is already linked
      const existingLink = await ctx.db.jellyfinUser.findFirst({
        where: { userId: userId },
      });
      if (existingLink) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Your account is already linked to a Jellyfin account.",
        });
      }

      // 2. Authenticate with Jellyfin
      let jellyfinAuthResponse;
      try {
        jellyfinAuthResponse =
          await ctx.jellyfinClient.api.authenticateUserByName(
            input.username,
            input.password,
          );

        if (
          !jellyfinAuthResponse.data?.User?.Id ||
          !jellyfinAuthResponse.data?.User?.Name
        ) {
          console.warn(
            `[linkJellyfin] Jellyfin auth success but no user data for ${input.username}`,
          );
          throw new Error(); // Trigger catch block for generic failure
        }
      } catch (error) {
        console.error(
          `[linkJellyfin] Jellyfin authentication failed for user ${input.username}:`,
          error,
        );
        // Check if Jellyfin API gave a specific status code (e.g., 401 Unauthorized)
        // The exact error structure depends on the Jellyfin SDK/client
        // if (error?.response?.status === 401) {
        //    throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid Jellyfin username or password." });
        // }
        throw new TRPCError({
          code: "UNAUTHORIZED", // Assume bad credentials if auth fails
          message: "Invalid Jellyfin username or password.",
        });
      }

      const jellyfinUserId = jellyfinAuthResponse.data.User.Id;
      const jellyfinUsername = jellyfinAuthResponse.data.User.Name;
      const jellyfinIsAdmin =
        jellyfinAuthResponse.data.User.Policy?.IsAdministrator ?? false;

      // 3. Check if this *Jellyfin* account is already linked to *another* user
      const linkTaken = await ctx.db.jellyfinUser.findUnique({
        where: { jellyfinUserId: jellyfinUserId },
      });
      if (linkTaken) {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "This Jellyfin account is already linked to a different Inviterr profile.",
        });
      }

      // 4. Create the link
      try {
        await ctx.db.jellyfinUser.create({
          data: {
            userId: userId!,
            jellyfinUserId: jellyfinUserId,
            username: jellyfinUsername,
          },
        });

        console.log(
          `[linkJellyfin] Successfully linked Inviterr user ${userId} to Jellyfin user ${jellyfinUsername} (${jellyfinUserId})`,
        );

        return {
          success: true,
          jellyfinUsername: jellyfinUsername,
          jellyfinIsAdmin: jellyfinIsAdmin,
        };
      } catch (error) {
        console.error(
          `[linkJellyfin] Failed to create JellyfinUser link for user ${userId} and JF ID ${jellyfinUserId}:`,
          error,
        );
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to save the account link. Please try again.",
        });
      }
    }),

  unlinkProvider: protectedProcedure
    .input(unlinkProviderSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const provider = input.provider;

      console.log(
        `[unlinkProvider] User ${userId} attempting to unlink ${provider}`,
      );

      try {
        if (provider === "discord") {
          // Find the account link
          const accountLink = await ctx.db.account.findFirst({
            where: { userId: userId, providerId: "discord" },
          });
          if (!accountLink) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Discord account not linked.",
            });
          }
          // Delete the link using its primary id
          await ctx.db.account.delete({
            where: { id: accountLink.id },
          });
          console.log(
            `[unlinkProvider] Successfully unlinked Discord for user ${userId}`,
          );
        } else if (provider === "jellyfin") {
          // Find the Jellyfin link
          const jellyfinLink = await ctx.db.jellyfinUser.findFirst({
            where: { userId: userId },
          });
          if (!jellyfinLink) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Jellyfin account not linked.",
            });
          }
          // Delete the link
          await ctx.db.jellyfinUser.delete({
            where: { id: jellyfinLink.id }, // Use the primary key of JellyfinUser
          });
          console.log(
            `[unlinkProvider] Successfully unlinked Jellyfin for user ${userId}`,
          );
        } else if (provider === "resend") {
          // Find the email account link
          const accountLink = await ctx.db.account.findFirst({
            where: { userId: userId, providerId: "resend" },
          });
          if (!accountLink) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Email account not linked.",
            });
          }
          // Delete the link
          // Note: This deletes the *link* (Account record), not the User record itself.
          // The user's email might still exist on the User record if they logged in with it before.
          await ctx.db.account.delete({
            where: { id: accountLink.id },
          });
          console.log(
            `[unlinkProvider] Successfully unlinked Email (Resend) for user ${userId}`,
          );
        }

        // Invalidate user data after successful unlink
        // It's better to do this here rather than relying only on frontend invalidation
        // However, the frontend already invalidates, so this might be redundant but safe.
        // Consider if session update is needed here too for immediate effect before page refresh/refetch.

        return { success: true };
      } catch (error) {
        console.error(
          `[unlinkProvider] Failed to unlink ${provider} for user ${userId}:`,
          error,
        );
        if (error instanceof TRPCError) {
          throw error; // Re-throw known errors
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to unlink ${provider}. Please try again.`,
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
      } catch (error) {
        console.error("Failed to update Jellyfin username:", error);

        // Check if error is an object with a response property
        if (error && typeof error === "object" && "response" in error) {
          const response = error.response as { status?: number } | undefined;
          if (response?.status === 400) {
            throw new TRPCError({
              code: "CONFLICT",
              message: `Failed to update username.`,
            });
          }
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to update username.`,
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
      } catch (error) {
        console.error("Failed to update Jellyfin password:", error);

        // Check if error is an object with a response property
        if (error && typeof error === "object" && "response" in error) {
          const response = error.response as { status?: number } | undefined;

          if (response?.status === 401 || response?.status === 403) {
            throw new TRPCError({
              code: "UNAUTHORIZED",
              message: "Incorrect current password.",
            });
          }

          if (response?.status === 400) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Password update failed.`,
            });
          }
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to update password.`,
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
    } catch (error) {
      console.error("Failed to delete Jellyfin account:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Failed to delete account.`,
      });
    }
  }),
});
