
import { Id } from "../_generated/dataModel";
import { mutation } from "../_generated/server";
import { v } from "convex/values";

export const createUser = mutation({
  args: {
    clerkUserId: v.string(),
    name: v.string(),
    imageUrl: v.string(),
    email: v.string(),
  },

  handler: async (ctx, args) => {
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) =>
        q.eq("clerkUserId", args.clerkUserId)
      )
      .unique();

    if (existingUser) {
      return existingUser._id;
    }

    const now = Date.now();

    const userId = await ctx.db.insert("users", {
      clerkUserId: args.clerkUserId,
      name: args.name,
      imageUrl: args.imageUrl,
      email: args.email,
      createdAt: now,
      updatedAt: now,
    });

    return userId;
  },
});

export const updateUser = mutation({
  args: {
    userId: v.id("users"),
    name: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    email: v.optional(v.string()),
  },

  handler: async (ctx, args) => {
    const { userId, ...fields } = args;
    const user  = ctx.db.get(args.userId);

    if (!user) {
      throw new Error("User not found");
    }

    await ctx.db.patch(args.userId as Id<"users">, {
      ...fields,
      updatedAt: Date.now(),
    });

    return ;
  },
});

export const deleteUser = mutation({
  args: {
    userId: v.id("users"),
  },

  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);

    if (!user) {
      throw new Error("User not found");
    }

    

    /* ---------------- DELETE USER ---------------- */

    await ctx.db.delete(args.userId);

    return { success: true };
  },
});