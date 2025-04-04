import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import jellyfinClient from "@/server/jellyfin";
import type { UserDto } from "@jellyfin/sdk/lib/generated-client/models";

// Define interfaces for better type checking
interface UserWithAvatar {
  id: string | null | undefined;
  name: string | null | undefined;
  avatarUrl: string | undefined;
}

interface DefinedUserWithAvatar {
  id: string;
  name: string;
  avatarUrl: string | undefined;
}

// Type guard function for filtering
function isDefinedUser(user: UserWithAvatar): user is DefinedUserWithAvatar {
    return typeof user.id === 'string' && typeof user.name === 'string';
}

export const jellyfinRouter = createTRPCRouter({
  getAllUsers: publicProcedure.query(async () => {
    const { userApi, imageApi } = jellyfinClient;
    const usersResponse = await userApi.getUsers();

    if (!usersResponse.data) {
      throw new Error("Failed to fetch users from Jellyfin");
    }

    const usersWithAvatars = usersResponse.data
      .map((user: UserDto): UserWithAvatar => {
        let avatarUrl: string | undefined = undefined;
        const userId = user.Id;
        const primaryTag = user.PrimaryImageTag;

        if (userId && primaryTag) {
          avatarUrl = imageApi.getUserImageUrl(
            user,
          );
        }

        return {
          id: user.Id,
          name: user.Name,
          avatarUrl: avatarUrl,
        };
      })
      .filter(isDefinedUser);

    return usersWithAvatars;
  }),
});
