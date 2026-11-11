import { afterEach, describe, expect, it, vi } from 'vitest';
import { KV_KEYS } from '../src/kv';
import worker, { PUBLIC_HOST } from '../src/index';

const env = { FEED_KV: { get: async () => null } as unknown as KVNamespace } as never;

describe('redirect spre domeniul propriu', () => {
  it('trimite linkurile workers.dev spre feed.spotvisionelectric.ro, păstrând calea și parametrii', async () => {
    const res = await worker.fetch(new Request('https://feed-produse.x.workers.dev/cel.xml?token=abc'), env);
    expect(res.status).toBe(301);
    expect(res.headers.get('Location')).toBe(`https://${PUBLIC_HOST}/cel.xml?token=abc`);
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
