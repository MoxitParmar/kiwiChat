import { auth } from '@clerk/nextjs/server';
import { experimental_createMCPClient as createMCPClient } from '@ai-sdk/mcp';
import { Composio } from '@composio/core';
import { ConvexHttpClient } from 'convex/browser';
import { streamText, UIMessage, convertToModelMessages , stepCountIs,} from 'ai';
import { api } from '@/convex/_generated/api';

const composioApiKey = process.env.COMPOSIO_API_KEY;

async function getComposioTools(externalUserId: string) {
  if (!composioApiKey) {
    return undefined;
  }

  try {
    const composio = new Composio({ apiKey: composioApiKey });
    const session = await composio.create(externalUserId);
    const client = await createMCPClient({
      transport: {
        type: session.mcp.type,
        url: session.mcp.url,
        headers: session.mcp.headers,
      },
    });

    return client.tools();
  } catch (error) {
    console.error('Failed to load Composio tools:', error);
    return undefined;
  }
}

export async function POST(req: Request) {
  const { userId } = await auth();
  const { messages, workflowMode, conversationId }: {
    messages: UIMessage[];
    workflowMode?: boolean;
    conversationId?: string;
  } = await req.json();
  const externalUserId = userId ?? 'anonymous';

  if (workflowMode) {
    const lastMessage = messages[messages.length - 1];
    const userText = typeof (lastMessage as any)?.content === 'string'
      ? (lastMessage as any).content
      : (lastMessage.parts?.find((p: any) => p.type === 'text') as any)?.text ?? '';

    // Get connected tools from Composio — reuse same pattern
    const composio = composioApiKey ? new Composio({ apiKey: composioApiKey }) : null;
    const toolSchemas: Array<{ name: string; description: string; parameters: Record<string, any> }> = [];
    if (composio) {
      try {
        const session = await composio.create(externalUserId);
        const client = await createMCPClient({
          transport: {
            type: session.mcp.type,
            url: session.mcp.url,
            headers: session.mcp.headers,
          },
        });
        const toolsObj = await client.tools();
        toolSchemas.push(
          ...Object.entries(toolsObj ?? {}).map(([name, tool]: [string, any]) => ({
            name,
            description: tool.description ?? '',
            parameters: tool.inputSchema ?? tool.parameters ?? {},
          }))
        );
      } catch {
        // ignore, planner will work with empty list
      }
    }

    const { runPlanner } = await import('@/lib/ai/planner');
    const dagJson = await runPlanner(userText, toolSchemas);

    const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
    const workflowId = await convex.mutation(api.workflows.createWorkflow, {
      conversationId: conversationId as any,
      userId: externalUserId,
      dagJson,
    });

    return new Response(
      JSON.stringify({ type: 'workflow-plan', dag: JSON.parse(dagJson), workflowId }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  }

  const tools = await getComposioTools(externalUserId);

  const result = streamText({
    model: "xai/grok-4.1-fast-non-reasoning",
    messages: await convertToModelMessages(messages),
    stopWhen: stepCountIs(10),
    tools,
  });

  return result.toUIMessageStreamResponse();
}