import { z } from "zod";
import {
  createTRPCRouter,
  // protectedProcedure, // TODO: Re-enable protectedProcedure once auth is working
  publicProcedure, // Use publicProcedure temporarily
} from "@/server/api/trpc";
import { TRPCError } from "@trpc/server";
import crypto from "crypto";

// TODO: Re-enable admin checks once auth is working

// Schema for profile creation
const createProfileSchema = z.object({
    name: z.string(),
    jellyfinTemplateUserId: z.string().optional(),
});

// Schema for updating profile
const updateProfileSchema = z.object({
    id: z.string(),
    name: z.string().optional(),
    jellyfinTemplateUserId: z.string().optional(),
});

export const profilesRouter = createTRPCRouter({
    // list profiles - temporarily public
    list: publicProcedure.query(async ({ ctx }) => {
        // TODO: Re-enable admin check: !ctx.session.user.jellyfin?.isAdmin
        // if (!ctx.session?.user?.jellyfin?.isAdmin) { // Optional: Still check if session exists and is admin?
        //     throw new TRPCError({
        //         code: "FORBIDDEN",
        //         message: "Only admins can list profiles",
        //     });
        // }

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

        return profiles.map(p => ({
            ...p,
                inviteCount: p._count.Invite,
        }));
    }),

    // get profile by id - temporarily public
    getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
        // TODO: Re-enable admin check: !ctx.session.user.jellyfin?.isAdmin
        // if (!ctx.session?.user?.jellyfin?.isAdmin) {
        //     throw new TRPCError({
        //         code: "FORBIDDEN",
        //         message: "Only admins can view profile details",
        //     });
        // }

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

    // create profile - temporarily public
    create: publicProcedure
    .input(createProfileSchema)
    .mutation(async ({ ctx, input }) => {
        // TODO: Re-enable admin check: !ctx.session.user.jellyfin?.isAdmin
        // if (!ctx.session?.user?.jellyfin?.isAdmin) {
        //     throw new TRPCError({
        //         code: "FORBIDDEN",
        //         message: "Only admins can create profiles",
        //     });
        // }

        const profile = await ctx.db.profile.create({
            data: {
                name: input.name,
                jellyfinTemplateUserId: input.jellyfinTemplateUserId,
            },
        });

        return profile;
    }),

    // update profile - temporarily public
    update: publicProcedure
    .input(updateProfileSchema)
    .mutation(async ({ ctx, input }) => {
        // TODO: Re-enable admin check: !ctx.session.user.jellyfin?.isAdmin
        // if (!ctx.session?.user?.jellyfin?.isAdmin) {
        //     throw new TRPCError({
        //         code: "FORBIDDEN",
        //         message: "Only admins can update profiles",
        //     });
        // }

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

    // delete profile - temporarily public
    delete: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
        // TODO: Re-enable admin check: !ctx.session.user.jellyfin?.isAdmin
        // if (!ctx.session?.user?.jellyfin?.isAdmin) {
        //     throw new TRPCError({
        //         code: "FORBIDDEN",
        //         message: "Only admins can delete profiles",
        //     });
        // }

        // Check if profile is the default one
        const profile = await ctx.db.profile.findUnique({
            where: { id: input.id },
        });

        if (profile?.isDefault) {
            throw new TRPCError({
                code: "BAD_REQUEST",
                message: "Cannot delete the default profile. Set another profile as default first.",
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

    // set profile as default - temporarily public
    setDefault: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
        // TODO: Re-enable admin check: !ctx.session.user.jellyfin?.isAdmin
        // if (!ctx.session?.user?.jellyfin?.isAdmin) {
        //     throw new TRPCError({
        //         code: "FORBIDDEN",
        //         message: "Only admins can set the default profile",
        //     });
        // }

        // Use a transaction to ensure atomicity
        await ctx.db.$transaction(async (tx) => {
            // Set all profiles to not default
            await tx.profile.updateMany({
                data: { isDefault: false },
            });

            // Set the specified profile to default
            await tx.profile.update({
                where: { id: input.id },
                data: { isDefault: true },
            });
        });

        return { success: true };
    }),

    // get invites for a profile - temporarily public
    invites: publicProcedure // Changed from protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
        // TODO: Re-enable admin check: !ctx.session.user.jellyfin?.isAdmin
        // if (!ctx.session?.user?.jellyfin?.isAdmin) { 
        //     throw new TRPCError({
        //         code: "FORBIDDEN",
        //         message: "Only admins can view profile invites",
        //     });
        // }
        
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
    
    // create new invites for a profile - temporarily public
    createInvite: publicProcedure // Changed from protectedProcedure
    .input(z.object({
        profileId: z.string(),
        expiresAt: z.date().optional(),
        maxUses: z.number().optional(),
        // Note: createdById is no longer taken as input, derived from session if available
    }))
    .mutation(async ({ ctx, input }) => {
        // TODO: Re-enable admin check: !ctx.session.user.jellyfin?.isAdmin
        // if (!ctx.session?.user?.jellyfin?.isAdmin) {
        //     throw new TRPCError({
        //         code: "FORBIDDEN",
        //         message: "Only admins can create invites",
        //     });
        // }
        
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
        
        // --- Temporary Creator ID Logic --- 
        let creatorId: string | undefined = ctx.session?.user?.id;
        if (!creatorId) {
            // If no logged-in user, find the first user in the DB as a fallback
            const fallbackUser = await ctx.db.user.findFirst();
            if (!fallbackUser) {
                throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: "Cannot create invite: No users found in the database to assign as creator."
                });
            }
            creatorId = fallbackUser.id;
            // Optional: Log a warning that a fallback user was used
            console.warn(`WARN: No session user found for invite creation. Using fallback user ID: ${creatorId}`);
        }
        // --- End Temporary Creator ID Logic ---
        
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
                        id: creatorId, // Use determined creator ID
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