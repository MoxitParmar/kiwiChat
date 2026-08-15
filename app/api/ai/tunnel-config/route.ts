export async function GET() {
  return new Response(
    JSON.stringify({
      error: 'Automatic tunnel creation is disabled. Create a public tunnel from your machine and paste the public URL into the Local AI Settings dialog.',
      hint: 'Example: npx localtunnel --port 11434',
    }),
    { status: 410, headers: { 'Content-Type': 'application/json' } }
  );
}
