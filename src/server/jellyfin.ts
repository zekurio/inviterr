import { Jellyfin } from "@jellyfin/sdk";
import packageJson from "../../package.json";
import { env } from "@/env";
import { getImageApi } from "@jellyfin/sdk/lib/utils/api/image-api";
import { getUserApi } from "@jellyfin/sdk/lib/utils/api/user-api";
import type { UserDto } from "@jellyfin/sdk/lib/generated-client/models";

// Create a singleton Jellyfin client
const jellyfin = new Jellyfin({
  clientInfo: {
    name: "Inviterr",
    version: packageJson.version,
  },
  deviceInfo: {
    name: "Inviterr",
    id: "inviterr",
  },
});

// Initialize the API with environment variables
const api = jellyfin.createApi(env.JELLYFIN_SERVER_URL);
api.accessToken = env.JELLYFIN_API_KEY;

const imageApi = getImageApi(api);
const userApi = getUserApi(api);

export async function getUserByName(username: string) {
  const users = await userApi.getUsers();

  if (!users.data) {
    throw new Error("No users found");
  }

  return users.data.find((user: UserDto) => user.Name === username);
}

export async function getUserImageUrl(userId: string, primaryTag: string) {
  const res = await userApi.getUserById({ userId: userId });

  if (!res) {
    throw new Error("User not found");
  }

  const imageUrl = imageApi.getUserImageUrl(res.data);

  return imageUrl;
}



// Export the API as the default export
const jellyfinClient = { api, imageApi, userApi, getUserByName };
export default jellyfinClient;