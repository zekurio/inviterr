import { betterAuth } from "better-auth";
import { username, admin } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { PrismaClient } from "@prisma/client";
import { cache } from "react";
import { headers } from "next/headers";
import { resend } from "@/server/resend";
import { env } from "@/env";

const prisma = new PrismaClient();

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
  },
  plugins: [username(), nextCookies(), admin()],
  emailAndPassword: {
    enabled: true,
    async sendResetPassword({ url, user }) {
      console.log("Sending reset password email to:", user.email);
      console.log("Reset password URL:", url);
      try {
        await resend.emails.send({
          from: "SchnitzelFlix <" + env.EMAIL_FROM + ">",
          to: user.email,
          subject: "Reset your password",
          text: `Click here to reset your password: ${url}`,
        });
        console.log("Password reset email sent successfully.");
      } catch (error) {
        console.error("Error sending password reset email:", error);
      }
    },
  },
  socialProviders: {
    discord: {
      clientId: env.BETTER_AUTH_DISCORD_ID,
      clientSecret: env.BETTER_AUTH_DISCORD_SECRET,
      scopes: ["identify", "email"],
    },
  },
});

export const getSession = cache(async () => {
  return await auth.api.getSession({
    headers: await headers(),
  });
});
