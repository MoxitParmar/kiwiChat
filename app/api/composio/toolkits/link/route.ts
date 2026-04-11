import { auth } from '@clerk/nextjs/server';

const COMPOSIO_BASE_URL = 'https://backend.composio.dev';

function getApiKey() {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) {
    throw new Error('COMPOSIO_API_KEY is not configured');
  }
  return apiKey;
}

type LinkBody = {
  toolkitSlug?: string;
};

type FallbackLinkResult = {
  connectedAccountId: string;
  linkToken: string;
  redirectUrl: string;
  toolkitSlug: string;
};

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

async function createDirectLinkFallback(
  toolkitSlug: string,
  userId: string,
  callbackUrl: string
): Promise<FallbackLinkResult> {
  const authConfigResponse = await fetch(
    `${COMPOSIO_BASE_URL}/api/v3/auth_configs?${new URLSearchParams({
      is_composio_managed: 'true',
      limit: '100',
      toolkit_slug: toolkitSlug,
    }).toString()}`,
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': getApiKey(),
      },
      cache: 'no-store',
    }
  );

  if (!authConfigResponse.ok) {
    const details = await readResponseBody(authConfigResponse);
    throw new Error(
      typeof details === 'string' && details.trim().length > 0
        ? details
        : 'Unable to resolve auth config for toolkit.'
    );
  }

  const authConfigPayload = (await authConfigResponse.json()) as {
    items?: Array<{
      id: string;
      status: 'ENABLED' | 'DISABLED';
    }>;
  };

  const authConfig = (authConfigPayload.items ?? []).find((item) => item.status === 'ENABLED');
  if (!authConfig) {
    throw new Error('No enabled auth config found for this toolkit.');
  }

  const linkResponse = await fetch(`${COMPOSIO_BASE_URL}/api/v3/connected_accounts/link`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': getApiKey(),
    },
    body: JSON.stringify({
      auth_config_id: authConfig.id,
      callback_url: callbackUrl,
      user_id: userId,
    }),
    cache: 'no-store',
  });

  if (!linkResponse.ok) {
    const details = await readResponseBody(linkResponse);
    throw new Error(
      typeof details === 'string' && details.trim().length > 0
        ? details
        : 'Failed to create direct connection link.'
    );
  }

  const linkPayload = (await linkResponse.json()) as {
    connected_account_id: string;
    link_token: string;
    redirect_url: string;
  };

  return {
    connectedAccountId: linkPayload.connected_account_id,
    linkToken: linkPayload.link_token,
    redirectUrl: linkPayload.redirect_url,
    toolkitSlug,
  };
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const { toolkitSlug } = (await req.json()) as LinkBody;

    if (!toolkitSlug || typeof toolkitSlug !== 'string') {
      return new Response('Missing toolkitSlug', { status: 400 });
    }

    const callbackUrl = new URL(req.url).origin;

    const existingResponse = await fetch(`${COMPOSIO_BASE_URL}/api/v3/connected_accounts?${new URLSearchParams({
      limit: '100',
      toolkit_slugs: toolkitSlug,
      user_ids: userId,
    }).toString()}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': getApiKey(),
      },
      cache: 'no-store',
    });

    if (existingResponse.ok) {
      const existingPayload = await existingResponse.json() as {
        items?: Array<{ id: string; status?: string }>;
      };

      const existing = (existingPayload.items ?? []).find((item) =>
        item.status === 'ACTIVE' ||
        item.status === 'INITIATED' ||
        item.status === 'INITIALIZING'
      );

      if (existing) {
        if (existing.status === 'INITIATED' || existing.status === 'INITIALIZING') {
          const refreshQuery = new URLSearchParams({ redirect_url: callbackUrl });
          const refreshResponse = await fetch(
            `${COMPOSIO_BASE_URL}/api/v3/connected_accounts/${existing.id}/refresh?${refreshQuery.toString()}`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-api-key': getApiKey(),
              },
              body: JSON.stringify({}),
              cache: 'no-store',
            }
          );

          if (refreshResponse.ok) {
            const refreshPayload = (await refreshResponse.json()) as {
              id: string;
              redirect_url: string | null;
              status: string;
            };

            return Response.json({
              connectedAccountId: refreshPayload.id,
              message: refreshPayload.redirect_url
                ? 'Resuming toolkit connection.'
                : 'Toolkit connection is already in progress.',
              redirectUrl: refreshPayload.redirect_url,
              status: refreshPayload.status,
              toolkitSlug,
            });
          }
        }

        return Response.json({
          connectedAccountId: existing.id,
          message:
            existing.status === 'ACTIVE'
              ? 'Toolkit is already connected.'
              : 'Toolkit connection is already in progress.',
          redirectUrl: null,
          status: existing.status,
          toolkitSlug,
        });
      }
    }

    const sessionResponse = await fetch(`${COMPOSIO_BASE_URL}/api/v3/tool_router/session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': getApiKey(),
      },
      body: JSON.stringify({
        user_id: userId,
        manage_connections: {
          enable: true,
          callback_url: callbackUrl,
        },
        toolkits: {
          enable: [toolkitSlug],
        },
      }),
      cache: 'no-store',
    });

    if (!sessionResponse.ok) {
      try {
        const fallback = await createDirectLinkFallback(toolkitSlug, userId, callbackUrl);
        return Response.json({
          ...fallback,
          message: 'Fallback connection flow started.',
          sessionId: null,
        });
      } catch (fallbackError) {
        const details = await readResponseBody(sessionResponse);
        const fallbackMessage =
          fallbackError instanceof Error ? fallbackError.message : 'Fallback connection flow failed.';

        return Response.json(
          {
            error: 'Failed to create tool router session',
            details,
            fallbackError: fallbackMessage,
          },
          { status: sessionResponse.status }
        );
      }
    }

    const sessionPayload = await sessionResponse.json() as { session_id: string };

    const linkResponse = await fetch(`${COMPOSIO_BASE_URL}/api/v3/tool_router/session/${sessionPayload.session_id}/link`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': getApiKey(),
      },
      body: JSON.stringify({
        toolkit: toolkitSlug,
        callback_url: callbackUrl,
      }),
      cache: 'no-store',
    });

    if (!linkResponse.ok) {
      const details = await readResponseBody(linkResponse);
      return Response.json(
        {
          error: 'Failed to create toolkit link',
          details,
        },
        { status: linkResponse.status }
      );
    }

    const linkPayload = await linkResponse.json() as {
      connected_account_id: string;
      link_token: string;
      redirect_url: string;
    };

    return Response.json({
      connectedAccountId: linkPayload.connected_account_id,
      linkToken: linkPayload.link_token,
      redirectUrl: linkPayload.redirect_url,
      sessionId: sessionPayload.session_id,
      toolkitSlug,
    });
  } catch (error) {
    console.error('Failed to create toolkit auth link:', error);
    return Response.json(
      {
        error: 'Failed to initiate toolkit connection',
      },
      { status: 500 }
    );
  }
}
