import { PrismaAdapter } from "@auth/prisma-adapter";
import { type DefaultSession, type NextAuthConfig } from "next-auth";
import DiscordProvider from "next-auth/providers/discord";
import CredentialsProvider from "next-auth/providers/credentials";
import { db } from "@/server/db";
import jellyfinClient from "@/server/jellyfin";
import { z } from "zod";

/**
 * Module augmentation for `next-auth` types. Allows us to add custom properties to the `session`
 * object and keep type safety.
 *
 * @see https://next-auth.js.org/getting-started/typescript#module-augmentation
 */
declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      // Add Jellyfin specific fields
      jellyfin?: {
        id: string;
        username: string;
        isAdmin: boolean;
      };
    } & DefaultSession["user"];
  }
}

/**
 * Options for NextAuth.js used to configure adapters, providers, callbacks, etc.
 *
 * @see https://next-auth.js.org/configuration/options
 */
export const authConfig = {
  providers: [
    DiscordProvider,
    CredentialsProvider({
      name: "Jellyfin",
      id: "jellyfin",
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
            validatedCredentials.password
          );
          if (!response.data?.User?.Id || !response.data?.User?.Name) {
            return null;
          }

          const dbAccount = await db.account.findFirst({
            where: {
              providerAccountId: response.data.User.Id,
            },
            include: {
              user: true,
            },
          });

          if (!dbAccount) {
            return null;
          }

          const dbUser = dbAccount.user;

          return {
            id: response.data.User.Id,
            name: response.data.User.Name,
            accessToken: response.data.AccessToken,
            email: dbUser.email,
            image: dbUser.image,
          };
        } catch (error) {
          console.error(error);
          return null;
        }
      },
    }),
    /**
     * ...add more providers here.
     *
     * Most other providers require a bit more work than the Discord provider. For example, the
     * GitHub provider requires you to add the `refresh_token_expires_in` field to the Account
     * model. Refer to the NextAuth.js docs for the provider you want to use. Example:
     *
     * @see https://next-auth.js.org/providers/github
     */
  ],
  adapter: PrismaAdapter(db),
  callbacks: {
    session: async ({ session, user }) => {
      // First get the basic user data and accounts
      const userWithAccounts = await db.user.findUnique({
        where: { id: user.id },
        include: {
          accounts: true,
        },
      });
      
      // Find the Jellyfin account if it exists
      const jellyfinAccount = userWithAccounts?.accounts.find(
        account => account.provider === "jellyfin"
      );
      
      // Initialize session with basic user data
      const enhancedSession = {
        ...session,
        user: {
          ...session.user,
          id: user.id,
        },
      };
      
      // If user has a Jellyfin account, fetch Jellyfin details and add to session
      if (jellyfinAccount?.providerAccountId) {
        try {
          // Fetch Jellyfin user details using the providerAccountId
          const jellyfinUserId = jellyfinAccount.providerAccountId;
          const jellyfinUserResponse = await jellyfinClient.userApi.getUserById({
            userId: jellyfinUserId
          });
          
          const jellyfinData = jellyfinUserResponse?.data;
          if (jellyfinData?.Id && jellyfinData?.Name) {
            // Add Jellyfin user info to session
            enhancedSession.user.jellyfin = {
              id: jellyfinData.Id,
              username: jellyfinData.Name,
              isAdmin: !!jellyfinData.Policy?.IsAdministrator
            };
          }
        } catch (error) {
          console.error("Failed to fetch Jellyfin user data:", error);
        }
      }
      
      return enhancedSession;
    },
    async signIn({ user, account, profile }) {
      if (!account) {
        return false;
      }

      if (account.provider === "jellyfin") {
        return true;
      }

      const existingUser = await db.user.findFirst({
        where: {
          accounts: {
            some: {
              providerAccountId: account.providerAccountId,
            }
          },
          AND: {
            accounts: {
              some: {
                provider: "credentials",
              }
            }
          }
        },
        include: {
          accounts: true,
        },
      });
      if (existingUser) {
        return true;
      } else {
        return `/onboarding?account=${Buffer.from(JSON.stringify({
          provider: account.provider,
          providerAccountId: account.providerAccountId,
          name: profile?.name,
          email: profile?.email,
          image: profile?.image
        })).toString('base64')}`;
      }
    },
  },
  pages: {
    signIn: "/login",
  },
} satisfies NextAuthConfig;
