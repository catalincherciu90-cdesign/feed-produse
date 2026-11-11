/**
 * API-ul panoului de admin (rulează în Worker, plan gratuit: operații mici, fără parsare XML).
 * Toate rutele /admin/api/* cer header-ul Authorization: Bearer <ADMIN_TOKEN>.
 */
import { ADMIN_HTML, ADMIN_JS } from './adminPage';
import { KV_KEYS } from './kv';
import { LIMITS, parseOverrides, validateOverride, validateSettings, validateSku } from './rules';
import { dispatchSync, type TriggerEnv } from './trigger';
import { defaultMapping, readSavedFeedCodes, UNCERTAIN_RULES, validateFeedCodes, validateMapping, validateProductCategories } from './bapp';
import { TEAMSHARE_COLUMNS } from './teamshareColumns';
import { syncInputs } from './syncInputs';
import { AUTO_SYNC_HOURS, readAutoSync, readAutoSyncState, validateAutoSync } from './autoSync';

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

async function readBody(req: Request, max = MAX_BODY): Promise<unknown> {
  const len = Number(req.headers.get('Content-Length') ?? 0);
  if (len > max) throw new Error('Cerere prea mare');
  const text = await req.text();
  if (text.length > max) throw new Error('Cerere prea mare');
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('JSON invalid');
  }
}

/** Întoarce un Response dacă ruta e a panoului, altfel null. */
/**
 * Fișierele producătorului pe care panoul le poate descărca prin Worker (pozele și fișa tehnică PDF).
 * Serverele Braytron nu permit descărcarea direct din pagina panoului (fără CORS), așa că Worker-ul
 * le aduce el. Doar aceste adrese, ca ruta să nu poată fi folosită pentru altceva.
 */
const FILE_SOURCES: { host: string; path: RegExp }[] = [
  { host: 'cdn.braytron.center', path: /^\/images\/[\w.-]+\.(webp|jpe?g|png)$/i },
  { host: 'bapp.ro', path: /^\/product-datasheet\/[\w-]+\/[\w.-]+\.pdf$/i },
];

export function allowedFileUrl(raw: string | null): URL | null {
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || u.username || u.password || u.port || u.search || u.hash) return null;
  return FILE_SOURCES.some((s) => s.host === u.hostname && s.path.test(u.pathname)) ? u : null;
}

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
          "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data: https:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
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
        const fresh = { cacheTtl: 30 };
        const [status, history, settings, overrides] = await Promise.all([
          kv.get(KV_KEYS.status, fresh),
          kv.get(KV_KEYS.history, fresh),
          kv.get(KV_KEYS.settings, fresh),
          kv.get(KV_KEYS.overrides, fresh),
        ]);
        return raw(
          `{"status":${status ?? 'null'},"history":${history ?? '[]'},"settings":${settings ?? 'null'},"overrides":${overrides ?? '{}'}}`,
        );
      }

      case 'GET /admin/api/products': {
        // cacheTtl minim (30 s): după o sincronizare, lista nouă apare mai repede.
        const body = await kv.get(KV_KEYS.snapshot, { type: 'stream', cacheTtl: 30 });
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

      case 'GET /admin/api/bapp': {
        // Datele producătorului (JSON ~3,5 MB): le trimitem direct din KV, fără parsare în Worker.
        const body = await kv.get(KV_KEYS.bappData, { type: 'stream', cacheTtl: 30 });
        if (!body) return error('Datele producătorului apar după prima sincronizare cu BAPP_FEED_URL setat', 404);
        return new Response(body, {
          headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY_HEADERS },
        });
      }

      case 'GET /admin/api/bapp-mapping': {
        const saved = await kv.get(KV_KEYS.bappMapping, { cacheTtl: 30 });
        return raw(
          `{"mapping":${saved ?? JSON.stringify(defaultMapping())},"saved":${saved ? 'true' : 'false'},` +
            `"defaults":${JSON.stringify(defaultMapping())},"uncertain":${JSON.stringify(UNCERTAIN_RULES)},` +
            `"columns":${JSON.stringify(TEAMSHARE_COLUMNS)}}`,
        );
      }

      case 'PUT /admin/api/bapp-mapping': {
        const mapping = validateMapping(await readBody(req, 256 * 1024), TEAMSHARE_COLUMNS);
        await kv.put(KV_KEYS.bappMapping, JSON.stringify(mapping));
        return json({ ok: true, mapping });
      }

      case 'DELETE /admin/api/bapp-mapping': {
        await kv.delete(KV_KEYS.bappMapping);
        return json({ ok: true });
      }

      case 'GET /admin/api/bapp-feed-codes': {
        const saved = readSavedFeedCodes(await kv.get(KV_KEYS.bappFeedCodes));
        return json({ codes: saved?.codes ?? [], savedAt: saved?.savedAt ?? 0 });
      }

      case 'PUT /admin/api/bapp-feed-codes': {
        const body = await readBody(req, 512 * 1024);
        const codes = validateFeedCodes(body);
        const savedAt = Date.now();
        await kv.put(KV_KEYS.bappFeedCodes, JSON.stringify({ savedAt, codes }));
        if ((body as { sync?: unknown })?.sync !== true) return json({ ok: true, count: codes.length, savedAt });
        // Pornește imediat sincronizarea și îi dă lista direct (fără să mai aștepte KV).
        // Fără pauza de 60 s: o rulare nouă o înlocuiește pe cea care încă așteaptă, deci contează ultima listă.
        try {
          await dispatchSync(env, fetchFn, await syncInputs(kv, { savedAt, codes }));
          await kv.put(KV_KEYS.lastDispatch, String(Date.now()), { expirationTtl: 120 });
          return json({ ok: true, count: codes.length, savedAt, dispatched: true });
        } catch (e) {
          return json({ ok: true, count: codes.length, savedAt, dispatched: false, dispatchError: e instanceof Error ? e.message : String(e) });
        }
      }

      case 'GET /admin/api/bapp-product-categories': {
        const saved = await kv.get(KV_KEYS.bappProductCategories, { cacheTtl: 30 });
        return raw(`{"categories":${saved ?? '{}'}}`);
      }

      case 'PUT /admin/api/bapp-product-categories': {
        const categories = validateProductCategories(await readBody(req, 1024 * 1024));
        await kv.put(KV_KEYS.bappProductCategories, JSON.stringify(categories));
        return json({ ok: true, count: Object.keys(categories).length });
      }

      case 'GET /admin/api/auto-sync': {
        const [settings, autoState] = await Promise.all([readAutoSync(kv), readAutoSyncState(kv)]);
        return json({ ...settings, options: AUTO_SYNC_HOURS, state: autoState });
      }

      case 'PUT /admin/api/auto-sync': {
        const settings = validateAutoSync(await readBody(req, 1024));
        await kv.put(KV_KEYS.autoSync, JSON.stringify(settings));
        return json({ ok: true, ...settings });
      }

      case 'GET /admin/api/file': {
        // Poză sau fișă tehnică de la producător, pentru butonul „Poze + fișă” din Date tehnice.
        const target = allowedFileUrl(url.searchParams.get('url'));
        if (!target) return error('Adresă nepermisă: doar pozele și fișele tehnice Braytron', 400);
        // redirect: 'manual' (Workers nu acceptă 'error'): o redirecționare e tratată ca eroare,
        // ca ruta să nu poată fi dusă pe altă adresă decât cele permise.
        let res: Response;
        try {
          res = await (fetchFn ?? fetch)(target.toString(), { redirect: 'manual' });
        } catch (e) {
          return error(`Nu am putut descărca ${target.pathname}: ${e instanceof Error ? e.message : String(e)}`, 502);
        }
        if (res.status < 200 || res.status >= 300 || !res.body) {
          return error(`Producătorul a răspuns cu HTTP ${res.status} pentru ${target.pathname}`, 502);
        }
        return new Response(res.body, {
          headers: {
            'Content-Type': res.headers.get('Content-Type') ?? 'application/octet-stream',
            'Cache-Control': 'private, max-age=3600',
            ...SECURITY_HEADERS,
          },
        });
      }

      case 'POST /admin/api/sync': {
        // Protecție la apăsări repetate: maximum o pornire pe minut.
        const last = Number((await kv.get(KV_KEYS.lastDispatch)) ?? 0);
        const wait = last + SYNC_COOLDOWN_MS - Date.now();
        if (wait > 0) return error(`Sincronizarea a fost pornită acum câteva secunde. Mai încearcă în ${Math.ceil(wait / 1000)} s.`, 429);
        // Lista /date-tehnice.xml pleacă odată cu comanda: aici scrierea e vizibilă imediat,
        // dar la serverul GitHub ar putea ajunge prin KV cu până la ~60 s întârziere.
        const saved = readSavedFeedCodes(await kv.get(KV_KEYS.bappFeedCodes));
        await dispatchSync(env, fetchFn, saved ? await syncInputs(kv, saved) : undefined);
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
