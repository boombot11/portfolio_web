export async function POST(req) {
  if (req.method !== 'POST') {
    return new Response('Only POST requests allowed', { status: 405 });
  }

  let payload = null;
  try {
    payload = await req.json();
  } catch {
    payload = null;
  }

  // Email transport is intentionally disabled for now.
  // Re-enable with nodemailer integration when SMTP credentials are configured.
  return new Response(
    JSON.stringify({
      ok: true,
      message: 'Contact endpoint received payload in fallback mode.',
      payload,
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}
