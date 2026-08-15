import { auth } from '@clerk/nextjs/server';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '@/convex/_generated/api';
import { tasks } from '@trigger.dev/sdk/v3';
import type { executeWorkflow } from '@/trigger/executeWorkflow';
import { getResolvedLocalModelSettings } from '@/lib/ai/provider';
import type { LocalAiSettings } from '@/lib/ai/local-settings';

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { workflowId, dagOverride, localAiSettings } = await req.json() as {
    workflowId?: string;
    dagOverride?: unknown;
    localAiSettings?: Partial<LocalAiSettings>;
  };
  if (!workflowId) {
    return new Response('Missing workflowId', { status: 400 });
  }

  const resolvedLocalAiSettings = localAiSettings
    ? await getResolvedLocalModelSettings(localAiSettings)
    : undefined;

  // Fetch the workflow from Convex to get dagJson
  const workflow = await convex.query(api.workflows.getWorkflow, {
    workflowId: workflowId as any,
  });

  if (!workflow) {
    return new Response('Workflow not found', { status: 404 });
  }

  if (workflow.userId !== userId) {
    return new Response('Unauthorized', { status: 401 });
  }

  let dagJson = workflow.dagJson;
  if (dagOverride && typeof dagOverride === 'object') {
    dagJson = JSON.stringify(dagOverride);
  }

  // Approve the workflow in Convex
  await convex.mutation(api.workflows.approveWorkflow, {
    workflowId: workflowId as any,
  });

  // Trigger the Trigger.dev task
  await tasks.trigger<typeof executeWorkflow>('execute-workflow', {
    workflowId,
    dagJson,
    userId,
    localAiSettings: resolvedLocalAiSettings,
  });

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
}