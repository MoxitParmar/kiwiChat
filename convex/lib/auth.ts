import { Id } from "../_generated/dataModel";
import { MutationCtx, QueryCtx } from "../_generated/server";

export async function getAuthData(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();


  if (!identity) {
    throw new Error("Unauthorized");
  }

  return {
    userId: identity.subject,
  };
}

export async function getCurrentUser(ctx: MutationCtx | QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();

  if (!identity) {
    throw new Error("Unauthorized");
  }

  const clerkUserId = identity.subject;
  // find user
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", clerkUserId))
    .unique();

  if (!user) {
    throw new Error("User not found in database");
  }


  return {
    clerkUserId,
    userId: user._id as Id<"users">,
    user,
  };
}