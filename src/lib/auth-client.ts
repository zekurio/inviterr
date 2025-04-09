import { env } from "@/env";
import { usernameClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  plugins: [usernameClient()],
});

export const signinDiscord = async () => {
  const data = await authClient.signIn.social({
    provider: "discord",
  });
  return data;
};

export const signinUsername = async (username: string, password: string) => {
  const data = await authClient.signIn.username({
    username,
    password,
  });
  return data;
};

export const { signIn, signOut, useSession } = authClient;
