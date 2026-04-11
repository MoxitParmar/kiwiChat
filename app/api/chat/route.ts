import { auth } from '@clerk/nextjs/server';
import { experimental_createMCPClient as createMCPClient } from '@ai-sdk/mcp';
import { Composio } from '@composio/core';
import { ConvexHttpClient } from 'convex/browser';
import { streamText, UIMessage, convertToModelMessages , stepCountIs,} from 'ai';
import { api } from '@/convex/_generated/api';
import { runPlanner } from '@/lib/ai/planner';

const composioApiKey = process.env.COMPOSIO_API_KEY;
const CHAT_MODEL = 'xai/grok-4.1-fast-non-reasoning';
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
};

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
  const { messages, workflowMode, conversationId } = await req.json() as ChatRequestBody;
  const externalUserId = userId ?? 'anonymous';

  if (workflowMode) {
    const lastMessage = messages[messages.length - 1];
    const userText = typeof (lastMessage as any)?.content === 'string'
      ? (lastMessage as any).content
      : (lastMessage.parts?.find((p: any) => p.type === 'text') as any)?.text ?? '';


    const dagJson = await runPlanner(userText);

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
    model: CHAT_MODEL,
    messages: await convertToModelMessages(messages),
    system: CONNECT_MARKER_INSTRUCTION,
    stopWhen: stepCountIs(10),
    tools,
  });

  return result.toUIMessageStreamResponse();
}