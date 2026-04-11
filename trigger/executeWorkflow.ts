import { task } from '@trigger.dev/sdk/v3';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '@/convex/_generated/api';
import { experimental_createMCPClient as createMCPClient } from '@ai-sdk/mcp';
import { Composio } from '@composio/core';
import { generateText, stepCountIs } from 'ai';

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
const NODE_START_STAGGER_MS = 800;
const NODE_RETRY_ATTEMPTS = 3;
const NODE_RETRY_DELAY_MS = 4000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error ?? 'Unknown error');
}

function isRetryableNodeError(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes('rate limit') ||
    message.includes('temporarily have rate limits') ||
    message.includes('429') ||
    message.includes('timeout') ||
    message.includes('econnreset') ||
    message.includes('temporarily unavailable')
  );
}

async function runNodeWithRetry(
  requestText: string,
  params: Record<string, any>,
  previousOutputs: Record<string, any>,
  tools: Record<string, any>
) {
  let lastError: any;

  for (let attempt = 1; attempt <= NODE_RETRY_ATTEMPTS; attempt++) {
    try {
      return await runNodeRequest(requestText, params, previousOutputs, tools);
    } catch (error) {
      lastError = error;
      const retryable = isRetryableNodeError(error);
      if (attempt < NODE_RETRY_ATTEMPTS && retryable) {
        await sleep(NODE_RETRY_DELAY_MS * attempt);
        continue;
      }
      throw error;
    }
  }

  throw new Error(`Node failed after ${NODE_RETRY_ATTEMPTS} attempts: ${getErrorMessage(lastError)}`);
}

async function isWorkflowStopped(workflowId: string) {
  const workflow = await convex.query(api.workflows.getWorkflow, {
    workflowId: workflowId as any,
  });

  return workflow?.status === 'failed';
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

async function getComposioNodeTools(userId: string) {
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

  return client.tools();
}

// Execute one workflow node as a normal Composio-enabled chat request.
async function runNodeRequest(
  requestText: string,
  params: Record<string, any>,
  previousOutputs: Record<string, any>,
  tools: Record<string, any>
): Promise<any> {
  const context = Object.keys(previousOutputs).length > 0
    ? `\n\nPrevious step outputs (JSON):\n${JSON.stringify(previousOutputs)}`
    : '';

  const nodePrompt = `${requestText}${context}`;
  const result = await generateText({
    model: "xai/grok-4.1-fast-non-reasoning" as any,
    system:
      'You are executing one automation step. Use tools whenever the request needs external data or side effects (e.g., GitHub fetch, Slack message). Always finish with a concise final text that states what was done and key result details.',
    prompt: nodePrompt,
    stopWhen: stepCountIs(10),
    tools,
  });

  const finalText = result.text?.trim();
  const toolResults = Array.isArray((result as any).toolResults) ? (result as any).toolResults : [];
  const fallbackText = toolResults.length > 0
    ? JSON.stringify(toolResults)
    : 'Step executed, but no textual response was returned.';

  return {
    text: finalText || fallbackText,
    request: requestText,
    params,
    toolResults,
  };
}

export const executeWorkflow = task({
  id: 'execute-workflow',
  retry: { maxAttempts: 1 },
  run: async (payload: {
    workflowId: string;
    dagJson: string;
    userId: string;
  }) => {
    const { workflowId, dagJson, userId } = payload;
    const dag = JSON.parse(dagJson);
    const nodes = Array.isArray(dag?.nodes) ? dag.nodes : [];
    if (nodes.length === 0) {
      throw new Error('Workflow DAG has no nodes to execute');
    }
    const completed: Record<string, any> = {};
    const tools = await getComposioNodeTools(userId);

    await convex.mutation(api.workflows.updateWorkflowStatus, {
      workflowId: workflowId as any,
      status: 'running',
    });

    const remaining = new Set(nodes.map((node: any) => node.id));

    while (remaining.size > 0) {
      if (await isWorkflowStopped(workflowId)) {
        return { success: false, stopped: true, completed };
      }

      const readyNodes = nodes.filter((node: any) => {
        if (!remaining.has(node.id)) {
          return false;
        }

        const deps = Array.isArray(node.dependsOn) ? node.dependsOn : [];
        return deps.every((depId: string) => Object.hasOwn(completed, depId));
      });

      if (readyNodes.length === 0) {
        throw new Error('Workflow DAG has unresolved dependencies or a cycle');
      }

      const waveResults = await Promise.all(
        readyNodes.map(async (node: any, index: number) => {
          try {
            if (index > 0) {
              await sleep(index * NODE_START_STAGGER_MS);
            }

            await convex.mutation(api.workflows.updateNodeStatus, {
              workflowId: workflowId as any,
              nodeId: node.id,
              status: 'running',
            });

            const interpolatedParams = interpolateParams(
              node.params ?? {},
              completed
            );

            const requestText =
              (typeof interpolatedParams.request === 'string' && interpolatedParams.request.trim())
                ? interpolatedParams.request
                : node.tool;

            const result = await runNodeWithRetry(
              requestText,
              interpolatedParams,
              completed,
              tools,
            );

            completed[node.id] = result;

            await convex.mutation(api.workflows.updateNodeStatus, {
              workflowId: workflowId as any,
              nodeId: node.id,
              status: 'completed',
              output: JSON.stringify(result),
            });

            return { ok: true as const };
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
            return { ok: false as const, err };
          }
        })
      );

      const failedWaveResult = waveResults.find((result) => !result.ok);
      if (failedWaveResult && !failedWaveResult.ok) {
        throw failedWaveResult.err;
      }

      for (const node of readyNodes) {
        remaining.delete(node.id);
      }
    }

    await convex.mutation(api.workflows.updateWorkflowStatus, {
      workflowId: workflowId as any,
      status: 'completed',
    });

    return { success: true, completed };
  },
});