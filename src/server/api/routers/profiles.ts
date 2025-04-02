import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { TRPCError } from "@trpc/server";
import crypto from "crypto";

// Schema for profile creation
const createProfileSchema = z.object({
    name: z.string(),
    jellyfinTemplateUserId: z.string().optional(),
});

export const profilesRouter = createTRPCRouter({
    // list profiles - admin only
    list: protectedProcedure.query(async ({ ctx }) => {
        if (!ctx.session.user.jellyfin?.isAdmin) {
            throw new TRPCError({
                code: "FORBIDDEN",
                message: "Only admins can list profiles",
            });
        }

        const profiles = await ctx.db.profile.findMany({
            orderBy: {
                name: "asc",
            },
        });

        return profiles;
    }),

    // get profile by id - admin only
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
        });

        if (!profile) {
            throw new TRPCError({
                code: "NOT_FOUND",
                message: "Profile not found",
            });
        }

        return profile;
    }),

    // create profile - admin only
    create: protectedProcedure
    .input(createProfileSchema)
    .mutation(async ({ ctx, input }) => {
        if (!ctx.session.user.jellyfin?.isAdmin) {
            throw new TRPCError({
                code: "FORBIDDEN",
                message: "Only admins can create profiles",
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

    // update profile - admin only
    update: protectedProcedure
    .input(z.object({
        id: z.string(),
        name: z.string().optional(),
        jellyfinTemplateUserId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
        if (!ctx.session.user.jellyfin?.isAdmin) {
            throw new TRPCError({
                code: "FORBIDDEN",
                message: "Only admins can update profiles",
            });
        }

        const updateData: Record<string, unknown> = {};
        
        if (input.name !== undefined) {
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

    // delete profile - admin only
    delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
        if (!ctx.session.user.jellyfin?.isAdmin) {
            throw new TRPCError({
                code: "FORBIDDEN",
                message: "Only admins can delete profiles",
            });
        }

        // Check if profile is used by any invites
        const inviteCount = await ctx.db.invite.count({
            where: {
                profileId: input.id,
            },
        });

        if (inviteCount > 0) {
            throw new TRPCError({
                code: "BAD_REQUEST",
                message: "Cannot delete profile as it is used by invites",
            });
        }

        await ctx.db.profile.delete({
            where: {
                id: input.id,
            },
        });

        return { success: true };
    }),

    // get invites for a profile - admin only
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
        
        return invites;
    }),
    
    // create new invites for a profile - admin only
    createInvite: protectedProcedure
    .input(z.object({
        profileId: z.string(),
        expiresAt: z.date().optional(),
        maxUses: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
        if (!ctx.session.user.jellyfin?.isAdmin) {
            throw new TRPCError({
                code: "FORBIDDEN",
                message: "Only admins can create invites",
            });
        }
        
        // Check if profile exists
        const profile = await ctx.db.profile.findUnique({
            where: { id: input.profileId },
        });
        
        if (!profile) {
            throw new TRPCError({
                code: "NOT_FOUND",
                message: "Profile not found",
            });
        }
        
        // Generate a unique invite code
        const code = crypto.randomBytes(8).toString("hex");
        
        // Create the invite
        const invite = await ctx.db.invite.create({
            data: {
                code,
                createdAt: new Date(),
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
});