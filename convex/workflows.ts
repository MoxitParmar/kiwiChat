import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

// createWorkflow — inserts workflow row + one workflowNode row per node in dagJson
export const createWorkflow = mutation({
  args: {
    conversationId: v.id('conversations'),
    userId: v.string(),
    dagJson: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const workflowId = await ctx.db.insert('workflows', {
      conversationId: args.conversationId,
      userId: args.userId,
      status: 'pending_approval',
      dagJson: args.dagJson,
      createdAt: now,
    });

    const dag = JSON.parse(args.dagJson);
    for (const node of dag.nodes) {
      await ctx.db.insert('workflowNodes', {
        workflowId,
        nodeId: node.id,
        tool: node.tool,
        status: 'pending',
      });
    }

    return workflowId;
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