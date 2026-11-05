/**
 * Worker Cloudflare (plan gratuit): servește feed-urile, statusul și panoul de admin (/admin).
 * Sincronizarea propriu-zisă rulează în GitHub Actions (src/run.ts) și scrie aici în KV.
 * Cron-ul Worker-ului (la 15 minute) pornește acea sincronizare (src/trigger.ts).
 */
import { handleAdmin } from './admin';
import { KV_KEYS } from './kv';
import { dispatchSync, type TriggerEnv } from './trigger';

interface WorkerEnv extends TriggerEnv {
  FEED_KV: KVNamespace;
  CLIENT_FEED_TOKEN?: string; // dacă e setat, feed-ul cere ?token=...
  CEL_FEED_TOKEN?: string; // dacă e setat, /cel.xml cere ?token=...
  ADMIN_TOKEN?: string; // pentru /status
}

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

export default {
  async fetch(req: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(req.url);

    // Panoul de admin: /admin și /admin/api/*
    const admin = await handleAdmin(req, env, url);
    if (admin) return admin;

    const token = tokenFrom(req, url);

    if (url.pathname === '/feed.xml' && req.method === 'GET') {
      if (env.CLIENT_FEED_TOKEN && !timingSafeEqual(token, env.CLIENT_FEED_TOKEN)) {
        return new Response('Acces neautorizat', { status: 401 });
      }
      // Stream direct din KV: consum minim de CPU, încape în limita planului gratuit.
      const body = await env.FEED_KV.get(KV_KEYS.feed, 'stream');
      if (!body) return new Response('Feed-ul nu a fost generat încă', { status: 503 });
      return new Response(body, {
        headers: {
          'Content-Type': 'application/xml; charset=utf-8',
          'Cache-Control': 'public, max-age=300',
        },
      });
    }

    if (url.pathname === '/cel.xml' && req.method === 'GET') {
      // Conține stocul real (peste prag), deci se poate proteja cu un token pus în linkul dat la CEL.
      if (env.CEL_FEED_TOKEN && !timingSafeEqual(token, env.CEL_FEED_TOKEN)) {
        return new Response('Acces neautorizat', { status: 401 });
      }
      const body = await env.FEED_KV.get(KV_KEYS.celFeed, 'stream');
      if (!body) return new Response('Feed-ul CEL nu a fost generat încă', { status: 503 });
      return new Response(body, {
        headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
      });
    }

    if (url.pathname === '/status' && req.method === 'GET') {
      if (!env.ADMIN_TOKEN || !timingSafeEqual(token, env.ADMIN_TOKEN)) {
        return new Response('Acces neautorizat', { status: 401 });
      }
      const status = await env.FEED_KV.get(KV_KEYS.status);
      return new Response(status ?? 'null', { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
    }

    if (url.pathname === '/') {
      return new Response('feed-produse: OK\n', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
    return new Response('Not found', { status: 404 });
  },

  // Cron Cloudflare (wrangler.toml [triggers]): pornește sincronizarea din GitHub Actions.
  async scheduled(_event: ScheduledController, env: WorkerEnv): Promise<void> {
    await dispatchSync(env);
  },
};
