import { task } from '@trigger.dev/sdk/v3';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '@/convex/_generated/api';
import { experimental_createMCPClient as createMCPClient } from '@ai-sdk/mcp';
import { Composio } from '@composio/core';

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

// Topological sort using Kahn's algorithm
function topologicalSort(nodes: any[]): any[][] {
  const inDegree: Record<string, number> = {};
  const dependents: Record<string, string[]> = {};

  for (const node of nodes) {
    inDegree[node.id] = node.dependsOn?.length ?? 0;
    dependents[node.id] = dependents[node.id] ?? [];
    for (const dep of node.dependsOn ?? []) {
      dependents[dep] = dependents[dep] ?? [];
      dependents[dep].push(node.id);
    }
  }

  const nodeMap = Object.fromEntries(nodes.map(n => [n.id, n]));
  const waves: any[][] = [];
  let ready = nodes.filter(n => inDegree[n.id] === 0);

  while (ready.length > 0) {
    waves.push(ready);
    const next: any[] = [];
    for (const node of ready) {
      for (const dep of dependents[node.id] ?? []) {
        inDegree[dep]--;
        if (inDegree[dep] === 0) next.push(nodeMap[dep]);
      }
    }
    ready = next;
  }

  return waves;
}

// Replace {{nX.output.field}} with actual values from completed map
function interpolateParams(
  params: Record<string, any>,
  completed: Record<string, any>
): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string') {
      result[key] = value.replace(
        /\{\{(\w+)\.output\.(\w+)\}\}/g,
        (_, nodeId, field) => {
          return completed[nodeId]?.[field] ?? '';
        }
      );
      continue;
    }

    result[key] = value;
  }
  return result;
}

// Call a Composio MCP tool by name using the same pattern as app/api/chat/route.ts
async function callComposioTool(
  toolName: string,
  params: Record<string, any>,
  userId: string
): Promise<any> {
  const composioApiKey = process.env.COMPOSIO_API_KEY;
  if (!composioApiKey) throw new Error('COMPOSIO_API_KEY not set');

  const composio = new Composio({ apiKey: composioApiKey });
  const session = await composio.create(userId);
  const client = await createMCPClient({
    transport: {
      type: session.mcp.type,
      url: session.mcp.url,
      headers: session.mcp.headers,
    },
  });

  const tools = await client.tools();
  const tool = tools[toolName];
  if (!tool) throw new Error(`Tool ${toolName} not found or not connected`);

  // Composio MCP tools are called via the tool's execute function
  const result = await tool.execute(params, {} as any);

  // Composio hides errors inside content[0].text as JSON with successful: false
  // isError on the outer object is always false even on failures — do not trust it
  const contentText = (result as any)?.content?.[0]?.text;
  if (contentText) {
    let parsed: any;
    try {
      parsed = JSON.parse(contentText);
    } catch {
      // content is not JSON, return raw result
      return result;
    }

    if (parsed.successful === false) {
      // Throw so the executor catches it, marks node failed, and Trigger.dev retries
      throw new Error(
        `Tool ${toolName} failed: ${parsed.error ?? 'successful: false'} (log_id: ${parsed.log_id ?? 'unknown'})`
      );
    }

    // Return the inner data payload, not the outer MCP wrapper
    return parsed.data ?? parsed;
  }

  return result;
}

export const executeWorkflow = task({
  id: 'execute-workflow',
  retry: { maxAttempts: 3, factor: 2, minTimeoutInMs: 1000 },
  run: async (payload: {
    workflowId: string;
    dagJson: string;
    userId: string;
  }) => {
    const { workflowId, dagJson, userId } = payload;
    const dag = JSON.parse(dagJson);
    const waves = topologicalSort(dag.nodes);
    const completed: Record<string, any> = {};

    await convex.mutation(api.workflows.updateWorkflowStatus, {
      workflowId: workflowId as any,
      status: 'running',
    });

    await convex.mutation(api.workflows.updateNodeStatus, {
      workflowId: workflowId as any,
      nodeId: dag.nodes[0].id,
      status: 'running',
    });

    // Mark workflow as running
    // (no direct workflow status mutation exposed — add one or handle via updateNodeStatus waves)

    for (const wave of waves) {
      await Promise.all(
        wave.map(async (node: any) => {
          try {
            await convex.mutation(api.workflows.updateNodeStatus, {
              workflowId: workflowId as any,
              nodeId: node.id,
              status: 'running',
            });

            const interpolatedParams = interpolateParams(
              node.params ?? {},
              completed
            );

            const result = await callComposioTool(
              node.tool,
              interpolatedParams,
              userId
            );

            completed[node.id] = result;

            await convex.mutation(api.workflows.updateNodeStatus, {
              workflowId: workflowId as any,
              nodeId: node.id,
              status: 'completed',
              output: JSON.stringify(result),
            });
          } catch (err: any) {
            await convex.mutation(api.workflows.updateNodeStatus, {
              workflowId: workflowId as any,
              nodeId: node.id,
              status: 'failed',
              error: err?.message ?? 'Unknown error',
            });
            await convex.mutation(api.workflows.updateWorkflowStatus, {
              workflowId: workflowId as any,
              status: 'failed',
            });
            throw err; // let Trigger.dev retry the whole task
          }
        })
      );
    }

    await convex.mutation(api.workflows.updateWorkflowStatus, {
      workflowId: workflowId as any,
      status: 'completed',
    });

    return { success: true, completed };
  },
});