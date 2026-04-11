import { auth } from '@clerk/nextjs/server';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '@/convex/_generated/api';
import { tasks } from '@trigger.dev/sdk/v3';
import type { executeWorkflow } from '@/trigger/executeWorkflow';

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

  // Fetch the workflow from Convex to get dagJson
  const workflow = await convex.query(api.workflows.getWorkflow, {
    workflowId: workflowId as any,
  });

  if (!workflow) {
    return new Response('Workflow not found', { status: 404 });
  }

  // Approve the workflow in Convex
  await convex.mutation(api.workflows.approveWorkflow, {
    workflowId: workflowId as any,
  });

  // Trigger the Trigger.dev task
  await tasks.trigger<typeof executeWorkflow>('execute-workflow', {
    workflowId,
    dagJson: workflow.dagJson,
    userId,
  });

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
}