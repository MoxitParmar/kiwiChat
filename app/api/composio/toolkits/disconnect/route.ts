import { auth } from '@clerk/nextjs/server';

const COMPOSIO_BASE_URL = 'https://backend.composio.dev';

type DisconnectBody = {
  connectedAccountId?: string;
};

function getApiKey() {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) {
    throw new Error('COMPOSIO_API_KEY is not configured');
  }
  return apiKey;
}

async function readResponseBody(response: Response) {
  const text = await response.text();
  if (!text) {
    return '';
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const { connectedAccountId } = (await req.json()) as DisconnectBody;

    if (!connectedAccountId || typeof connectedAccountId !== 'string') {
      return new Response('Missing connectedAccountId', { status: 400 });
    }

    const response = await fetch(
      `${COMPOSIO_BASE_URL}/api/v3/connected_accounts/${connectedAccountId}`,
      {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': getApiKey(),
        },
        cache: 'no-store',
      }
    );

    if (!response.ok) {
      const details = await readResponseBody(response);
      return Response.json(
        {
          error: 'Failed to disconnect toolkit',
          details,
        },
        { status: response.status }
      );
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error('Failed to disconnect toolkit:', error);
    return Response.json(
      {
        error: 'Failed to disconnect toolkit',
      },
      { status: 500 }
    );
  }
}
