import { z } from "zod";
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "@/server/api/trpc";
import { TRPCError } from "@trpc/server";
import crypto from "crypto";

const createInviteSchema = z.object({
  profileId: z.string().min(1, "Profile is required"),
  expiresAt: z.date().optional().nullable(),
  maxUses: z.number().int().positive().optional().nullable(),
});

const verifyInviteSchema = z.object({
  code: z.string(),
});

const updateInviteSchema = z.object({
  id: z.string(),
  expiresAt: z.date().optional().nullable(),
  maxUses: z.number().int().positive().optional().nullable(),
});

export const invitesRouter = createTRPCRouter({
  create: protectedProcedure
    .input(createInviteSchema)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.session.user.jellyfin?.isAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only admins can create invites",
        });
      }

      const code = crypto.randomBytes(8).toString("hex");
      const creatorId = ctx.session.user.id;

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
        include: {
          profile: { select: { id: true, name: true } },
        },
      });

      return invite;
    }),

  list: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.session.user.jellyfin?.isAdmin) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Only admins can list invites",
      });
    }

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
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return invites;
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.session.user.jellyfin?.isAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only admins can view invite details",
        });
      }

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

      if (invite.expiresAt && invite.expiresAt < new Date()) {
        return { valid: false, reason: "expired" };
      }

      if (invite.maxUses && invite.usageCount >= invite.maxUses) {
        return { valid: false, reason: "max_uses_reached" };
      }

      return {
        valid: true,
        profile: invite.profile,
      };
    }),

  update: protectedProcedure
    .input(updateInviteSchema)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.session.user.jellyfin?.isAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only admins can update invites",
        });
      }

      const updateData: { expiresAt?: Date | null; maxUses?: number | null } =
        {};

      if (input.expiresAt !== undefined) {
        updateData.expiresAt = input.expiresAt;
      }
      if (input.maxUses !== undefined) {
        updateData.maxUses = input.maxUses;
      }

      const invite = await ctx.db.invite.update({
        where: { id: input.id },
        data: updateData,
        include: {
          profile: { select: { id: true, name: true } },
        },
      });

      return invite;
    }),

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

      if (invite.expiresAt && invite.expiresAt < new Date()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invite has expired",
        });
      }

      if (invite.maxUses && invite.usageCount >= invite.maxUses) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invite has reached maximum usage limit",
        });
      }

      await ctx.db.invite.update({
        where: { id: invite.id },
        data: { usageCount: invite.usageCount + 1 },
      });

      return {
        success: true,
        profile: invite.profile,
      };
    }),

  incrementUsage: publicProcedure
    .input(z.object({ code: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const invite = await ctx.db.invite.findUnique({
        where: { code: input.code },
      });

      if (!invite) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invite code not found during usage increment.",
        });
      }

      if (invite.expiresAt && invite.expiresAt < new Date()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invite has expired.",
        });
      }

      if (invite.maxUses && invite.usageCount >= invite.maxUses) {
        console.warn(
          `Invite code ${input.code} usage increment attempted when already at max uses.`,
        );
        return { success: true, alreadyAtMax: true };
      }

      try {
        await ctx.db.invite.update({
          where: { id: invite.id },
          data: { usageCount: { increment: 1 } },
        });
        console.log(`Incremented usage count for invite code: ${input.code}`);
        return { success: true };
      } catch (error) {
        console.error(
          `Failed to increment usage count for invite code ${input.code}:`,
          error,
        );
        return { success: false };
      }
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.session.user.jellyfin?.isAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only admins can delete invites",
        });
      }

      const existingInvite = await ctx.db.invite.findUnique({
        where: { id: input.id },
      });

      if (!existingInvite) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invite not found",
        });
      }

      await ctx.db.invite.delete({
        where: {
          id: input.id,
        },
      });

      return { success: true };
    }),
});
