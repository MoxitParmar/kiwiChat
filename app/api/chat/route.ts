import { auth } from '@clerk/nextjs/server';
import { experimental_createMCPClient as createMCPClient } from '@ai-sdk/mcp';
import { Composio } from '@composio/core';
import { streamText, UIMessage, convertToModelMessages , stepCountIs,} from 'ai';

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
  const { messages }: { messages: UIMessage[] } = await req.json();
  const externalUserId = userId ?? 'anonymous';
  const tools = await getComposioTools(externalUserId);

  const result = streamText({
    model: "xai/grok-4.1-fast-non-reasoning",
    messages: await convertToModelMessages(messages),
    stopWhen: stepCountIs(10),
    tools,
  });

  return result.toUIMessageStreamResponse();
}