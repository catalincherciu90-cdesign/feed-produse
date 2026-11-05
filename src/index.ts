import { loadConfig, type Env } from './config';
import { KV_KEYS, runSync } from './sync';

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function tokenFrom(req: Request, url: URL): string {
  const auth = req.headers.get('Authorization') ?? '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  return url.searchParams.get('token') ?? '';
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const config = loadConfig(env);
    const token = tokenFrom(req, url);

    if (url.pathname === '/feed.xml' && req.method === 'GET') {
      if (config.clientFeedToken && !timingSafeEqual(token, config.clientFeedToken)) {
        return new Response('Acces neautorizat', { status: 401 });
      }
      const xml = await env.FEED_KV.get(KV_KEYS.feed);
      if (!xml) return new Response('Feed-ul nu a fost generat încă', { status: 503 });
      return new Response(xml, {
        headers: {
          'Content-Type': 'application/xml; charset=utf-8',
          'Cache-Control': 'public, max-age=300',
        },
      });
    }

    const isAdmin = !!config.adminToken && timingSafeEqual(token, config.adminToken);

    if (url.pathname === '/status' && req.method === 'GET') {
      if (!isAdmin) return new Response('Acces neautorizat', { status: 401 });
      return json(await env.FEED_KV.get(KV_KEYS.status, 'json'));
    }

    if (url.pathname === '/sync' && req.method === 'POST') {
      if (!isAdmin) return new Response('Acces neautorizat', { status: 401 });
      const status = await runSync(config, env.FEED_KV);
      return json(status, status.ok ? 200 : 500);
    }

    if (url.pathname === '/') {
      return new Response('feed-produse: OK\n', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
    return new Response('Not found', { status: 404 });
  },

  async scheduled(_event: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    const status = await runSync(loadConfig(env), env.FEED_KV);
    if (!status.ok) {
      // Aruncăm eroarea ca rularea să apară ca eșuată în dashboard-ul Cloudflare.
      throw new Error(status.error ?? status.cel?.error ?? 'Sincronizare eșuată');
    }
  },
};
