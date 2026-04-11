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

    workflows: defineTable({
    conversationId: v.id("conversations"),
    userId: v.string(),
    status: v.union(
      v.literal("pending_approval"),
      v.literal("approved"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed")
    ),
    dagJson: v.string(),
    createdAt: v.number(),
  })
  .index("by_conversation_id_and_created_at", ["conversationId", "createdAt"]),

  workflowNodes: defineTable({
    workflowId: v.id("workflows"),
    nodeId: v.string(),
    tool: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed")
    ),
    output: v.optional(v.string()),
    error: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
  })
  .index("by_workflow_id_and_node_id", ["workflowId", "nodeId"]),


});