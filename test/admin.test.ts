import { describe, expect, it } from 'vitest';
import { handleAdmin } from '../src/admin';
import { celDecision, clientDecision } from '../src/decisions';
import { KV_KEYS } from '../src/kv';
import { parseOverrides, validateOverride, validateSettings } from '../src/rules';

class FakeKV {
  store = new Map<string, string>();
  async get(key: string, type?: string) {
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
