import { auth } from '@clerk/nextjs/server';

const COMPOSIO_BASE_URL = 'https://backend.composio.dev';

type ToolkitItem = {
  slug: string;
  name: string;
  description: string;
  logo: string;
  categories: Array<{ id: string; name: string }>;
  isConnected: boolean;
  connectionStatus: string | null;
  connectedAccountId: string | null;
};

function getApiKey() {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) {
    throw new Error('COMPOSIO_API_KEY is not configured');
  }
  return apiKey;
}

async function composioFetch<T>(path: string) {
  const response = await fetch(`${COMPOSIO_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': getApiKey(),
    },
    method: 'GET',
    cache: 'no-store',
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Composio request failed (${response.status}): ${message}`);
  }

  return response.json() as Promise<T>;
}

type ComposioToolkitListResponse = {
  items: Array<{
    slug: string;
    name: string;
    composio_managed_auth_schemes?: string[];
    meta?: {
      description?: string;
      logo?: string;
      categories?: Array<{ id: string; name: string }>;
    };
  }>;
  next_cursor?: string | null;
  total_items: number;
  total_pages: number;
  current_page: number;
};

type ComposioConnectedAccountsResponse = {
  items: Array<{
    id: string;
    toolkit?: { slug?: string };
    status?: string;
    user_id?: string;
  }>;
  next_cursor?: string | null;
};

function hasDirectRedirectAuth(toolkit: ComposioToolkitListResponse['items'][number]) {
  const schemes = toolkit.composio_managed_auth_schemes ?? [];
  return schemes.some((scheme) => scheme === 'OAUTH1' || scheme === 'OAUTH2');
}

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search') ?? '';
    const category = searchParams.get('category') ?? '';
    const sortBy = searchParams.get('sortBy') ?? 'alphabetically';
    const limit = Number(searchParams.get('limit') ?? '1000');
    const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 1000) : 1000;

    const baseToolkitQuery = new URLSearchParams();
    baseToolkitQuery.set('limit', String(safeLimit));
    if (search.trim()) {
      baseToolkitQuery.set('search', search.trim());
    }
    if (category.trim()) {
      baseToolkitQuery.set('category', category.trim());
    }
    if (sortBy === 'usage' || sortBy === 'alphabetically') {
      baseToolkitQuery.set('sort_by', sortBy);
    }

    const fetchAllToolkits = async () => {
      const allItems: ComposioToolkitListResponse['items'] = [];
      let cursor: string | null = null;
      let totalItems = 0;
      let totalPages = 1;
      let currentPage = 1;
      let pageGuard = 0;

      do {
        const query = new URLSearchParams(baseToolkitQuery);
        if (cursor) {
          query.set('cursor', cursor);
        }

        const page = await composioFetch<ComposioToolkitListResponse>(`/api/v3/toolkits?${query.toString()}`);
        allItems.push(...(page.items ?? []));

        totalItems = page.total_items;
        totalPages = page.total_pages;
        currentPage = page.current_page;
        cursor = page.next_cursor ?? null;
        pageGuard += 1;
      } while (cursor && pageGuard < 100);

      return {
        currentPage,
        items: allItems,
        nextCursor: cursor,
        totalItems,
        totalPages,
      };
    };

    const fetchAllConnectedAccounts = async () => {
      const allItems: ComposioConnectedAccountsResponse['items'] = [];
      let cursor: string | null = null;
      let pageGuard = 0;

      do {
        const query = new URLSearchParams();
        query.append('user_ids', userId);
        query.set('limit', '1000');
        if (cursor) {
          query.set('cursor', cursor);
        }

        const page = await composioFetch<ComposioConnectedAccountsResponse>(`/api/v3/connected_accounts?${query.toString()}`);
        allItems.push(...(page.items ?? []));
        cursor = page.next_cursor ?? null;
        pageGuard += 1;
      } while (cursor && pageGuard < 100);

      return allItems;
    };

    const [toolkitsResponse, connectedItems] = await Promise.all([
      fetchAllToolkits(),
      fetchAllConnectedAccounts(),
    ]);

    const connectedBySlug = new Map<string, { id: string; status: string }>();
    for (const account of connectedItems ?? []) {
      const slug = account.toolkit?.slug;
      if (!slug || account.user_id !== userId) {
        continue;
      }

      if (!account.id || !account.status) {
        continue;
      }

      if (account.status === 'ACTIVE') {
        connectedBySlug.set(slug, { id: account.id, status: account.status });
      } else if (!connectedBySlug.has(slug)) {
        connectedBySlug.set(slug, { id: account.id, status: account.status });
      }
    }

    const uniqueToolkits = new Map<string, ToolkitItem>();
    for (const toolkit of toolkitsResponse.items ?? []) {
      if (!toolkit?.slug || uniqueToolkits.has(toolkit.slug)) {
        continue;
      }

      if (!hasDirectRedirectAuth(toolkit)) {
        continue;
      }

      const connection = connectedBySlug.get(toolkit.slug) ?? null;
      const status = connection?.status ?? null;
      uniqueToolkits.set(toolkit.slug, {
        slug: toolkit.slug,
        name: toolkit.name,
        description: toolkit.meta?.description ?? '',
        logo: toolkit.meta?.logo ?? '',
        categories: toolkit.meta?.categories ?? [],
        isConnected: status === 'ACTIVE',
        connectionStatus: status,
        connectedAccountId: connection?.id ?? null,
      });
    }

    const items = Array.from(uniqueToolkits.values());

    return Response.json({
      currentPage: toolkitsResponse.currentPage,
      items,
      nextCursor: toolkitsResponse.nextCursor ?? null,
      totalItems: items.length,
      totalPages: toolkitsResponse.totalPages,
    });
  } catch (error) {
    console.error('Failed to fetch Composio toolkits:', error);
    return new Response('Failed to fetch toolkits', { status: 500 });
  }
}
