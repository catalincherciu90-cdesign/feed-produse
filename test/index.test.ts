import { afterEach, describe, expect, it, vi } from 'vitest';
import { KV_KEYS } from '../src/kv';
import worker, { isMachinePath, PUBLIC_HOST } from '../src/index';

const env = { FEED_KV: { get: async () => null } as unknown as KVNamespace } as never;

describe('redirect spre domeniul propriu', () => {
  it('trimite linkurile workers.dev spre feed.spotvisionelectric.ro, păstrând calea și parametrii', async () => {
    const res = await worker.fetch(new Request('https://feed-produse.x.workers.dev/admin?x=1'), env);
    expect(res.status).toBe(301);
    expect(res.headers.get('Location')).toBe(`https://${PUBLIC_HOST}/admin?x=1`);
  });

  it('feed-urile și fișele se servesc direct pe workers.dev (fără găzduirea cu anti-bot)', async () => {
    for (const path of ['/cel.xml?token=abc', '/feed.xml', '/facebook.xml', '/date-tehnice.xml', '/fise/BD60-03280.pdf']) {
      const res = await worker.fetch(new Request('https://feed-produse.x.workers.dev' + path), env);
      expect(res.status, path).not.toBe(301);
    }
    expect(isMachinePath('/date-tehnice.xml')).toBe(true);
    expect(isMachinePath('/fise/X.pdf')).toBe(true);
    expect(isMachinePath('/admin')).toBe(false);
    expect(isMachinePath('/status')).toBe(false);
    expect(isMachinePath('/a/b.xml')).toBe(false);
  });

  it('nu redirecționează cererile venite prin domeniul propriu', async () => {
    const res = await worker.fetch(new Request('https://feed-produse.x.workers.dev/date-tehnice.xml', { headers: { 'X-Forwarded-Host': PUBLIC_HOST } }), env);
    expect(res.status).not.toBe(301);
    const direct = await worker.fetch(new Request(`https://${PUBLIC_HOST}/date-tehnice.xml`), env);
    expect(direct.status).not.toBe(301);
  });
});

describe('fișa tehnică publică /fise/<cod>.pdf', () => {
  afterEach(() => vi.unstubAllGlobals());
  const BASE = 'https://bapp.ro/product-datasheet/abc123/';
  const envWith = (base: string | null) =>
    ({ FEED_KV: { get: async (k: string) => (k === KV_KEYS.datasheetBase ? base : null) } as unknown as KVNamespace }) as never;
  const get = (path: string, base: string | null = BASE) =>
    worker.fetch(new Request(`https://${PUBLIC_HOST}${path}`), envWith(base));

  it('aduce fișa de la Braytron fără să arate linkul lor', async () => {
    const f = vi.fn(async () => new Response('%PDF-1.4', { headers: { 'Content-Type': 'application/pdf' } }));
    vi.stubGlobal('fetch', f);
    const res = await get('/fise/BD60-03280.pdf');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    expect(res.headers.get('Content-Disposition')).toContain('BD60-03280-fisa-tehnica.pdf');
    expect(await res.text()).toBe('%PDF-1.4');
    const [u, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(u).toBe(BASE + 'BD60-03280_RO.pdf');
    expect(init.redirect).toBe('manual');
  });

  it('404 când Braytron nu are fișa, 503 fără sincronizare, coduri ciudate respinse', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nu', { status: 404 })));
    expect((await get('/fise/NU-EXISTA.pdf')).status).toBe(404);
    expect((await get('/fise/BD60-03280.pdf', null)).status).toBe(503);
    expect((await get('/fise/BD60-03280.pdf', 'https://evil.example/')).status).toBe(503);
    expect((await get('/fise/..%2Fsecret.pdf')).status).toBe(404); // nu se potrivește cu ruta
    expect((await get('/fise/a b.pdf')).status).toBe(404);
  });

  it('o redirecționare de la Braytron nu se urmează', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 302, headers: { Location: 'https://evil.example/' } })));
    expect((await get('/fise/BD60-03280.pdf')).status).toBe(502);
  });
});

describe('sincronizarea automată pornită de citirea unui feed sau de panou', () => {
  afterEach(() => vi.unstubAllGlobals());
  function setup(statusStartedAt: string | null, autoSync?: string) {
    const store = new Map<string, string>();
    if (statusStartedAt) store.set(KV_KEYS.status, JSON.stringify({ startedAt: statusStartedAt }));
    if (autoSync) store.set(KV_KEYS.autoSync, autoSync);
    const kv = {
      get: async (k: string, o?: unknown) => (o === 'stream' ? null : (store.get(k) ?? null)),
      put: async (k: string, v: string) => void store.set(k, v),
    };
    const env = { FEED_KV: kv as unknown as KVNamespace, GH_DISPATCH_TOKEN: 'gh', GH_REPO: 'o/r', GH_WORKFLOW: 'sync.yml', GH_REF: 'main' } as never;
    const waits: Promise<unknown>[] = [];
    const ctx = { waitUntil: (p: Promise<unknown>) => void waits.push(p), passThroughOnException() {} } as unknown as ExecutionContext;
    const gh = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', gh);
    return { env, ctx, waits, gh, store };
  }
  const req = (path: string) => new Request(`https://${PUBLIC_HOST}${path}`);

  it('pornește sincronizarea în fundal când a trecut intervalul (implicit o oră)', async () => {
    const t = setup(new Date(Date.now() - 2 * 3600_000).toISOString());
    const res = await worker.fetch(req('/cel.xml'), t.env, t.ctx);
    expect(res.status).toBe(503); // feed-ul lipsește în test; răspunsul nu așteaptă sincronizarea
    await Promise.all(t.waits);
    expect(t.gh).toHaveBeenCalledTimes(1);
    expect((t.gh.mock.calls[0] as unknown as [string])[0]).toContain('/actions/workflows/sync.yml/dispatches');
    expect(JSON.parse(t.store.get(KV_KEYS.autoSyncState)!).lastAt).toBeTruthy();
    // a doua citire imediat după: nu mai pornește alta
    await worker.fetch(req('/feed.xml'), t.env, t.ctx);
    await Promise.all(t.waits);
    expect(t.gh).toHaveBeenCalledTimes(1);
  });

  it('nu pornește dacă sincronizarea a rulat de curând sau e oprită, și nici la alte adrese', async () => {
    const recent = setup(new Date(Date.now() - 10 * 60_000).toISOString());
    await worker.fetch(req('/date-tehnice.xml'), recent.env, recent.ctx);
    await Promise.all(recent.waits);
    expect(recent.gh).not.toHaveBeenCalled();

    const off = setup(new Date(Date.now() - 48 * 3600_000).toISOString(), JSON.stringify({ hours: 0 }));
    await worker.fetch(req('/cel.xml'), off.env, off.ctx);
    await Promise.all(off.waits);
    expect(off.gh).not.toHaveBeenCalled();

    const other = setup(new Date(Date.now() - 48 * 3600_000).toISOString());
    for (const p of ['/', '/fise/X.pdf', '/status']) await worker.fetch(req(p), other.env, other.ctx);
    expect(other.waits).toHaveLength(0);
  });
});
