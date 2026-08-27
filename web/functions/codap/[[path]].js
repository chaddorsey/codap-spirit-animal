/**
 * Same-origin CODAP, in production.
 *
 * This is the deployed twin of the vite dev proxy in `vite.config.js`, and it
 * exists for exactly one reason: **Dot only works if CODAP is same-origin.**
 * The wrapper reaches into `iframe.contentDocument` to dispatch synthetic
 * pointer events; served cross-origin from codap3.concord.org that is a
 * SecurityError and every "Show me." demonstration is dead. Static hosting with
 * no proxy (GitHub Pages) therefore cannot host this app at all.
 *
 * Why a path prefix works: CODAP references its own assets RELATIVE to the page
 * it was served from, so a document loaded at `/codap/` asks for
 * `/codap/version/<v>/assets/index.<hash>.js`, which lands back here. Verified
 * against the running app — the CPU profile shows exactly those URLs. If CODAP
 * ever switches to root-absolute asset URLs this breaks, and the symptom will
 * be a blank iframe with 404s for `/version/...`.
 */

const UPSTREAM = 'https://codap3.concord.org';

export async function onRequest({ request, params }) {
  const url = new URL(request.url);
  const path = Array.isArray(params.path) ? params.path.join('/') : (params.path ?? '');
  const target = `${UPSTREAM}/${path}${url.search}`;

  // `redirect: 'manual'` so an upstream redirect is handed to the browser as-is
  // rather than being followed here, which would silently take the iframe
  // cross-origin again — the one failure this whole file exists to prevent.
  const upstream = await fetch(target, {
    method: request.method,
    headers: stripHopByHop(request.headers),
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
    redirect: 'manual',
  });

  const headers = new Headers(upstream.headers);
  // THE BODY IS ALREADY DECODED. The Workers runtime transparently decompresses
  // what it fetches, so forwarding upstream's `content-encoding` tells the
  // browser to gunzip plain bytes and it renders binary noise — caught locally
  // under `wrangler pages dev`, where the proxied CODAP page came back as
  // mojibake. `content-length` goes with it: it describes the compressed
  // length, which is no longer the length of anything we are sending.
  headers.delete('content-encoding');
  headers.delete('content-length');
  // These would either re-assert the upstream origin's rules on our origin, or
  // stop the page being framed at all. Neither is wanted once the bytes are ours.
  headers.delete('content-security-policy');
  headers.delete('content-security-policy-report-only');
  headers.delete('x-frame-options');
  headers.delete('cross-origin-opener-policy');
  headers.delete('cross-origin-embedder-policy');

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}

function stripHopByHop(headers) {
  const out = new Headers(headers);
  for (const h of ['host', 'connection', 'keep-alive', 'transfer-encoding',
                   'upgrade', 'proxy-authorization', 'proxy-connection']) {
    out.delete(h);
  }
  return out;
}
