import { PrismaAdapter } from "@auth/prisma-adapter";
import {
  type DefaultSession,
  type NextAuthConfig,
  type User as NextAuthUser,
} from "next-auth";
import DiscordProvider from "next-auth/providers/discord";
import CredentialsProvider from "next-auth/providers/credentials";
import { db } from "@/server/db";
import jellyfinClient from "@/server/jellyfin";
import { z } from "zod";

// Custom error class for unlinked accounts
class JellyfinAccountNotLinkedError extends Error {
  constructor(message = "JELLYFIN_ACCOUNT_NOT_LINKED") {
    super(message);
    this.name = "JellyfinAccountNotLinkedError";
  }
}

/**
 * Module augmentation for `next-auth` types.
 */
declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      jellyfin?: {
        id: string;
        username: string;
        isAdmin: boolean;
      };
    } & DefaultSession["user"];
  }

  // Augment the default User type (implicitly targets the base User)
  interface User {
    // Remove 'extends NextAuthUser'
    jellyfin?: {
      id: string;
      username: string;
      isAdmin: boolean;
    };
  }

  /**
   * Augment JWT type (move inside this module)
   */
  interface JWT {
    id?: string; // Database User ID
    picture?: string | null; // For user image
    jellyfin?: {
      id: string;
      username: string;
      isAdmin: boolean;
    };
  }
}

/**
 * Options for NextAuth.js
 */
export const authConfig = {
  providers: [
    DiscordProvider,
    CredentialsProvider({
      name: "Jellyfin",
      id: "jellyfin", // Identifier for this provider
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const credentialsSchema = z.object({
          username: z.string(),
          password: z.string(),
        });
        const validatedCredentials = credentialsSchema.parse(credentials);

        try {
          const response = await jellyfinClient.api.authenticateUserByName(
            validatedCredentials.username,
            validatedCredentials.password,
          );

          if (!response.data?.User?.Id || !response.data?.User?.Name) {
            console.error(
              "[AUTH:Jellyfin] Auth failed or returned no user data for:",
              validatedCredentials.username,
            );
            return null; // Authentication failed
          }

          console.log(
            "[AUTH:Jellyfin] Auth successful for:",
            response.data.User.Name,
            "ID:",
            response.data.User.Id,
          );

          // Return a basic object with Jellyfin details.
          // Include 'id' temporarily using Jellyfin ID - jwt callback MUST override this.
          return {
            id: response.data.User.Id,
            jellyfin: {
              id: response.data.User.Id,
              username: response.data.User.Name,
              isAdmin: response.data.User.Policy?.IsAdministrator ?? false,
            },
          };
        } catch (error) {
          console.error("[AUTH:Jellyfin] Error during authentication:", error);
          // Consider mapping specific Jellyfin API errors to user-friendly messages if needed
          return null; // Indicate authentication failure
        }
      },
    }),
  ],
  adapter: PrismaAdapter(db),
  session: {
    strategy: "jwt", // Explicitly use JWT strategy
  },
  callbacks: {
    // Optional: signIn callback for early checks or logging
    signIn: async ({ user, account }) => {
      console.log(
        `[signIn CB] User ID: ${user.id}, Provider: ${account?.provider}`,
      );
      // Can add logic here to prevent sign-in under certain conditions if needed
      return true; // Allow sign-in to proceed
    },

    jwt: async ({ token, user, account }) => {
      console.log(
        `[JWT CB] Start. Current Token: ${JSON.stringify(token)}, User: ${JSON.stringify(user)}, Account: ${JSON.stringify(account)}`,
      );

      const initialSignIn = !!(account && user);

      if (initialSignIn) {
        token = { ...token }; // Avoid direct mutation

        // Handle Credentials Provider ("jellyfin")
        if (account?.provider === "jellyfin" && user?.jellyfin) {
          console.log(
            "[JWT CB] Handling 'jellyfin' credentials provider sign in.",
          );
          const jellyfinUserId = user.jellyfin.id;
          try {
            // Find the DB User linked to this Jellyfin ID
            const linkedJellyfinUser = await db.jellyfinUser.findUnique({
              where: { jellyfinUserId: jellyfinUserId },
              include: { user: true }, // Include the related User record
            });

            if (linkedJellyfinUser?.user) {
              const dbUser = linkedJellyfinUser.user;
              console.log("[JWT CB] Found linked DB user:", dbUser.id);
              // Populate token with correct DB user info
              token.id = dbUser.id; // CRITICAL: Use DB user ID
              token.name = dbUser.name;
              token.email = dbUser.email;
              token.picture = dbUser.image; // Map db 'image' to token 'picture'
              token.jellyfin = user.jellyfin; // Keep fresh jellyfin data from authorize
            } else {
              console.error(
                "[JWT CB] No DB user linked to Jellyfin ID:",
                jellyfinUserId,
              );
              // Throw specific error message string for easier client-side detection
              throw new Error("JellyfinAccountNotLinked");
            }
          } catch (error) {
            console.error(
              "[JWT CB] Error during DB lookup for Jellyfin user:",
              error,
            );
            // Re-throw specific error message string
            if (
              error instanceof Error &&
              error.message === "JellyfinAccountNotLinked"
            ) {
              throw error;
            }
            // Throw generic error for other DB issues
            throw new Error("DatabaseError"); // Generic DB error
          }
        }
        // Handle OAuth Providers (e.g., "discord")
        else if (account?.provider && account.provider !== "jellyfin") {
          console.log(
            `[JWT CB] Handling OAuth provider '${account.provider}' sign in.`,
          );
          // For OAuth, user.id should already be the DB user ID from the adapter
          token.id = user.id;
          token.name = user.name;
          token.email = user.email;
          token.picture = user.image;

          // Try to find and add Jellyfin data if account is linked
          try {
            const jellyfinLink = await db.jellyfinUser.findFirst({
              where: { userId: user.id },
            });
            if (jellyfinLink) {
              console.log(
                "[JWT CB] Found linked Jellyfin account for OAuth user:",
                jellyfinLink.jellyfinUserId,
              );
              // Fetch fresh Jellyfin details for consistency
              try {
                const jellyfinUserInfo =
                  await jellyfinClient.userApi.getUserById({
                    userId: jellyfinLink.jellyfinUserId,
                  });
                if (jellyfinUserInfo.data) {
                  token.jellyfin = {
                    id: jellyfinLink.jellyfinUserId,
                    username:
                      jellyfinUserInfo.data.Name ?? jellyfinLink.username,
                    isAdmin:
                      jellyfinUserInfo.data.Policy?.IsAdministrator ?? false,
                  };
                } else {
                  console.warn(
                    "[JWT CB] Could not fetch Jellyfin details for linked user:",
                    jellyfinLink.jellyfinUserId,
                  );
                  delete token.jellyfin; // Remove if fetch fails
                }
              } catch (apiError) {
                console.error(
                  "[JWT CB] Error fetching Jellyfin details for linked OAuth user:",
                  apiError,
                );
                delete token.jellyfin; // Remove on API error
              }
            } else {
              console.log(
                "[JWT CB] No Jellyfin account linked for this OAuth user:",
                user.id,
              );
              delete token.jellyfin; // Ensure not present if not linked
            }
          } catch (dbError) {
            console.error(
              "[JWT CB] Error checking Jellyfin link for OAuth user:",
              dbError,
            );
            delete token.jellyfin; // Remove on DB error
          }
        }
      }

      // TODO: Add token refresh logic here if needed in the future

      console.log("[JWT CB] End. Final token:", JSON.stringify(token));
      return token; // Return the populated/updated token
    },

    session: async ({ session, token }) => {
      console.log("[Session CB] Start. Token:", JSON.stringify(token));
      // Assign properties from token to session
      // Ensure all expected fields on session.user are handled
      session.user.id = token.id as string; // Assert as string, JWT logic ensures it's set
      session.user.name = token.name ?? null;
      session.user.email = token.email ?? ""; // Default to empty string
      session.user.image = token.picture ?? null; // Map token 'picture' back to session 'image'

      if (token.jellyfin) {
        // Explicitly cast token.jellyfin to the expected type for session.user.jellyfin
        session.user.jellyfin = token.jellyfin as {
          id: string;
          username: string;
          isAdmin: boolean;
        };
      } else {
        delete session.user.jellyfin;
      }

      console.log("[Session CB] End. Final session:", JSON.stringify(session));
      return session;
    },
  },
  pages: {
    signIn: "/login",
    // Add error page for handling specific errors like account not linked
    error: "/login", // Redirect to login page on error, can customize
  },
  // Use session callback to handle errors during JWT creation/processing
  // Note: This might not catch all errors perfectly, client-side handling is also needed.
} satisfies NextAuthConfig;
