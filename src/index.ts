/**
 * Worker Cloudflare (plan gratuit): servește feed-urile, statusul și panoul de admin (/admin).
 * Sincronizarea propriu-zisă rulează în GitHub Actions (src/run.ts) și scrie aici în KV.
 * Sincronizarea pornește din panou (butonul „Sincronizează acum”) sau automat, din GitHub (schedule
 * în sync.yml). scheduled() de mai jos se folosește doar dacă adaugi un Cron Trigger în wrangler.toml.
 */
import { handleAdmin } from './admin';
import { runAutoSync } from './autoSync';
import { KV_KEYS } from './kv';
import type { TriggerEnv } from './trigger';

/** Domeniul public al feed-urilor și al panoului. Linkurile vechi *.workers.dev trimit aici (301). */
export const PUBLIC_HOST = 'feed.spotvisionelectric.ro';

/** Feed-urile (.xml) și fișele (/fise/…) se servesc direct pe workers.dev, fără redirect. */
export function isMachinePath(path: string): boolean {
  return /^\/[\w.-]+\.xml$/.test(path) || path.startsWith('/fise/');
}

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

async function datasheet(code: string, env: WorkerEnv, method: string): Promise<Response> {
  const base = await env.FEED_KV.get(KV_KEYS.datasheetBase, { cacheTtl: 3600 });
  if (!base || !/^https:\/\/bapp\.ro\/product-datasheet\/[\w-]+\/$/.test(base)) {
    return new Response('Fișele tehnice nu sunt disponibile încă (rulează o sincronizare).', { status: 503 });
  }
  let res: Response;
  try {
    // cacheEverything: fișa se păstrează o zi în cache-ul Cloudflare, ca bapp.ro să nu fie apelat la fiecare vizită.
    res = await fetch(base + encodeURIComponent(code) + '_RO.pdf', {
      redirect: 'manual',
      cf: { cacheTtl: 86400, cacheEverything: true },
    } as RequestInit);
  } catch {
    return new Response('Fișa tehnică nu a putut fi descărcată acum.', { status: 502 });
  }
  if (res.status === 404) return new Response('Fișa tehnică nu există pentru acest cod.', { status: 404 });
  if (res.status !== 200 || !res.body) return new Response(`Producătorul a răspuns cu HTTP ${res.status}.`, { status: 502 });
  return new Response(method === 'HEAD' ? null : res.body, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${code}-fisa-tehnica.pdf"`,
      'Cache-Control': 'public, max-age=86400',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export default {
  async scheduled(controller: ScheduledController, env: WorkerEnv, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runAutoSync(env, controller.scheduledTime).then((r) => console.log('sincronizare automată:', r)));
  },

  async fetch(req: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(req.url);

    // Linkurile vechi (feed-produse...workers.dev) merg mai departe, spre domeniul propriu.
    // Excepții: cererile care vin deja prin domeniul propriu (antetul X-Forwarded-Host) și feed-urile
    // și fișele, citite de programe (Teamshare, CEL, Meta): găzduirea din fața domeniului propriu are
    // o protecție anti-bot care le poate trimite o pagină HTML în loc de XML, deci le servim direct.
    if (url.hostname.endsWith('.workers.dev') && req.headers.get('X-Forwarded-Host') !== PUBLIC_HOST && !isMachinePath(url.pathname)) {
      return Response.redirect(`https://${PUBLIC_HOST}${url.pathname}${url.search}`, 301);
    }

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

    if (url.pathname === '/date-tehnice.xml' && req.method === 'GET') {
      // Date tehnice și poze de la producător, pentru produsele alese în panou (import în Teamshare).
      const body = await env.FEED_KV.get(KV_KEYS.techFeed, 'stream');
      if (!body) {
        return new Response(
          'Feed-ul cu date tehnice nu a fost generat încă: salvează lista de coduri în panou (tab „Date tehnice”) și sincronizează.',
          { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
        );
      }
      return new Response(body, {
        headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
      });
    }

    if (url.pathname === '/facebook.xml' && req.method === 'GET') {
      // Catalog Meta: conține doar date publice de pe site (fără stocul real).
      const body = await env.FEED_KV.get(KV_KEYS.facebookFeed, 'stream');
      if (!body) return new Response('Catalogul Facebook nu a fost generat încă', { status: 503 });
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

    // Fișa tehnică Braytron, servită de pe domeniul tău (linkul Braytron conține ID-ul privat al
    // feed-ului, de aceea nu se pune direct pe site). Folosită în coloana File din /date-tehnice.xml.
    const fisa = /^\/fise\/([A-Za-z0-9][A-Za-z0-9._-]{0,60})\.pdf$/.exec(url.pathname);
    if (fisa && (req.method === 'GET' || req.method === 'HEAD')) {
      return datasheet(fisa[1], env, req.method);
    }

    if (url.pathname === '/') {
      return new Response('SpotVision Feed Hub: OK\n', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
    return new Response('Not found', { status: 404 });
  },
};
