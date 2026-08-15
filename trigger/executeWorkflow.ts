import { task } from '@trigger.dev/sdk/v3';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '@/convex/_generated/api';
import { experimental_createMCPClient as createMCPClient } from '@ai-sdk/mcp';
import { Composio } from '@composio/core';
import { generateText, stepCountIs } from 'ai';
import { getLocalModel } from '@/lib/ai/provider';
import type { LocalAiSettings } from '@/lib/ai/local-settings';

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
const NODE_START_STAGGER_MS = 800;
const NODE_RETRY_ATTEMPTS = 5;
const NODE_RETRY_BASE_DELAY_MS = 4000;
const CREDIT_RATE_LIMIT_BASE_DELAY_MS = 30000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object') {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === 'string' && maybeMessage.trim().length > 0) {
      return maybeMessage;
    }
  }
  return String(error ?? 'Unknown error');
}

function getErrorStatusCode(error: unknown): number | null {
  if (!error || typeof error !== 'object') {
    return null;
  }

  const typed = error as {
    status?: unknown;
    statusCode?: unknown;
    cause?: { status?: unknown; statusCode?: unknown };
  };

  const values = [typed.status, typed.statusCode, typed.cause?.status, typed.cause?.statusCode];
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

function flattenErrorText(error: unknown): string {
  const parts: string[] = [];
  const visited = new Set<object>();

  const walk = (value: unknown) => {
    if (value == null) {
      return;
    }

    if (typeof value === 'string') {
      if (value.trim()) {
        parts.push(value);
      }
      return;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      parts.push(String(value));
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        walk(item);
      }
      return;
    }

    if (typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      if (visited.has(obj)) {
        return;
      }
      visited.add(obj);

      walk(obj.message);
      walk(obj.error);
      walk(obj.details);
      walk(obj.cause);
      walk(obj.body);

      if (!('message' in obj)) {
        try {
          const serialized = JSON.stringify(obj);
          if (serialized && serialized !== '{}') {
            parts.push(serialized);
          }
        } catch {
          // Ignore serialization failures.
        }
      }
    }
  };

  walk(error);
  return parts.join(' | ').toLowerCase();
}

function isRetryableNodeError(error: unknown) {
  const message = flattenErrorText(error);
  const statusCode = getErrorStatusCode(error);
  return (
    statusCode === 408 ||
    statusCode === 409 ||
    statusCode === 423 ||
    statusCode === 425 ||
    statusCode === 429 ||
    statusCode === 500 ||
    statusCode === 502 ||
    statusCode === 503 ||
    statusCode === 504 ||
    message.includes('rate limit') ||
    message.includes('temporarily have rate limits') ||
    message.includes('free credits temporarily have rate limits') ||
    message.includes('429') ||
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('econnreset') ||
    message.includes('connection reset') ||
    message.includes('service unavailable') ||
    message.includes('try again later') ||
    message.includes('temporarily unavailable')
  );
}

function isCreditRateLimitError(error: unknown) {
  const message = flattenErrorText(error);
  return (
    message.includes('free credits temporarily have rate limits') ||
    (message.includes('rate limit') && message.includes('purchase credits'))
  );
}

function getRetryDelayMs(error: unknown, attempt: number) {
  if (isCreditRateLimitError(error)) {
    return CREDIT_RATE_LIMIT_BASE_DELAY_MS * attempt;
  }

  return NODE_RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
}

async function runNodeWithRetry(
  requestText: string,
  params: Record<string, any>,
  previousOutputs: Record<string, any>,
  tools: Record<string, any>,
  localAiSettings?: Partial<LocalAiSettings>
) {
  let lastError: any;

  for (let attempt = 1; attempt <= NODE_RETRY_ATTEMPTS; attempt++) {
    try {
      return await runNodeRequest(requestText, params, previousOutputs, tools, localAiSettings);
    } catch (error) {
      lastError = error;
      const retryable = isRetryableNodeError(error);
      if (attempt < NODE_RETRY_ATTEMPTS && retryable) {
        await sleep(getRetryDelayMs(error, attempt));
        continue;
      }

      if (retryable) {
        throw new Error(
          `Node failed after ${NODE_RETRY_ATTEMPTS} attempts: ${getErrorMessage(error)}`
        );
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
  const session = await composio.create(userId, { mcp: true });
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
  tools: Record<string, any>,
  localAiSettings?: Partial<LocalAiSettings>
): Promise<any> {
  const context = Object.keys(previousOutputs).length > 0
    ? `\n\nPrevious step outputs (JSON):\n${JSON.stringify(previousOutputs)}`
    : '';

  const nodePrompt = `${requestText}${context}`;
  const result = await generateText({
    model: getLocalModel(localAiSettings),
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
    localAiSettings?: Partial<LocalAiSettings>;
  }) => {
    const { workflowId, dagJson, userId, localAiSettings } = payload;
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
              localAiSettings,
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