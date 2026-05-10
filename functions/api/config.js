// GET /api/config. Surfaces public-safe env vars to the static client.
//
// Returns:
//   { bookingUrl: string, turnstileSitekey: string }
//
// Lets the booking link and Turnstile sitekey live in Cloudflare Pages
// env bindings (BOOKING_URL / CALENDLY_URL, TURNSTILE_SITEKEY) instead of
// being baked into the static HTML, so the team can rotate them without
// a redeploy. Only public values go here; server secrets stay server-side.

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== "GET") {
    return json({ ok: false, error: "method_not_allowed" }, 405);
  }

  const bookingUrl = (env.BOOKING_URL || env.CALENDLY_URL || "").trim();
  const turnstileSitekey = (env.TURNSTILE_SITEKEY || "").trim();

  return json({ ok: true, bookingUrl, turnstileSitekey });
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      // Short cache so dashboard edits propagate within a minute.
      "Cache-Control": "public, max-age=60, must-revalidate",
    },
  });
}
