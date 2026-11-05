/**
 * API-ul panoului de admin (rulează în Worker, plan gratuit: operații mici, fără parsare XML).
 * Toate rutele /admin/api/* cer header-ul Authorization: Bearer <ADMIN_TOKEN>.
 */
import { ADMIN_HTML, ADMIN_JS } from './adminPage';
import { KV_KEYS } from './kv';
import { LIMITS, parseOverrides, validateOverride, validateSettings, validateSku } from './rules';
import { dispatchSync, type TriggerEnv } from './trigger';

export interface AdminEnv extends TriggerEnv {
  FEED_KV: KVNamespace;
  ADMIN_TOKEN?: string;
}

/** Pauza minimă între două porniri ale sincronizării din panou. */
export const SYNC_COOLDOWN_MS = 60 * 1000;

const MAX_BODY = 16 * 1024;

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
};

function json(data: unknown, status = 200): Response {
  return raw(JSON.stringify(data), status);
}

function raw(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY_HEADERS },
  });
}

function error(message: string, status: number): Response {
  return json({ error: message }, status);
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function readBody(req: Request): Promise<unknown> {
  const len = Number(req.headers.get('Content-Length') ?? 0);
  if (len > MAX_BODY) throw new Error('Cerere prea mare');
  const text = await req.text();
  if (text.length > MAX_BODY) throw new Error('Cerere prea mare');
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('JSON invalid');
  }
}

/** Întoarce un Response dacă ruta e a panoului, altfel null. */
export async function handleAdmin(
  req: Request,
  env: AdminEnv,
  url: URL,
  fetchFn?: typeof fetch,
): Promise<Response | null> {
  const path = url.pathname;
  if (path === '/admin' || path === '/admin/') {
    return new Response(ADMIN_HTML, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Security-Policy':
          "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
        ...SECURITY_HEADERS,
      },
    });
  }
  if (path === '/admin/app.js') {
    return new Response(ADMIN_JS, {
      headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY_HEADERS },
    });
  }
  if (!path.startsWith('/admin/api/')) return null;

  // Autentificare
  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!env.ADMIN_TOKEN) return error('ADMIN_TOKEN nu este setat pe Worker', 503);
  if (!timingSafeEqual(token, env.ADMIN_TOKEN)) return error('Token greșit', 401);

  const kv = env.FEED_KV;
  const route = `${req.method} ${path}`;

  try {
    switch (route) {
      case 'GET /admin/api/overview': {
        // Valorile sunt deja JSON în KV: le lipim fără parsare (consum minim de CPU).
        const [status, history, settings, overrides] = await Promise.all([
          kv.get(KV_KEYS.status),
          kv.get(KV_KEYS.history),
          kv.get(KV_KEYS.settings),
          kv.get(KV_KEYS.overrides),
        ]);
        return raw(
          `{"status":${status ?? 'null'},"history":${history ?? '[]'},"settings":${settings ?? 'null'},"overrides":${overrides ?? '{}'}}`,
        );
      }

      case 'GET /admin/api/products': {
        const body = await kv.get(KV_KEYS.snapshot, 'stream');
        if (!body) return error('Lista de produse apare după prima sincronizare', 404);
        return new Response(body, {
          headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY_HEADERS },
        });
      }

      case 'PUT /admin/api/settings': {
        const settings = validateSettings(await readBody(req));
        await kv.put(KV_KEYS.settings, JSON.stringify(settings));
        return json({ ok: true, settings });
      }

      case 'DELETE /admin/api/settings': {
        await kv.delete(KV_KEYS.settings);
        return json({ ok: true });
      }

      case 'POST /admin/api/override': {
        const body = (await readBody(req)) as Record<string, unknown>;
        const sku = validateSku(body?.sku);
        const override = validateOverride(body);
        const overrides = parseOverrides(await kv.get(KV_KEYS.overrides));
        if (override) {
          if (!overrides[sku] && Object.keys(overrides).length >= LIMITS.maxOverrides) {
            return error(`Maximum ${LIMITS.maxOverrides} excepții`, 400);
          }
          overrides[sku] = override;
        } else {
          delete overrides[sku];
        }
        await kv.put(KV_KEYS.overrides, JSON.stringify(overrides));
        return json({ ok: true, sku, override });
      }

      case 'POST /admin/api/sync': {
        // Protecție la apăsări repetate: maximum o pornire pe minut.
        const last = Number((await kv.get(KV_KEYS.lastDispatch)) ?? 0);
        const wait = last + SYNC_COOLDOWN_MS - Date.now();
        if (wait > 0) return error(`Sincronizarea a fost pornită acum câteva secunde. Mai încearcă în ${Math.ceil(wait / 1000)} s.`, 429);
        await dispatchSync(env, fetchFn);
        const requestedAt = new Date().toISOString();
        // expirationTtl minim acceptat de KV e 60 de secunde
        await kv.put(KV_KEYS.lastDispatch, String(Date.now()), { expirationTtl: 120 });
        return json({ ok: true, requestedAt });
      }

      default:
        return error('Rută necunoscută', 404);
    }
  } catch (e) {
    return error(e instanceof Error ? e.message : String(e), 400);
  }
}
