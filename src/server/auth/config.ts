import { PrismaAdapter } from "@auth/prisma-adapter";
import { type DefaultSession, type NextAuthConfig } from "next-auth";
import DiscordProvider from "next-auth/providers/discord";
import ResendProvider from "next-auth/providers/resend";
import { credentialsProvider } from "@/server/auth/credentials";
import { db } from "@/server/db";
import jellyfinClient from "@/server/jellyfin";

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
    ResendProvider,
    DiscordProvider,
    credentialsProvider,
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
      // get the jellyfin user linked to the user
      const jellyfinUser = await db.jellyfinUser.findFirst({
        where: {
          userId: user.id,
        },
      });

      if (!jellyfinUser) {
        return session;
      }

      // lookup the user's jellyfin user info
      const jellyfinUserInfo = await jellyfinClient.userApi.getUserById({
        userId: jellyfinUser.jellyfinUserId,
      });

      if (!jellyfinUserInfo.data) {
        return session;
      }

      // add jellyfinUser info to the session
      session.user.jellyfin = {
        id: jellyfinUser.jellyfinUserId,
        username: jellyfinUser.username,
        isAdmin: jellyfinUserInfo.data.Policy?.IsAdministrator ?? false,
      };

      return session;
    },
    async signIn({ user, account, profile }) {
      return true;
    },
  },
  pages: {
    signIn: "/login",
  },
} satisfies NextAuthConfig;
