import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { TRPCError } from "@trpc/server";
import crypto from "crypto";

const createProfileSchema = z.object({
  name: z.string(),
  jellyfinTemplateUserId: z.string().optional(),
});

const updateProfileSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  jellyfinTemplateUserId: z.string().optional(),
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
          select: { Invite: true },
        },
      },
      orderBy: {
        name: "asc",
      },
    });

    return profiles.map((p) => ({
      ...p,
      inviteCount: p._count.Invite,
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
          Invite: true,
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
          jellyfinTemplateUserId: input.jellyfinTemplateUserId,
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

      const updateData: Record<string, unknown> = {};

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

      if (input.jellyfinTemplateUserId !== undefined) {
        updateData.jellyfinTemplateUserId = input.jellyfinTemplateUserId;
      }

      const profile = await ctx.db.profile.update({
        where: { id: input.id },
        data: updateData,
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
        include: {
          _count: {
            select: { Invite: true },
          },
        },
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

      if (profile._count.Invite > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot delete profile as it is used by ${profile._count.Invite} invite(s)`,
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

      const profile = await ctx.db.profile.findUnique({
        where: { id: input.id },
        include: {
          Invite: {
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
          },
        },
      });

      if (!profile) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Profile not found.",
        });
      }

      return profile.Invite;
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
