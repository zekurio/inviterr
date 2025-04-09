import { z } from "zod";

const formSchema = z.object({
  username: z.string().min(1, { message: "Username or email is required." }),
  password: z.string().min(1, { message: "Password is required." }),
});

export { formSchema };
