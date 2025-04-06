import { authClient } from "@/lib/auth-client";

export const signinDiscord = async () => {
  const data = await authClient.signIn.social({
    provider: "discord",
  });
  return data;
};

export const signinGoogle = async () => {
  const data = await authClient.signIn.social({
    provider: "google",
  });
  return data;
};
