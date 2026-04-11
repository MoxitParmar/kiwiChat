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

   conversations: defineTable({
    ownerUserId: v.id("users"),
    title: v.string(),
    lastMessagePreview: v.string(),
    lastMessageAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
  .index("by_owner_user_id_and_updated_at", ["ownerUserId", "updatedAt"])
  .index("by_owner_user_id_and_last_message_at", ["ownerUserId", "lastMessageAt"]),

  messages: defineTable({
    conversationId: v.id("conversations"),
    clientMessageId: v.optional(v.string()),
    authorUserId: v.union(v.id("users"), v.null()),
    role: v.union(
      v.literal("user"),
      v.literal("assistant"),
      v.literal("system")
    ),
    content: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
  .index("by_conversation_id_and_created_at", ["conversationId", "createdAt"])
  .index("by_conversation_id_and_client_message_id", [
    "conversationId",
    "clientMessageId",
  ]),

});