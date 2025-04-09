import { z } from "zod";

const inviteCodeSchema = z.object({
  code: z
    .string()
    .min(6, { message: "Invite code must be at least 6 characters." }),
});

export { inviteCodeSchema };
