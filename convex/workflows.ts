import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { getCurrentUser } from './lib/auth';

const DEFAULT_LIST_LIMIT = 50;

function parseDag(dagJson: string) {
  const parsed = JSON.parse(dagJson) as { nodes?: Array<{ id: string; tool: string }> };
  if (!Array.isArray(parsed.nodes) || parsed.nodes.length === 0) {
    throw new Error('Workflow DAG has no nodes');
  }
  return parsed;
}

async function insertWorkflowWithNodes(
  ctx: MutationCtx,
  args: {
    conversationId: Id<'conversations'>;
    userId: string;
    dagJson: string;
  }
) {
  const now = Date.now();
  const workflowId = await ctx.db.insert('workflows', {
    conversationId: args.conversationId,
    userId: args.userId,
    status: 'pending_approval',
    dagJson: args.dagJson,
    createdAt: now,
  });

  const dag = parseDag(args.dagJson);
  for (const node of dag.nodes ?? []) {
    await ctx.db.insert('workflowNodes', {
      workflowId,
      nodeId: node.id,
      tool: node.tool,
      status: 'pending',
    });
  }

  return workflowId;
}

async function getOwnedWorkflow(
  ctx: QueryCtx | MutationCtx,
  workflowId: Id<'workflows'>
) {
  const { userId, clerkUserId } = await getCurrentUser(ctx);
  const workflow = await ctx.db.get(workflowId);
  if (!workflow) {
    throw new Error('Workflow not found');
  }

  const conversation = await ctx.db.get(workflow.conversationId);
  if (!conversation || conversation.ownerUserId !== userId) {
    throw new Error('Unauthorized');
  }

  if (workflow.userId !== clerkUserId) {
    throw new Error('Unauthorized');
  }

  return { workflow, userId, clerkUserId };
}

// createWorkflow — inserts workflow row + one workflowNode row per node in dagJson
export const createWorkflow = mutation({
  args: {
    conversationId: v.id('conversations'),
    userId: v.string(),
    dagJson: v.string(),
  },
  handler: async (ctx, args) => {
    return insertWorkflowWithNodes(ctx, args);
  },
});

export const updateWorkflowDag = mutation({
  args: {
    workflowId: v.id('workflows'),
    dagJson: v.string(),
  },
  handler: async (ctx, args) => {
    const { workflow } = await getOwnedWorkflow(ctx, args.workflowId);
    parseDag(args.dagJson);

    await ctx.db.patch(args.workflowId, {
      dagJson: args.dagJson,
      status: workflow.status === 'pending_approval' ? 'pending_approval' : workflow.status,
    });

    return { success: true };
  },
});

// approveWorkflow — sets status to "approved"
export const approveWorkflow = mutation({
  args: { workflowId: v.id('workflows') },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.workflowId, { status: 'approved' });
    return { success: true };
  },
});

export const updateWorkflowStatus = mutation({
  args: {
    workflowId: v.id('workflows'),
    status: v.union(
      v.literal('pending_approval'),
      v.literal('approved'),
      v.literal('running'),
      v.literal('completed'),
      v.literal('failed')
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.workflowId, { status: args.status });
    return { success: true };
  },
});

// updateNodeStatus — updates a workflowNode by workflowId + nodeId
export const updateNodeStatus = mutation({
  args: {
    workflowId: v.id('workflows'),
    nodeId: v.string(),
    status: v.union(
      v.literal('pending'),
      v.literal('running'),
      v.literal('completed'),
      v.literal('failed')
    ),
    output: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const node = await ctx.db
      .query('workflowNodes')
      .withIndex('by_workflow_id_and_node_id', (q) =>
        q.eq('workflowId', args.workflowId).eq('nodeId', args.nodeId)
      )
      .unique();

    if (!node) throw new Error(`Node ${args.nodeId} not found`);

    const patch: any = { status: args.status };
    if (args.status === 'running') patch.startedAt = Date.now();
    if (args.status === 'completed' || args.status === 'failed') {
      patch.completedAt = Date.now();
    }
    if (args.output !== undefined) patch.output = args.output;
    if (args.error !== undefined) patch.error = args.error;

    await ctx.db.patch(node._id, patch);
    return { success: true };
  },
});

// getWorkflow — returns workflow + all its nodes (use query for Convex real-time)
export const getWorkflow = query({
  args: { workflowId: v.id('workflows') },
  handler: async (ctx, args) => {
    const workflow = await ctx.db.get(args.workflowId);
    if (!workflow) return null;
    const nodes = await ctx.db
      .query('workflowNodes')
      .withIndex('by_workflow_id_and_node_id', (q) =>
        q.eq('workflowId', args.workflowId)
      )
      .collect();
    return { ...workflow, nodes };
  },
});

export const saveCompletedWorkflow = mutation({
  args: {
    workflowId: v.id('workflows'),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const { workflow, userId } = await getOwnedWorkflow(ctx, args.workflowId);
    const name = args.name.trim();
    if (!name) {
      throw new Error('Workflow name is required');
    }

    if (workflow.status !== 'completed') {
      throw new Error('Only completed workflows can be saved');
    }

    const now = Date.now();
    const savedWorkflowId = await ctx.db.insert('savedWorkflows', {
      ownerUserId: userId,
      sourceWorkflowId: workflow._id,
      name,
      dagJson: workflow.dagJson,
      runCount: 0,
      createdAt: now,
      updatedAt: now,
    });

    return { savedWorkflowId };
  },
});

export const listSavedWorkflows = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { userId } = await getCurrentUser(ctx);
    const limit = Math.min(args.limit ?? DEFAULT_LIST_LIMIT, 100);

    const workflows = await ctx.db
      .query('savedWorkflows')
      .withIndex('by_owner_user_id_and_updated_at', (q) =>
        q.eq('ownerUserId', userId)
      )
      .order('desc')
      .take(limit);

    return workflows;
  },
});

export const deleteSavedWorkflow = mutation({
  args: {
    savedWorkflowId: v.id('savedWorkflows'),
  },
  handler: async (ctx, args) => {
    const { userId } = await getCurrentUser(ctx);
    const savedWorkflow = await ctx.db.get(args.savedWorkflowId);
    if (!savedWorkflow || savedWorkflow.ownerUserId !== userId) {
      throw new Error('Saved workflow not found');
    }

    await ctx.db.delete(args.savedWorkflowId);
    return { success: true };
  },
});

export const createWorkflowFromSaved = mutation({
  args: {
    savedWorkflowId: v.id('savedWorkflows'),
    conversationId: v.id('conversations'),
  },
  handler: async (ctx, args) => {
    const { userId, clerkUserId } = await getCurrentUser(ctx);
    const savedWorkflow = await ctx.db.get(args.savedWorkflowId);
    if (!savedWorkflow || savedWorkflow.ownerUserId !== userId) {
      throw new Error('Saved workflow not found');
    }

    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation || conversation.ownerUserId !== userId) {
      throw new Error('Conversation not found');
    }

    const workflowId = await insertWorkflowWithNodes(ctx, {
      conversationId: args.conversationId,
      dagJson: savedWorkflow.dagJson,
      userId: clerkUserId,
    });

    await ctx.db.patch(args.savedWorkflowId, {
      runCount: savedWorkflow.runCount + 1,
      lastRunAt: Date.now(),
      updatedAt: Date.now(),
    });

    return { workflowId };
  },
});

// getWorkflowByConversationId — returns latest workflow for a conversation
export const getWorkflowByConversationId = query({
  args: { conversationId: v.id('conversations') },
  handler: async (ctx, args) => {
    const workflow = await ctx.db
      .query('workflows')
      .withIndex('by_conversation_id_and_created_at', (q) =>
        q.eq('conversationId', args.conversationId)
      )
      .order('desc')
      .first();
    if (!workflow) return null;
    const nodes = await ctx.db
      .query('workflowNodes')
      .withIndex('by_workflow_id_and_node_id', (q) =>
        q.eq('workflowId', workflow._id)
      )
      .collect();
    return { ...workflow, nodes };
  },
});