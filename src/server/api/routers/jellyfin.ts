import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import type { UserDto } from "@jellyfin/sdk/lib/generated-client/models";

const DefinedUserWithAvatarSchema = z.object({
  id: z.string(),
  name: z.string(),
  avatarUrl: z.string().optional(),
});

type UserWithAvatar = {
  id: string | null | undefined;
  name: string | null | undefined;
  avatarUrl?: string;
};
type DefinedUserWithAvatar = z.infer<typeof DefinedUserWithAvatarSchema>;

export const jellyfinRouter = createTRPCRouter({
  getAllUsers: publicProcedure.query(async ({ ctx }) => {
    const { userApi, imageApi } = ctx.jellyfinClient;
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
          avatarUrl = imageApi.getUserImageUrl(user);
        }

        return {
          id: user.Id,
          name: user.Name,
          avatarUrl: avatarUrl,
        };
      })
      .filter((user): user is DefinedUserWithAvatar => {
        const result = DefinedUserWithAvatarSchema.safeParse(user);
        return result.success;
      });

    return usersWithAvatars;
  }),
});
