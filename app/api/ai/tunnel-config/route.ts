import localtunnel from 'localtunnel';

let cachedTunnel: Awaited<ReturnType<typeof localtunnel>> | null = null;
let tunnelPort: number | null = null;

export async function GET(req: Request) {
  // This endpoint only works on local development
  const isDeployed = typeof process.env.VERCEL !== 'undefined';
  
  if (isDeployed) {
    return new Response(
      JSON.stringify({
        error: 'Cannot create tunnel on deployed server. Set LOCAL_AI_PUBLIC_BASE_URL environment variable.',
        hint: 'Run this on your machine: npx localtunnel --port 11434',
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { searchParams } = new URL(req.url);
  const port = searchParams.get('port');
  const portNum = Number(port) || 11434;

  try {
    // Reuse tunnel if port hasn't changed
    if (cachedTunnel && tunnelPort === portNum) {
      return new Response(
        JSON.stringify({
          url: cachedTunnel.url,
          port: portNum,
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Create new tunnel
    const tunnel = await localtunnel({
      port: portNum,
      host: process.env.LOCALTUNNEL_HOST || 'https://loca.lt',
      subdomain: process.env.LOCALTUNNEL_SUBDOMAIN || undefined,
      local_host: '127.0.0.1',
    });

    cachedTunnel = tunnel;
    tunnelPort = portNum;

    // Handle tunnel close/error
    tunnel.on('close', () => {
      cachedTunnel = null;
      tunnelPort = null;
    });

    return new Response(
      JSON.stringify({
        url: tunnel.url,
        port: portNum,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({
        error: `Failed to create tunnel: ${msg}`,
        hint: 'Make sure your LLM server is running on the specified port.',
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
