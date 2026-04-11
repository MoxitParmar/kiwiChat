import { internal } from "./_generated/api";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUser } from "./lib/auth";
import type { Id } from "./_generated/dataModel";

const DEFAULT_CONVERSATION_TITLE = "New chat";
const MAX_CONVERSATION_TITLE_LENGTH = 64;
const MAX_MESSAGE_PREVIEW_LENGTH = 120;
const DEFAULT_CONVERSATION_LIMIT = 30;
const DEFAULT_MESSAGE_LIMIT = 500;
const DELETE_BATCH_SIZE = 100;

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function buildConversationTitle(message: string) {
  const normalized = normalizeText(message);

  if (!normalized) {
    return DEFAULT_CONVERSATION_TITLE;
  }

  return truncateText(normalized, MAX_CONVERSATION_TITLE_LENGTH);
}

function buildMessagePreview(message: string) {
  const normalized = normalizeText(message);

  if (!normalized) {
    return "";
  }

  return truncateText(normalized, MAX_MESSAGE_PREVIEW_LENGTH);
}

async function getOwnedConversation(
  ctx: QueryCtx | MutationCtx,
  conversationId: Id<"conversations">,
) {
  const { userId } = await getCurrentUser(ctx);
  const conversation = await ctx.db.get(conversationId);

  if (!conversation || conversation.ownerUserId !== userId) {
    throw new Error("Conversation not found");
  }

  return { userId, conversation };
}

async function getLatestMessage(
  ctx: QueryCtx | MutationCtx,
  conversationId: Id<"conversations">,
) {
  const messages = await ctx.db
    .query("messages")
    .withIndex("by_conversation_id_and_created_at", (q) =>
      q.eq("conversationId", conversationId)
    )
    .order("desc")
    .take(1);

  return messages[0] ?? null;
}

async function refreshConversationSummaryFromLatestMessage(
  ctx: MutationCtx,
  conversationId: Id<"conversations">,
) {
  const { conversation } = await getOwnedConversation(ctx, conversationId);
  const latestMessage = await getLatestMessage(ctx, conversationId);
  const now = Date.now();

  if (!latestMessage) {
    await ctx.db.patch(conversationId, {
      lastMessagePreview: "",
      lastMessageAt: Math.max(conversation.lastMessageAt, conversation.createdAt),
      updatedAt: now,
    });

    return;
  }

  await ctx.db.patch(conversationId, {
    lastMessagePreview: buildMessagePreview(latestMessage.content),
    lastMessageAt: Math.max(conversation.lastMessageAt, latestMessage.createdAt, now),
    updatedAt: now,
  });
}

export const listConversations = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { userId } = await getCurrentUser(ctx);
    const limit = Math.min(args.limit ?? DEFAULT_CONVERSATION_LIMIT, 100);

    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_owner_user_id_and_last_message_at", (q) =>
        q.eq("ownerUserId", userId)
      )
      .order("desc")
      .take(limit);

    return conversations;
  },
});

export const getConversation = query({
  args: {
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    const { conversation } = await getOwnedConversation(ctx, args.conversationId);
    return conversation;
  },
});

export const listMessages = query({
  args: {
    conversationId: v.id("conversations"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await getOwnedConversation(ctx, args.conversationId);
    const limit = Math.min(args.limit ?? DEFAULT_MESSAGE_LIMIT, 500);

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversation_id_and_created_at", (q) =>
        q.eq("conversationId", args.conversationId)
      )
      .order("asc")
      .take(limit);

    return messages;
  },
});

export const createConversation = mutation({
  args: {
    title: v.optional(v.string()),
    firstMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await getCurrentUser(ctx);
    const now = Date.now();
    const firstMessage = args.firstMessage ? normalizeText(args.firstMessage) : "";

    if (args.firstMessage && !firstMessage) {
      throw new Error("Conversation message cannot be empty");
    }

    const title = normalizeText(args.title ?? "") || buildConversationTitle(firstMessage);
    const preview = buildMessagePreview(firstMessage);

    const conversationId = await ctx.db.insert("conversations", {
      ownerUserId: user._id,
      title,
      lastMessagePreview: preview,
      lastMessageAt: now,
      createdAt: now,
      updatedAt: now,
    });

    let messageId: Id<"messages"> | null = null;

    if (firstMessage) {
      messageId = await ctx.db.insert("messages", {
        conversationId,
        authorUserId: user._id,
        role: "user",
        content: firstMessage,
        createdAt: now,
        updatedAt: now,
      });

      await ctx.db.patch(conversationId, {
        lastMessagePreview: preview,
        lastMessageAt: now,
        updatedAt: now,
      });
    }

    return { conversationId, messageId };
  },
});

export const appendMessage = mutation({
  args: {
    conversationId: v.id("conversations"),
    role: v.union(
      v.literal("user"),
      v.literal("assistant"),
      v.literal("system")
    ),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId, conversation } = await getOwnedConversation(
      ctx,
      args.conversationId,
    );
    const now = Date.now();
    const content = normalizeText(args.content);

    if (!content) {
      throw new Error("Message cannot be empty");
    }

    const messageId = await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      authorUserId: args.role === "assistant" || args.role === "system" ? null : userId,
      role: args.role,
      content,
      createdAt: now,
      updatedAt: now,
    });

    const shouldUpdateTitle =
      args.role === "user" &&
      (conversation.title === DEFAULT_CONVERSATION_TITLE || conversation.title.trim().length === 0);

    await ctx.db.patch(args.conversationId, {
      title: shouldUpdateTitle ? buildConversationTitle(content) : conversation.title,
      lastMessagePreview: buildMessagePreview(content),
      lastMessageAt: now,
      updatedAt: now,
    });

    return { messageId };
  },
});

export const syncConversationMessages = mutation({
  args: {
    conversationId: v.id("conversations"),
    messages: v.array(
      v.object({
        clientMessageId: v.string(),
        role: v.union(
          v.literal("user"),
          v.literal("assistant"),
          v.literal("system")
        ),
        content: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const { userId, conversation } = await getOwnedConversation(
      ctx,
      args.conversationId,
    );
    const now = Date.now();
    const normalizedMessages = args.messages.map((message, index) => ({
      ...message,
      createdAt: now + index,
    }));

    for (const message of normalizedMessages) {
      if (!message.content.trim()) {
        throw new Error("Message cannot be empty");
      }
    }

    const existingMessages = await ctx.db
      .query("messages")
      .withIndex("by_conversation_id_and_created_at", (q) =>
        q.eq("conversationId", args.conversationId)
      )
      .take(500);

    const existingByClientMessageId = new Map(
      existingMessages
        .filter((message) => message.clientMessageId)
        .map((message) => [message.clientMessageId as string, message])
    );
    const incomingClientMessageIds = new Set(
      normalizedMessages.map((message) => message.clientMessageId)
    );

    for (const existingMessage of existingMessages) {
      if (
        existingMessage.clientMessageId &&
        !incomingClientMessageIds.has(existingMessage.clientMessageId)
      ) {
        await ctx.db.delete(existingMessage._id);
      }
    }

    let firstUserMessage: string | null = null;

    for (const [index, message] of normalizedMessages.entries()) {
      if (!firstUserMessage && message.role === "user") {
        firstUserMessage = message.content;
      }

      const existingMessage = existingByClientMessageId.get(message.clientMessageId);
      const createdAt = now + index;

      if (existingMessage) {
        const patch: {
          role?: "user" | "assistant" | "system";
          content?: string;
          updatedAt?: number;
        } = {};

        if (existingMessage.role !== message.role) {
          patch.role = message.role;
        }

        if (existingMessage.content !== message.content) {
          patch.content = message.content;
        }

        if (Object.keys(patch).length > 0) {
          patch.updatedAt = createdAt;
          await ctx.db.patch(existingMessage._id, patch);
        }
      } else {
        await ctx.db.insert("messages", {
          conversationId: args.conversationId,
          clientMessageId: message.clientMessageId,
          authorUserId:
            message.role === "assistant" || message.role === "system"
              ? null
              : userId,
          role: message.role,
          content: message.content,
          createdAt,
          updatedAt: createdAt,
        });
      }
    }

    const nextTitle =
      conversation.title === DEFAULT_CONVERSATION_TITLE && firstUserMessage
        ? buildConversationTitle(firstUserMessage)
        : conversation.title;

    if (nextTitle !== conversation.title) {
      await ctx.db.patch(conversation._id, {
        title: nextTitle,
        updatedAt: now,
      });
    }

    await refreshConversationSummaryFromLatestMessage(ctx, conversation._id);

    return { success: true };
  },
});

export const renameConversation = mutation({
  args: {
    conversationId: v.id("conversations"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    await getOwnedConversation(ctx, args.conversationId);
    const title = normalizeText(args.title);

    if (!title) {
      throw new Error("Conversation title cannot be empty");
    }

    await ctx.db.patch(args.conversationId, {
      title: truncateText(title, MAX_CONVERSATION_TITLE_LENGTH),
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

export const updateMessage = mutation({
  args: {
    messageId: v.id("messages"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId } = await getCurrentUser(ctx);
    const message = await ctx.db.get(args.messageId);

    if (!message) {
      throw new Error("Message not found");
    }

    const conversation = await ctx.db.get(message.conversationId);

    if (!conversation || conversation.ownerUserId !== userId) {
      throw new Error("Conversation not found");
    }

    const content = normalizeText(args.content);
    if (!content) {
      throw new Error("Message cannot be empty");
    }

    await ctx.db.patch(args.messageId, {
      content,
      updatedAt: Date.now(),
    });

    if (conversation.lastMessageAt === message.createdAt) {
      await ctx.db.patch(conversation._id, {
        lastMessagePreview: buildMessagePreview(content),
        updatedAt: Date.now(),
      });
    }

    return { success: true };
  },
});

export const deleteMessage = mutation({
  args: {
    messageId: v.id("messages"),
  },
  handler: async (ctx, args) => {
    const { userId } = await getCurrentUser(ctx);
    const message = await ctx.db.get(args.messageId);

    if (!message) {
      throw new Error("Message not found");
    }

    const conversation = await ctx.db.get(message.conversationId);

    if (!conversation || conversation.ownerUserId !== userId) {
      throw new Error("Conversation not found");
    }

    const wasLatestMessage = conversation.lastMessageAt === message.createdAt;

    await ctx.db.delete(args.messageId);

    if (wasLatestMessage) {
      await refreshConversationSummaryFromLatestMessage(ctx, conversation._id);
    }

    return { success: true };
  },
});

export const deleteConversation = mutation({
  args: {
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    await getOwnedConversation(ctx, args.conversationId);
    await ctx.scheduler.runAfter(0, internal.chat.deleteConversationBatch, {
      conversationId: args.conversationId,
    });

    return { success: true };
  },
});

export const deleteConversationBatch = internalMutation({
  args: {
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId);

    if (!conversation) {
      return { done: true };
    }

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversation_id_and_created_at", (q) =>
        q.eq("conversationId", args.conversationId)
      )
      .order("asc")
      .take(DELETE_BATCH_SIZE);

    for (const message of messages) {
      await ctx.db.delete(message._id);
    }

    if (messages.length === DELETE_BATCH_SIZE) {
      await ctx.scheduler.runAfter(0, internal.chat.deleteConversationBatch, {
        conversationId: args.conversationId,
      });

      return { done: false };
    }

    await ctx.db.delete(conversation._id);

    return { done: true };
  },
});