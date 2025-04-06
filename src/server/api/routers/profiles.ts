import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { TRPCError } from "@trpc/server";
import crypto from "crypto";

const createProfileSchema = z.object({
  name: z.string(),
  jellyfinUserId: z.string(),
});

const updateProfileSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  jellyfinUserId: z.string().optional(),
});

export const profilesRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.session.user.jellyfin?.isAdmin) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Only admins can list profiles",
      });
    }

    const profiles = await ctx.db.profile.findMany({
      include: {
        _count: {
          select: { invites: true },
        },
        jellyfinUser: {
          select: { id: true, username: true, jellyfinUserId: true },
        },
      },
      orderBy: {
        name: "asc",
      },
    });

    return profiles.map((p) => ({
      ...p,
      inviteCount: p._count.invites,
    }));
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.session.user.jellyfin?.isAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only admins can view profile details",
        });
      }

      const profile = await ctx.db.profile.findUnique({
        where: { id: input.id },
        include: {
          invites: true,
          jellyfinUser: {
            select: { id: true, username: true, jellyfinUserId: true },
          },
        },
      });

      if (!profile) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Profile not found",
        });
      }

      return profile;
    }),

  create: protectedProcedure
    .input(createProfileSchema)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.session.user.jellyfin?.isAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only admins can create profiles",
        });
      }

      const jellyfinUserExists = await ctx.db.jellyfinUser.findUnique({
        where: { id: input.jellyfinUserId },
      });

      if (!jellyfinUserExists) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Jellyfin user link not found for ID: ${input.jellyfinUserId}`,
        });
      }

      const existingProfile = await ctx.db.profile.findFirst({
        where: { name: input.name },
      });

      if (existingProfile) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `A profile with the name '${input.name}' already exists.`,
        });
      }

      const profile = await ctx.db.profile.create({
        data: {
          name: input.name,
          jellyfinUserId: input.jellyfinUserId,
        },
        include: {
          jellyfinUser: {
            select: { id: true, username: true, jellyfinUserId: true },
          },
        },
      });

      return profile;
    }),

  update: protectedProcedure
    .input(updateProfileSchema)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.session.user.jellyfin?.isAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only admins can update profiles",
        });
      }

      const updateData: { name?: string; jellyfinUserId?: string } = {};

      if (input.name !== undefined) {
        const existingProfile = await ctx.db.profile.findFirst({
          where: {
            name: input.name,
            id: { not: input.id },
          },
        });
        if (existingProfile) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `Another profile with the name '${input.name}' already exists.`,
          });
        }
        updateData.name = input.name;
      }

      if (input.jellyfinUserId !== undefined) {
        const jellyfinUserExists = await ctx.db.jellyfinUser.findUnique({
          where: { id: input.jellyfinUserId },
        });
        if (!jellyfinUserExists) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Jellyfin user link not found for ID: ${input.jellyfinUserId}`,
          });
        }
        updateData.jellyfinUserId = input.jellyfinUserId;
      }

      const profile = await ctx.db.profile.update({
        where: { id: input.id },
        data: updateData,
        include: {
          jellyfinUser: {
            select: { id: true, username: true, jellyfinUserId: true },
          },
        },
      });

      return profile;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.session.user.jellyfin?.isAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only admins can delete profiles",
        });
      }

      const profile = await ctx.db.profile.findUnique({
        where: { id: input.id },
      });

      if (!profile) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Profile not found.",
        });
      }

      if (profile.isDefault) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Cannot delete the default profile. Set another profile as default first.",
        });
      }

      await ctx.db.profile.delete({
        where: {
          id: input.id,
        },
      });

      return { success: true };
    }),

  setDefault: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.session.user.jellyfin?.isAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only admins can set the default profile",
        });
      }

      const profileExists = await ctx.db.profile.findUnique({
        where: { id: input.id },
      });
      if (!profileExists) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Profile not found.",
        });
      }

      await ctx.db.$transaction(async (tx) => {
        await tx.profile.updateMany({ data: { isDefault: false } });
        await tx.profile.update({
          where: { id: input.id },
          data: { isDefault: true },
        });
      });

      return { success: true };
    }),

  invites: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.session.user.jellyfin?.isAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only admins can view profile invites",
        });
      }

      const invites = await ctx.db.invite.findMany({
        where: { profileId: input.id },
        include: {
          createdBy: {
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

      const profileExists = await ctx.db.profile.findUnique({
        where: { id: input.id },
        select: { id: true },
      });

      if (!profileExists) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Profile not found.",
        });
      }

      return invites;
    }),

  createInvite: protectedProcedure
    .input(
      z.object({
        profileId: z.string(),
        expiresAt: z.date().optional(),
        maxUses: z.number().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.session.user.jellyfin?.isAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only admins can create invites",
        });
      }

      const profile = await ctx.db.profile.findUnique({
        where: { id: input.profileId },
      });

      if (!profile) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Profile not found",
        });
      }

      const creatorId = ctx.session.user.id;
      const code = crypto.randomBytes(8).toString("hex");

      const invite = await ctx.db.invite.create({
        data: {
          code,
          createdAt: new Date(),
          expiresAt: input.expiresAt,
          maxUses: input.maxUses,
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
});
