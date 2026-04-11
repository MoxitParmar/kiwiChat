import { auth } from '@clerk/nextjs/server';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '@/convex/_generated/api';

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { workflowId } = await req.json();
  if (!workflowId) {
    return new Response('Missing workflowId', { status: 400 });
  }

  const workflow = await convex.query(api.workflows.getWorkflow, {
    workflowId: workflowId as any,
  });

  if (!workflow) {
    return new Response('Workflow not found', { status: 404 });
  }

  const runningNodes = (workflow.nodes ?? []).filter((node: any) => node.status === 'running');
  for (const runningNode of runningNodes) {
    await convex.mutation(api.workflows.updateNodeStatus, {
      workflowId: workflowId as any,
      nodeId: runningNode.nodeId,
      status: 'failed',
      error: 'Stopped by user',
    });
  }

  await convex.mutation(api.workflows.updateWorkflowStatus, {
    workflowId: workflowId as any,
    status: 'failed',
  });

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
}