import CredentialsProvider from "next-auth/providers/credentials";
import { z } from "zod";
import jellyfinClient from "@/server/jellyfin";
import { db } from "@/server/db";

export const credentialsProvider = CredentialsProvider({
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
        validatedCredentials.password,
      );
      if (!response.data?.User?.Id || !response.data?.User?.Name) {
        return null;
      }

      const image = jellyfinClient.imageApi.getUserImageUrl(response.data.User);

      // get the user from the db
      const dbUser = await db.user.findFirst({
        where: {
          jellyfinUser: {
            jellyfinUserId: response.data.User.Id,
          },
        },
      });

      if (!dbUser) {
        return {
          id: response.data.User.Id,
          name: response.data.User.Name,
          email: null,
          image: image,
        };
      }

      return {
        id: response.data.User.Id,
        name: response.data.User.Name,
        email: dbUser.email,
        image: dbUser.image,
      };
    } catch (error) {
      console.error(error);
      return null;
    }
  },
});
