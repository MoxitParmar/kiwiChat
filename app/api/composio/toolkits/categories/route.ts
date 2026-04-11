import { auth } from '@clerk/nextjs/server';

const COMPOSIO_BASE_URL = 'https://backend.composio.dev';

function getApiKey() {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) {
    throw new Error('COMPOSIO_API_KEY is not configured');
  }
  return apiKey;
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const response = await fetch(`${COMPOSIO_BASE_URL}/api/v3/toolkits/categories`, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': getApiKey(),
      },
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`Failed categories request (${response.status}): ${message}`);
    }

    const payload = await response.json() as {
      items?: Array<{ id: string; name: string }>;
    };

    const uniqueById = new Map<string, { id: string; name: string }>();
    for (const category of payload.items ?? []) {
      if (!category?.id) {
        continue;
      }

      if (!uniqueById.has(category.id)) {
        uniqueById.set(category.id, category);
      }
    }

    const items = Array.from(uniqueById.values()).sort((a, b) => a.name.localeCompare(b.name));

    return Response.json({ items });
  } catch (error) {
    console.error('Failed to fetch Composio toolkit categories:', error);
    return new Response('Failed to fetch categories', { status: 500 });
  }
}
