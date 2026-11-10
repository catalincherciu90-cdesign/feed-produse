import { describe, expect, it, vi } from 'vitest';
import { handleAdmin } from '../src/admin';
import { celDecision, clientDecision } from '../src/decisions';
import { KV_KEYS } from '../src/kv';
import { decodeCodesInput } from '../src/codesInput';
import { parseOverrides, validateOverride, validateSettings } from '../src/rules';

class FakeKV {
  store = new Map<string, string>();
  async get(key: string, opts?: string | { type?: string }) {
    const type = typeof opts === 'string' ? opts : opts?.type;
    const v = this.store.get(key);
    if (v === undefined) return null;
    if (type === 'stream') return new Response(v).body;
    return v;
  }
  async put(key: string, value: string) {
    this.store.set(key, value);
  }
  async delete(key: string) {
    this.store.delete(key);
  }
}

const TOKEN = 'secret-admin-token';
function setup() {
  const kv = new FakeKV();
  const env = { FEED_KV: kv as unknown as KVNamespace, ADMIN_TOKEN: TOKEN };
  const call = async (method: string, path: string, body?: unknown, token = TOKEN) => {
    const url = new URL(`https://x.workers.dev${path}`);
    const req = new Request(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const res = await handleAdmin(req, env, url);
    return res!;
  };
  return { kv, call };
}

const P = (sku: string, stock: number | null, price: number | null = 10) => ({ sku, stock, price });

describe('reguli și excepții', () => {
  const rules = { minStock: 10, buffer: 0, requirePrice: true };

  it('motivele CEL', () => {
    expect(celDecision(P('A', 50), rules)).toEqual({ stock: 50, reason: 'ok' });
    expect(celDecision(P('A', 5), rules)).toEqual({ stock: 0, reason: 'prag' });
    expect(celDecision(P('A', 50, 0), rules)).toEqual({ stock: 0, reason: 'pret' });
    expect(celDecision(P('A', 0), rules)).toEqual({ stock: 0, reason: 'fara-stoc' });
  });

  it('excepțiile CEL: blocare și fără prag (prețul 0 rămâne blocat)', () => {
    const overrides = { A: { cel: 'block' as const }, B: { cel: 'ignore-threshold' as const } };
    expect(celDecision(P('A', 500), { ...rules, overrides })).toEqual({ stock: 0, reason: 'blocat' });
    expect(celDecision(P('B', 5), { ...rules, overrides })).toEqual({ stock: 5, reason: 'exceptie' });
    expect(celDecision(P('B', 5, 0), { ...rules, overrides })).toEqual({ stock: 0, reason: 'pret' });
    expect(celDecision(P('B', 0), { ...rules, overrides })).toEqual({ stock: 0, reason: 'fara-stoc' });
  });

  it('limita superioară de stoc pe CEL', () => {
    const r = { ...rules, maxStock: 50 };
    expect(celDecision(P('A', 1800), r)).toEqual({ stock: 50, reason: 'ok' });
    expect(celDecision(P('A', 30), r)).toEqual({ stock: 30, reason: 'ok' });
    expect(celDecision(P('A', 5), r)).toEqual({ stock: 0, reason: 'prag' });
    expect(celDecision(P('A', 1800), { ...r, maxStock: 0 })).toEqual({ stock: 1800, reason: 'ok' });
    // rezerva se scade întâi, apoi se aplică limita
    expect(celDecision(P('A', 55), { ...r, buffer: 10 })).toEqual({ stock: 45, reason: 'ok' });
    // limita se aplică și cu excepția „fără prag”
    expect(celDecision(P('B', 1800), { ...r, overrides: { B: { cel: 'ignore-threshold' } } })).toEqual({ stock: 50, reason: 'exceptie' });
  });

  it('excepțiile pentru clienți', () => {
    const overrides = { A: { client: 'block' as const }, B: { client: 'ignore-threshold' as const } };
    expect(clientDecision(P('A', 500), 10, overrides)).toEqual({ available: false, reason: 'blocat' });
    expect(clientDecision(P('B', 3), 10, overrides)).toEqual({ available: true, reason: 'exceptie' });
    expect(clientDecision(P('B', 0), 10, overrides)).toEqual({ available: false, reason: 'fara-stoc' });
    expect(clientDecision(P('C', 9), 10, overrides)).toEqual({ available: false, reason: 'prag' });
  });

  it('validarea setărilor', () => {
    // setările vechi, fără celMaxStock, rămân valide (fără limită)
    expect(validateSettings({ availableMinStock: 10, celMinStock: '12', celStockBuffer: 0, celBlockZeroPrice: true })).toEqual({
      availableMinStock: 10, celMinStock: 12, celStockBuffer: 0, celMaxStock: 0, celBlockZeroPrice: true,
    });
    expect(validateSettings({ availableMinStock: 10, celMinStock: 10, celStockBuffer: 0, celMaxStock: '50', celBlockZeroPrice: true }).celMaxStock).toBe(50);
    expect(() => validateSettings({ availableMinStock: 10, celMinStock: 10, celStockBuffer: 0, celMaxStock: -5, celBlockZeroPrice: true })).toThrow(/maxim/);
    expect(() => validateSettings({ availableMinStock: -1, celMinStock: 10, celStockBuffer: 0, celBlockZeroPrice: true })).toThrow();
    expect(() => validateSettings({ availableMinStock: 1.5, celMinStock: 10, celStockBuffer: 0, celBlockZeroPrice: true })).toThrow();
    expect(() => validateSettings({ availableMinStock: 10, celMinStock: 10, celStockBuffer: 0, celBlockZeroPrice: 'da' })).toThrow();
  });

  it('validarea excepțiilor', () => {
    expect(validateOverride({ cel: 'default', client: 'default' })).toBeNull();
    expect(() => validateOverride({ cel: 'altceva' })).toThrow();
    expect(validateOverride({ cel: 'block', note: '  rezervat  ' })).toMatchObject({ cel: 'block', note: 'rezervat' });
    expect(parseOverrides('{"A":{"cel":"block"},"B":{"cel":"xx"},"C":5}')).toMatchObject({ A: { cel: 'block' } });
    expect(Object.keys(parseOverrides('nu e json'))).toHaveLength(0);
  });
});

describe('API panou', () => {
  it('cere token corect', async () => {
    const { call } = setup();
    expect((await call('GET', '/admin/api/overview', undefined, 'gresit')).status).toBe(401);
    expect((await call('GET', '/admin/api/overview', undefined, '')).status).toBe(401);
  });

  it('pagina și scriptul se servesc fără token, cu CSP', async () => {
    const { call } = setup();
    const page = await call('GET', '/admin', undefined, '');
    expect(page.status).toBe(200);
    expect(page.headers.get('Content-Security-Policy')).toContain("script-src 'self'");
    expect(await page.text()).toContain('/admin/app.js');
    expect((await call('GET', '/admin/app.js', undefined, '')).status).toBe(200);
  });

  it('overview combină statusul, istoricul, setările și excepțiile', async () => {
    const { kv, call } = setup();
    kv.store.set(KV_KEYS.status, '{"ok":true}');
    kv.store.set(KV_KEYS.history, '[{"t":"x","ok":true}]');
    const data = await (await call('GET', '/admin/api/overview')).json();
    expect(data).toEqual({ status: { ok: true }, history: [{ t: 'x', ok: true }], settings: null, overrides: {} });
  });

  it('salvează și resetează setările', async () => {
    const { kv, call } = setup();
    const ok = await call('PUT', '/admin/api/settings', { availableMinStock: 5, celMinStock: 8, celStockBuffer: 2, celBlockZeroPrice: false });
    expect(ok.status).toBe(200);
    expect(JSON.parse(kv.store.get(KV_KEYS.settings)!)).toMatchObject({ availableMinStock: 5, celMinStock: 8 });
    const bad = await call('PUT', '/admin/api/settings', { availableMinStock: 'zece', celMinStock: 8, celStockBuffer: 2, celBlockZeroPrice: false });
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { error: string }).error).toMatch(/Pragul pentru clienți/);
    await call('DELETE', '/admin/api/settings');
    expect(kv.store.has(KV_KEYS.settings)).toBe(false);
  });

  it('adaugă, modifică și șterge excepții', async () => {
    const { kv, call } = setup();
    await call('POST', '/admin/api/override', { sku: 'BL-1', cel: 'block', client: 'default', note: 'test' });
    await call('POST', '/admin/api/override', { sku: 'BL-2', cel: 'default', client: 'ignore-threshold' });
    let saved = JSON.parse(kv.store.get(KV_KEYS.overrides)!);
    expect(Object.keys(saved).sort()).toEqual(['BL-1', 'BL-2']);
    expect(saved['BL-1']).toMatchObject({ cel: 'block', note: 'test' });
    await call('POST', '/admin/api/override', { sku: 'BL-1', cel: 'default', client: 'default' });
    saved = JSON.parse(kv.store.get(KV_KEYS.overrides)!);
    expect(Object.keys(saved)).toEqual(['BL-2']);
    expect((await call('POST', '/admin/api/override', { sku: '', cel: 'block' })).status).toBe(400);
  });

  it('respinge corpuri prea mari', async () => {
    const { call } = setup();
    const res = await call('POST', '/admin/api/override', { sku: 'A', cel: 'block', note: 'x'.repeat(20000) });
    expect(res.status).toBe(400);
  });
});

describe('butonul Sincronizează acum', () => {
  function syncCall(kv: FakeKV, envExtra: Record<string, string>, fetchFn: typeof fetch) {
    const env = { FEED_KV: kv as unknown as KVNamespace, ADMIN_TOKEN: TOKEN, GH_REPO: 'o/r', GH_WORKFLOW: 'sync.yml', GH_REF: 'main', ...envExtra };
    const url = new URL('https://x.workers.dev/admin/api/sync');
    const req = new Request(url, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` } });
    return handleAdmin(req, env, url, fetchFn) as Promise<Response>;
  }

  it('pornește workflow-ul și blochează apăsările repetate un minut', async () => {
    const kv = new FakeKV();
    const f = vi.fn(async () => new Response(null, { status: 204 }));
    const first = await syncCall(kv, { GH_DISPATCH_TOKEN: 'gh' }, f as unknown as typeof fetch);
    expect(first.status).toBe(200);
    expect(f).toHaveBeenCalledTimes(1);
    const second = await syncCall(kv, { GH_DISPATCH_TOKEN: 'gh' }, f as unknown as typeof fetch);
    expect(second.status).toBe(429);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('dă un mesaj clar fără token GitHub', async () => {
    const res = await syncCall(new FakeKV(), {}, vi.fn() as unknown as typeof fetch);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/GH_DISPATCH_TOKEN/);
  });

  it('nu pornește nimic fără token de admin', async () => {
    const kv = new FakeKV();
    const f = vi.fn();
    const url = new URL('https://x.workers.dev/admin/api/sync');
    const req = new Request(url, { method: 'POST' });
    const res = await handleAdmin(req, { FEED_KV: kv as unknown as KVNamespace, ADMIN_TOKEN: TOKEN, GH_DISPATCH_TOKEN: 'gh' }, url, f as unknown as typeof fetch);
    expect(res!.status).toBe(401);
    expect(f).not.toHaveBeenCalled();
  });
});

describe('salvarea listei /date-tehnice.xml pornește sincronizarea cu lista inclusă', () => {
  function putCodes(kv: FakeKV, body: unknown, fetchFn: typeof fetch) {
    const env = { FEED_KV: kv as unknown as KVNamespace, ADMIN_TOKEN: TOKEN, GH_DISPATCH_TOKEN: 'gh', GH_REPO: 'o/r', GH_WORKFLOW: 'sync.yml', GH_REF: 'main' };
    const url = new URL('https://x.workers.dev/admin/api/bapp-feed-codes');
    const req = new Request(url, { method: 'PUT', headers: { Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify(body) });
    return handleAdmin(req, env, url, fetchFn) as Promise<Response>;
  }

  it('trimite workflow-ului codurile și categoriile lor, chiar imediat după altă sincronizare', async () => {
    const kv = new FakeKV();
    kv.store.set(KV_KEYS.bappProductCategories, JSON.stringify({ 'BR-1': 'Cat A', 'BR-X': 'Alta' }));
    kv.store.set(KV_KEYS.lastDispatch, String(Date.now())); // pauza de 60 s nu se aplică la salvare
    const f = vi.fn(async () => new Response(null, { status: 204 }));
    const res = (await (await putCodes(kv, { codes: ['BR-1', 'BR-2'], sync: true }, f as unknown as typeof fetch)).json()) as { dispatched: boolean; savedAt: number };
    expect(res.dispatched).toBe(true);
    const body = JSON.parse((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.inputs.feed_codes_saved_at).toBe(String(res.savedAt));
    expect(await decodeCodesInput(body.inputs.feed_codes)).toEqual({ savedAt: res.savedAt, codes: ['BR-1', 'BR-2'], categories: { 'BR-1': 'Cat A' } });
  });

  it('salvează lista chiar dacă GitHub refuză pornirea și spune de ce', async () => {
    const kv = new FakeKV();
    const f = vi.fn(async () => new Response('nu', { status: 401 }));
    const res = (await (await putCodes(kv, { codes: ['BR-1'], sync: true }, f as unknown as typeof fetch)).json()) as { ok: boolean; dispatched: boolean; dispatchError: string };
    expect(res).toMatchObject({ ok: true, dispatched: false });
    expect(res.dispatchError).toMatch(/HTTP 401/);
    expect(JSON.parse(kv.store.get(KV_KEYS.bappFeedCodes)!).codes).toEqual(['BR-1']);
  });

  it('butonul Sincronizează acum trimite și el lista salvată', async () => {
    const kv = new FakeKV();
    kv.store.set(KV_KEYS.bappFeedCodes, JSON.stringify({ savedAt: 7, codes: ['BR-5'] }));
    const f = vi.fn(async () => new Response(null, { status: 204 }));
    const env = { FEED_KV: kv as unknown as KVNamespace, ADMIN_TOKEN: TOKEN, GH_DISPATCH_TOKEN: 'gh', GH_REPO: 'o/r', GH_WORKFLOW: 'sync.yml', GH_REF: 'main' };
    const url = new URL('https://x.workers.dev/admin/api/sync');
    await handleAdmin(new Request(url, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` } }), env, url, f as unknown as typeof fetch);
    const body = JSON.parse((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect((await decodeCodesInput(body.inputs.feed_codes))?.codes).toEqual(['BR-5']);
  });
});

describe('API sincronizare automată', () => {
  it('implicit în fiecare oră; se poate schimba și opri', async () => {
    const { kv, call } = setup();
    expect(await (await call('GET', '/admin/api/auto-sync')).json()).toMatchObject({ hours: 1, state: {} });
    expect((await call('PUT', '/admin/api/auto-sync', { hours: 6 })).status).toBe(200);
    expect(JSON.parse(kv.store.get(KV_KEYS.autoSync)!)).toEqual({ hours: 6 });
    expect((await call('PUT', '/admin/api/auto-sync', { hours: 0 })).status).toBe(200);
    expect((await call('PUT', '/admin/api/auto-sync', { hours: 7 })).status).toBe(400);
    expect(await (await call('GET', '/admin/api/auto-sync')).json()).toMatchObject({ hours: 0 });
  });
});

describe('API mapare date tehnice', () => {
  it('întoarce maparea propusă, salvează una validă și respinge coloane inexistente', async () => {
    const { kv, call } = setup();
    const first = (await (await call('GET', '/admin/api/bapp-mapping')).json()) as { saved: boolean; mapping: { rules: Record<string, { column: string }> }; columns: string[]; uncertain: string[] };
    expect(first.saved).toBe(false);
    expect(first.columns).toContain('ProductCode');
    expect(first.uncertain).toContain('material');
    const m = first.mapping;
    m.rules.material = { column: 'Material - P39801' };
    expect((await call('PUT', '/admin/api/bapp-mapping', m)).status).toBe(200);
    expect(JSON.parse(kv.store.get(KV_KEYS.bappMapping)!).rules.material.column).toBe('Material - P39801');
    m.rules.material = { column: 'Nu există' };
    expect((await call('PUT', '/admin/api/bapp-mapping', m)).status).toBe(400);
    await call('DELETE', '/admin/api/bapp-mapping');
    expect(kv.store.has(KV_KEYS.bappMapping)).toBe(false);
  });

  it('datele producătorului: 404 până la prima sincronizare', async () => {
    const { kv, call } = setup();
    expect((await call('GET', '/admin/api/bapp')).status).toBe(404);
    kv.store.set(KV_KEYS.bappData, '{"products":{}}');
    expect(await (await call('GET', '/admin/api/bapp')).text()).toBe('{"products":{}}');
  });
});

describe('API listă coduri pentru feed', () => {
  it('salvează și întoarce lista', async () => {
    const { kv, call } = setup();
    expect(await (await call('GET', '/admin/api/bapp-feed-codes')).json()).toEqual({ codes: [], savedAt: 0 });
    const r = await call('PUT', '/admin/api/bapp-feed-codes', { codes: ['BR-1', 'BR-2', 'BR-1'] });
    const body = (await r.json()) as { ok: boolean; count: number; savedAt: number };
    expect(body).toMatchObject({ ok: true, count: 2 });
    expect(body.savedAt).toBeGreaterThan(0);
    expect(JSON.parse(kv.store.get(KV_KEYS.bappFeedCodes)!)).toEqual({ savedAt: body.savedAt, codes: ['BR-1', 'BR-2'] });
    expect(await (await call('GET', '/admin/api/bapp-feed-codes')).json()).toEqual({ codes: ['BR-1', 'BR-2'], savedAt: body.savedAt });
  });

  it('citește și lista salvată în formatul vechi (doar coduri)', async () => {
    const { kv, call } = setup();
    kv.store.set(KV_KEYS.bappFeedCodes, JSON.stringify(['BR-9']));
    expect(await (await call('GET', '/admin/api/bapp-feed-codes')).json()).toEqual({ codes: ['BR-9'], savedAt: 0 });
  });
});

describe('API categorii pe produs', () => {
  it('salvează și întoarce categoriile', async () => {
    const { kv, call } = setup();
    expect(await (await call('GET', '/admin/api/bapp-product-categories')).json()).toEqual({ categories: {} });
    const r = await call('PUT', '/admin/api/bapp-product-categories', { categories: { N1: 'Cat A', N2: '' } });
    expect(await r.json()).toEqual({ ok: true, count: 1 });
    expect(JSON.parse(kv.store.get(KV_KEYS.bappProductCategories)!)).toEqual({ N1: 'Cat A' });
  });
});
