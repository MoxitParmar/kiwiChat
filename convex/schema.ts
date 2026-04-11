import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({

  users: defineTable({
    clerkUserId: v.string(),
    name: v.string(),
    imageUrl: v.string(),
    email: v.string(),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
  .index("by_clerk_user_id", ["clerkUserId"]),


});