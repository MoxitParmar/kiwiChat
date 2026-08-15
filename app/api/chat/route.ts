import { auth } from '@clerk/nextjs/server';
import { experimental_createMCPClient as createMCPClient } from '@ai-sdk/mcp';
import { Composio } from '@composio/core';
import { ConvexHttpClient } from 'convex/browser';
import { streamText, UIMessage, convertToModelMessages, stepCountIs } from 'ai';
import { api } from '@/convex/_generated/api';
import { runPlanner } from '@/lib/ai/planner';
import { getLocalModel, getResolvedLocalModelSettings, LOCAL_LLM_MODEL } from '@/lib/ai/provider';
import type { LocalAiSettings } from '@/lib/ai/local-settings';

const composioApiKey = process.env.COMPOSIO_API_KEY;
const CHAT_MODEL = LOCAL_LLM_MODEL;
const CONNECT_MARKER_INSTRUCTION = [
  'If the user explicitly asks to connect/integrate an app or toolkit, include exactly one line in your response in this format:',
  'CONNECT_TOOLKIT:<toolkit-slug>',
  'Use lowercase slug form (example: linear, github, google-sheets).',
  'Do not include this marker for non-connection requests.',
].join(' ');

type ChatRequestBody = {
  messages: UIMessage[];
  workflowMode?: boolean;
  conversationId?: string;
  localAiSettings?: Partial<LocalAiSettings>;
};

async function getComposioTools(externalUserId: string) {
  if (!composioApiKey) {
    return undefined;
  }

  try {
    const composio = new Composio({ apiKey: composioApiKey });
    const session = await composio.create(externalUserId, { mcp: true });
    const mcpSession = session as unknown as { mcp: { type: 'http' | 'sse'; url: string; headers: Record<string, string> } };
    const client = await createMCPClient({
      transport: {
        type: mcpSession.mcp.type,
        url: mcpSession.mcp.url,
        headers: mcpSession.mcp.headers,
      },
    });

    const tools = await client.tools();
    return { client, tools };
  } catch (error) {
    console.error('Failed to load Composio tools:', error);
    return undefined;
  }
}

export async function POST(req: Request) {
  const { userId } = await auth();
  const { messages, workflowMode, conversationId, localAiSettings } = await req.json() as ChatRequestBody;
  const externalUserId = userId ?? 'anonymous';

  if (workflowMode) {
    const lastMessage = messages[messages.length - 1];
    const userText = typeof (lastMessage as any)?.content === 'string'
      ? (lastMessage as any).content
      : (lastMessage.parts?.find((p: any) => p.type === 'text') as any)?.text ?? '';


    const dagJson = await runPlanner(userText, localAiSettings);

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

  const composioToolsResult = await getComposioTools(externalUserId);
  const tools = composioToolsResult?.tools;
  const mcpClient = composioToolsResult?.client;

  const chatSettings = await getResolvedLocalModelSettings({ ...localAiSettings, model: localAiSettings?.model ?? CHAT_MODEL });
  const model = await getLocalModel(chatSettings);
  const result = streamText({
    model,
    messages: await convertToModelMessages(messages),
    system: CONNECT_MARKER_INSTRUCTION,
    stopWhen: stepCountIs(10),
    tools,
    onFinish: async () => {
      if (mcpClient) {
        await mcpClient.close();
      }
    },
  });

  return result.toUIMessageStreamResponse();
}