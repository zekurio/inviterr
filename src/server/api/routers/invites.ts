import { z } from "zod";
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "@/server/api/trpc";
import { TRPCError } from "@trpc/server";
import crypto from "crypto";

// Schema for invite creation
const createInviteSchema = z.object({
  createdAt: z.date(),
  expiresAt: z.date().optional(),
  maxUses: z.number().optional(),
  createdById: z.string(),
  profileId: z.string(),
});

// Schema for invite verification
const verifyInviteSchema = z.object({
  code: z.string(),
});

// Schema for invite update
const updateInviteSchema = z.object({
  id: z.string(),
  expiresAt: z.date().optional(),
  maxUses: z.number().optional(),
  profileId: z.string().optional(),
});

export const invitesRouter = createTRPCRouter({
  create: protectedProcedure
    .input(createInviteSchema)
    .mutation(async ({ ctx, input }) => {
      // Verify user is an admin
      if (!ctx.session.user.jellyfin?.isAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only admins can create invites",
        });
      }

      // Generate a unique invite code
      const code = crypto.randomBytes(8).toString("hex");

      // Create the invite
      const invite = await ctx.db.invite.create({
        data: {
          code,
          createdAt: input.createdAt,
          expiresAt: input.expiresAt,
          maxUses: input.maxUses,
          createdBy: {
            connect: {
              id: ctx.session.user.id,
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

  // list invites - admin only
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

  // get invite by id - admin only
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

  // verify invite - public
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
        profile: invite.profile 
      };
    }),
  
  // update invite - admin only
  update: protectedProcedure
    .input(updateInviteSchema)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.session.user.jellyfin?.isAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only admins can update invites",
        });
      }

      const updateData: Record<string, unknown> = {};
      
      if (input.expiresAt !== undefined) {
        updateData.expiresAt = input.expiresAt;
      }
      
      if (input.maxUses !== undefined) {
        updateData.maxUses = input.maxUses;
      }
      
      if (input.profileId) {
        updateData.profile = {
          connect: {
            id: input.profileId,
          },
        };
      }

      const invite = await ctx.db.invite.update({
        where: { id: input.id },
        data: updateData,
        include: {
          profile: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      return invite;
    }),

  // consume invite - public
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
        profile: invite.profile
      };
    }),

  // delete invite - admin only
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.session.user.jellyfin?.isAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only admins can delete invites",
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