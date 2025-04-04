import { z } from "zod";
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "@/server/api/trpc";
import { TRPCError } from "@trpc/server";
import crypto from "crypto";

// Schema for invite creation - Adjusted for dialog input
const createInviteSchema = z.object({
  profileId: z.string().min(1, "Profile is required"), // Require profileId
  expiresAt: z.date().optional().nullable(), // Allow null for clearing
  maxUses: z.number().int().positive().optional().nullable(), // Allow null for clearing
});

// Schema for invite verification
const verifyInviteSchema = z.object({
  code: z.string(),
});

// Schema for invite update - Adjusted for dialog input
const updateInviteSchema = z.object({
  id: z.string(),
  expiresAt: z.date().optional().nullable(), // Allow null for clearing
  maxUses: z.number().int().positive().optional().nullable(), // Allow null for clearing
  // profileId update might be complex, maybe disallow for now or handle carefully
  // profileId: z.string().optional(),
});

export const invitesRouter = createTRPCRouter({
  create: publicProcedure
    .input(createInviteSchema) // Use updated schema
    .mutation(async ({ ctx, input }) => {
      // TODO: Re-enable admin check
      // if (!ctx.session.user.jellyfin?.isAdmin) {
      //   throw new TRPCError({
      //     code: "FORBIDDEN",
      //     message: "Only admins can create invites",
      //   });
      // }

      // Generate a unique invite code
      const code = crypto.randomBytes(8).toString("hex");

      let creatorId: string | undefined = ctx.session?.user?.id;

      // Create the invite
      const invite = await ctx.db.invite.create({
        data: {
          code,
          createdAt: new Date(),
          expiresAt: input.expiresAt,
          maxUses: input.maxUses === null ? undefined : input.maxUses,
          createdBy: {
            connect: {
              id: creatorId,
            },
          },
          profile: {
            connect: {
              id: input.profileId,
            },
          },
        },
      });

      return invite;
    }),

  // list invites - temporarily public
  list: publicProcedure.query(async ({ ctx }) => {
    // TODO: Re-enable admin check
    // if (!ctx.session.user.jellyfin?.isAdmin) {
    //   throw new TRPCError({
    //     code: "FORBIDDEN",
    //     message: "Only admins can list invites",
    //   });
    // }

    const invites = await ctx.db.invite.findMany({
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
          },
        },
        profile: {
          select: {
            id: true,
            name: true,
          },
        },
        // If usageCount isn't direct, you might need:
        // _count: { select: { InviteUsage: true } }
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // Add usageCount directly (assuming it exists on the model)
    // If usageCount is not directly on Invite, you might need relations
    // This part assumes `Invite` model has `usageCount` field
    return invites.map((invite) => ({
      ...invite,
      // usageCount is likely already included if it's a direct field
      // If it's a relation count, you'd use _count like in profiles
    }));
  }),

  // get invite by id - temporarily public
  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      // TODO: Re-enable admin check
      // if (!ctx.session.user.jellyfin?.isAdmin) {
      //   throw new TRPCError({
      //     code: "FORBIDDEN",
      //     message: "Only admins can view invite details",
      //   });
      // }

      const invite = await ctx.db.invite.findUnique({
        where: { id: input.id },
        include: {
          createdBy: {
            select: {
              id: true,
              name: true,
            },
          },
          profile: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      if (!invite) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invite not found",
        });
      }

      return invite;
    }),

  // verify invite - remains public
  verify: publicProcedure
    .input(verifyInviteSchema)
    .query(async ({ ctx, input }) => {
      const invite = await ctx.db.invite.findUnique({
        where: { code: input.code },
        include: {
          profile: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      if (!invite) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invite not found",
        });
      }

      // Check if the invite has expired
      if (invite.expiresAt && invite.expiresAt < new Date()) {
        return { valid: false, reason: "expired" };
      }

      // Check if invite has reached max uses
      if (invite.maxUses && invite.usageCount >= invite.maxUses) {
        return { valid: false, reason: "max_uses_reached" };
      }

      return {
        valid: true,
        profile: invite.profile,
      };
    }),

  // update invite - temporarily public
  update: publicProcedure
    .input(updateInviteSchema) // Use updated schema
    .mutation(async ({ ctx, input }) => {
      // TODO: Re-enable admin check
      // if (!ctx.session.user.jellyfin?.isAdmin) {
      //   throw new TRPCError({
      //     code: "FORBIDDEN",
      //     message: "Only admins can update invites",
      //   });
      // }

      const updateData: { expiresAt?: Date | null; maxUses?: number | null } =
        {};

      // Handle optional fields explicitly to allow setting to null/undefined
      if (input.expiresAt !== undefined) {
        updateData.expiresAt = input.expiresAt; // Pass null or Date
      }
      if (input.maxUses !== undefined) {
        // Prisma might expect null to unset, or a number
        updateData.maxUses = input.maxUses; // Pass null or number
      }

      // Not allowing profileId change via this endpoint for simplicity
      // if (input.profileId) { ... }

      const invite = await ctx.db.invite.update({
        where: { id: input.id },
        data: updateData,
        include: {
          profile: { select: { id: true, name: true } },
        },
      });

      return invite;
    }),

  // consume invite - remains public
  consume: publicProcedure
    .input(z.object({ code: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const invite = await ctx.db.invite.findUnique({
        where: { code: input.code },
        include: {
          profile: true,
        },
      });

      if (!invite) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invite not found",
        });
      }

      // Check if the invite has expired
      if (invite.expiresAt && invite.expiresAt < new Date()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invite has expired",
        });
      }

      // Check if invite has reached max uses
      if (invite.maxUses && invite.usageCount >= invite.maxUses) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invite has reached maximum usage limit",
        });
      }

      // Increment usage count
      await ctx.db.invite.update({
        where: { id: invite.id },
        data: { usageCount: invite.usageCount + 1 },
      });

      return {
        success: true,
        profile: invite.profile,
      };
    }),

  // delete invite - temporarily public
  delete: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // TODO: Re-enable admin check
      // if (!ctx.session.user.jellyfin?.isAdmin) {
      //   throw new TRPCError({
      //     code: "FORBIDDEN",
      //     message: "Only admins can delete invites",
      //   });
      // }

      await ctx.db.invite.delete({
        where: {
          id: input.id,
        },
      });

      return { success: true };
    }),
});
