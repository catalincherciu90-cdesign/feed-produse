import { describe, expect, it, vi } from 'vitest';
import { CelClient } from '../src/cel';
import { buildCelFeed, celStock, celStockFor } from '../src/celFeed';
import { buildClientFeed, isAvailable } from '../src/clientFeed';
import { loadConfig, type Env } from '../src/config';
import { parseFeed, parseNumber } from '../src/source';
import { KV_KEYS, planCelUpdates, runSync } from '../src/sync';

class MemKV {
  store = new Map<string, string>();
  async get(key: string) {
    return this.store.get(key) ?? null;
  }
  async put(key: string, value: string) {
    this.store.set(key, value);
  }
}

const SAMPLE = `<?xml version="1.0"?>
<catalog>
  <produs><cod>Cod</cod><denumire>Denumire</denumire><stoc>Stoc</stoc></produs>
  <produs><cod>0012</cod><denumire>Periuță &amp; pastă</denumire><stoc>25</stoc><pret>12,50</pret><ean>594</ean></produs>
  <produs><cod>0013</cod><denumire>Ață dentară</denumire><stoc>9</stoc><pret>8</pret></produs>
  <produs><cod>0014</cod><denumire>Exact 10</denumire><stoc>10</stoc></produs>
  <produs><cod>0015</cod><denumire>Fără stoc</denumire><stoc></stoc></produs>
  <produs><denumire>Fără cod</denumire><stoc>3</stoc></produs>
</catalog>`;

const baseEnv = { SOURCE_URL: 'https://exemplu.ro/feed.xml', CLIENT_FEED_EXTRA_FIELDS: 'ean' } as unknown as Env;

describe('parseNumber', () => {
  it('înțelege formatele uzuale', () => {
    expect(parseNumber('12')).toBe(12);
    expect(parseNumber('1.234,50')).toBe(1234.5);
    expect(parseNumber('1,234.50')).toBe(1234.5);
    expect(parseNumber('199.99 RON')).toBe(199.99);
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('abc')).toBeNull();
  });
});

describe('parseFeed', () => {
  it('detectează automat produsele și câmpurile', () => {
    const r = parseFeed(SAMPLE, loadConfig(baseEnv));
    expect(r.fieldsUsed).toMatchObject({ sku: 'cod', stock: 'stoc', name: 'denumire', price: 'pret' });
    expect(r.products.map((p) => p.sku)).toEqual(['0012', '0013', '0014', '0015']);
    expect(r.products[0]).toMatchObject({ stock: 25, price: 12.5, extra: { ean: '594' } });
    expect(r.products[3].stock).toBeNull();
    expect(r.skippedNoSku).toBe(1);
    expect(r.skippedHeader).toBe(1);
  });

  it('dă o eroare clară când nu găsește câmpul de stoc', () => {
    const xml = '<a><p><cod>1</cod><x>2</x></p><p><cod>2</cod><x>3</x></p></a>';
    expect(() => parseFeed(xml, loadConfig(baseEnv))).toThrow(/FIELD_STOCK/);
  });
});

describe('disponibilitate', () => {
  it('sub 10 bucăți = indisponibil, 10 sau peste = disponibil', () => {
    expect(isAvailable(9, 10)).toBe(false);
    expect(isAvailable(10, 10)).toBe(true);
    expect(isAvailable(null, 10)).toBe(false);
  });

  it('feed-ul clienților nu conține stocul real', () => {
    const { products } = parseFeed(SAMPLE, loadConfig(baseEnv));
    const xml = buildClientFeed(products, 10, '2026-11-05T10:00:00Z');
    expect(xml).toContain('<cod>0012</cod>');
    expect(xml).toContain('Periuță &amp; pastă');
    expect(xml).toContain('<ean>594</ean>');
    expect(xml).not.toMatch(/<stoc>/);
    expect(xml.match(/<disponibil>da<\/disponibil>/g)).toHaveLength(2);
    expect(xml.match(/<disponibil>nu<\/disponibil>/g)).toHaveLength(2);
  });
});

describe('planCelUpdates', () => {
  const products = [
    { sku: 'A', name: '', stock: 5, price: null, extra: {} },
    { sku: 'B', name: '', stock: 20, price: null, extra: {} },
    { sku: 'C', name: '', stock: null, price: null, extra: {} },
  ];

  it('trimite doar ce s-a schimbat și pune 0 la produsele dispărute', () => {
    const plan = planCelUpdates(products, { A: 5, B: 18, Z: 4 }, { minStock: 0, buffer: 0, zeroMissing: true, full: false });
    expect(plan.updates).toEqual([
      { products_model: 'B', stoc: 20 },
      { products_model: 'Z', stoc: 0 },
    ]);
    expect(plan.zeroed).toEqual(['Z']);
  });

  it('sub prag trimite 0 pe CEL, ca produsul să nu poată fi comandat', () => {
    const items = [
      { sku: 'A', name: '', stock: 9, price: null, extra: {} },
      { sku: 'B', name: '', stock: 10, price: null, extra: {} },
      { sku: 'C', name: '', stock: 294, price: null, extra: {} },
    ];
    const plan = planCelUpdates(items, {}, { minStock: 10, buffer: 0, zeroMissing: true, full: true });
    expect(plan.updates).toEqual([
      { products_model: 'A', stoc: 0 },
      { products_model: 'B', stoc: 10 },
      { products_model: 'C', stoc: 294 },
    ]);
  });

  it('o comandă care coboară stocul sub prag e permisă, blocarea vine la sincronizarea următoare', () => {
    const opts = { minStock: 10, buffer: 0, zeroMissing: true, full: false };
    // Sincronizare: 12 în stoc => pe CEL apar toate 12, deci o comandă de 5 poate fi plasată.
    const first = planCelUpdates([{ sku: 'A', name: '', stock: 12, price: null, extra: {} }], {}, opts);
    expect(first.updates).toEqual([{ products_model: 'A', stoc: 12 }]);
    // După comandă feed-ul arată 7 => sub prag, produsul se blochează pe CEL.
    const next = planCelUpdates([{ sku: 'A', name: '', stock: 7, price: null, extra: {} }], { A: 12 }, opts);
    expect(next.updates).toEqual([{ products_model: 'A', stoc: 0 }]);
  });

  it('aplică rezerva și nu coboară sub 0', () => {
    const plan = planCelUpdates(products, {}, { minStock: 0, buffer: 10, zeroMissing: true, full: true });
    expect(plan.updates).toEqual([
      { products_model: 'A', stoc: 0 },
      { products_model: 'B', stoc: 10 },
    ]);
  });
});

describe('runSync', () => {
  function celFetch() {
    return vi.fn(async (url: string, init: RequestInit) => {
      const body = new URLSearchParams(init.body as string);
      if (url.endsWith('login/actionLogin/')) {
        return new Response(JSON.stringify({ error: 0, tokenStatus: 1, message: 'TOKEN' }));
      }
      const sent = JSON.parse(body.get('products')!);
      expect((init.headers as Record<string, string>).AUTH).toBe('Bearer TOKEN');
      return new Response(
        JSON.stringify({ error: 0, tokenStatus: 1, message: { updated: sent.map((p: any) => p.products_model), bad_list: [] } }),
      );
    });
  }

  it('generează feed-ul și trimite stocul pe CEL', async () => {
    const kv = new MemKV();
    const cel = celFetch();
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === baseEnv.SOURCE_URL) return new Response(SAMPLE);
      return cel(url, init!);
    });
    vi.stubGlobal('fetch', fetchMock);
    const config = loadConfig({ ...baseEnv, CEL_USERNAME: 'u', CEL_PASSWORD: 'p' } as Env);

    const s1 = await runSync(config, kv, new Date('2026-11-05T10:00:00Z'));
    expect(s1.ok).toBe(true);
    expect(s1.cel).toMatchObject({ mode: 'full', sent: 3, updated: 3 });
    expect(kv.store.get(KV_KEYS.feed)).toContain('<produs>');
    expect(kv.store.get(KV_KEYS.celFeed)).toContain('<catalog>');
    expect(s1.celFeed).toMatchObject({ products: 4, orderable: 1, blockedNoPrice: 2 }); // 0014 și 0015 nu au preț

    // Implicit (CEL_PUSH_ALL): a doua rulare retrimite tot, ca CEL să oglindească feed-ul.
    const s2 = await runSync(config, kv, new Date('2026-11-05T10:15:00Z'));
    expect(s2.cel).toMatchObject({ mode: 'full', sent: 3 });

    // Cu CEL_PUSH_ALL=false: a doua rulare fără modificări nu trimite nimic.
    const diffConfig = loadConfig({ ...baseEnv, CEL_USERNAME: 'u', CEL_PASSWORD: 'p', CEL_PUSH_ALL: 'false' } as Env);
    const s3 = await runSync(diffConfig, kv, new Date('2026-11-05T10:30:00Z'));
    expect(s3.cel).toMatchObject({ mode: 'diff', sent: 0 });
    vi.unstubAllGlobals();
  });

  it('se oprește dacă feed-ul scade brusc', async () => {
    const kv = new MemKV();
    kv.store.set(KV_KEYS.lastCount, '100');
    kv.store.set(KV_KEYS.feed, 'VECHI');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(SAMPLE)));
    const s = await runSync(loadConfig({ ...baseEnv, CEL_ENABLED: 'false' } as Env), kv);
    expect(s.ok).toBe(false);
    expect(s.error).toMatch(/oprit sincronizarea/);
    expect(kv.store.get(KV_KEYS.feed)).toBe('VECHI');
    vi.unstubAllGlobals();
  });
});

describe('CelClient', () => {
  it('regenerează token-ul când CEL îl respinge', async () => {
    const kv = new MemKV();
    kv.store.set('cel:token', 'EXPIRAT');
    let logins = 0;
    const fetchFn = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('login/actionLogin/')) {
        logins++;
        return new Response(JSON.stringify({ error: 0, tokenStatus: 1, message: 'NOU' }));
      }
      const auth = (init.headers as Record<string, string>).AUTH;
      if (auth === 'Bearer EXPIRAT') return new Response(JSON.stringify({ error: 403, tokenStatus: 0, message: 'token' }));
      return new Response(JSON.stringify({ error: 0, tokenStatus: 1, message: { updated: ['A'], bad_list: [] } }));
    });
    const config = loadConfig({ ...baseEnv, CEL_USERNAME: 'u', CEL_PASSWORD: 'p' } as Env);
    const client = new CelClient(config, kv, fetchFn as unknown as typeof fetch);
    const res = await client.updateStock([{ products_model: 'A', stoc: 3 }]);
    expect(res.updated).toBe(1);
    expect(logins).toBe(1);
  });
});

describe('feed CEL', () => {
  it('sub prag sau stoc necunoscut => 0, altfel stocul real minus rezerva', () => {
    expect(celStock(9, 10, 0)).toBe(0);
    expect(celStock(10, 10, 0)).toBe(10);
    expect(celStock(null, 10, 0)).toBe(0);
    expect(celStock(25, 10, 5)).toBe(20);
  });

  it('păstrează structura sursei, scoate rândul de titluri și transformă stocul', () => {
    const r = parseFeed(SAMPLE, loadConfig(baseEnv));
    const xml = buildCelFeed(r.rawItems, r.products, {
      stockField: 'stoc', rootTag: r.tags.root, itemTag: r.tags.item, minStock: 10, buffer: 0, requirePrice: false,
    });
    expect(r.tags).toEqual({ root: 'catalog', item: 'produs' });
    expect(xml.startsWith('<?xml')).toBe(true);
    expect(xml).not.toContain('<![CDATA[Cod]]>');
    expect(xml).toContain('<cod><![CDATA[0012]]></cod>');
    expect(xml).toContain('<stoc><![CDATA[25]]></stoc>');
    expect(xml).toContain('<stoc><![CDATA[0]]></stoc>'); // 9 bucăți
    expect(xml).toContain('<pret><![CDATA[12,50]]></pret>'); // celelalte câmpuri rămân neschimbate
    expect(xml.match(/<produs>/g)).toHaveLength(4);
  });

  it('produsele fără preț valid primesc 0 pe CEL, chiar cu stoc mare', () => {
    const rules = { minStock: 10, buffer: 0, requirePrice: true };
    const base = { sku: 'A', name: '', stock: 600, extra: {} };
    expect(celStockFor({ ...base, price: 0 }, rules)).toBe(0);
    expect(celStockFor({ ...base, price: null }, rules)).toBe(0);
    expect(celStockFor({ ...base, price: 10.89 }, rules)).toBe(600);
    expect(celStockFor({ ...base, price: 0 }, { ...rules, requirePrice: false })).toBe(600);
  });

  it('nu strică textele care conțin ]]>', () => {
    const xml = buildCelFeed([{ cod: 'A', desc: 'x ]]> y', stoc: '5' }], [{ sku: 'A', name: '', stock: 50, price: null, extra: {} }], {
      stockField: 'stoc', rootTag: 'products', itemTag: 'product', minStock: 10, buffer: 0, requirePrice: false,
    });
    const back = parseFeed(xml, loadConfig({ SOURCE_URL: 'x', SOURCE_ITEM_PATH: 'products.product', FIELD_SKU: 'cod', FIELD_STOCK: 'stoc' } as unknown as Env));
    expect(back.rawItems[0].desc).toBe('x ]]> y');
    expect(back.products[0].stock).toBe(50);
  });
});

describe('runSync cu setări și excepții din panou', () => {
  it('aplică setările din panou, excepțiile și scrie istoricul și lista de produse', async () => {
    const kv = new MemKV();
    kv.store.set(KV_KEYS.settings, JSON.stringify({ availableMinStock: 5, celMinStock: 5, celStockBuffer: 0, celBlockZeroPrice: false }));
    kv.store.set(KV_KEYS.overrides, JSON.stringify({ '0012': { cel: 'block' }, '0013': { client: 'block' } }));
    vi.stubGlobal('fetch', vi.fn(async () => new Response(SAMPLE)));
    const s = await runSync(loadConfig({ ...baseEnv, CEL_ENABLED: 'false' } as Env), kv);
    expect(s.ok).toBe(true);
    expect(s.settings).toMatchObject({ availableMinStock: 5, source: 'panou' });
    expect(s.overrides).toBe(2);
    const snap = JSON.parse(kv.store.get(KV_KEYS.snapshot)!);
    const row = (sku: string) => snap.rows.find((r: unknown[]) => r[0] === sku);
    expect(row('0012').slice(4, 6)).toEqual([0, 'blocat']); // blocat manual pe CEL, deși are 25 buc.
    expect(row('0013').slice(4, 8)).toEqual([9, 'ok', 0, 'blocat']); // 9 >= prag 5 pe CEL, dar blocat la clienți
    expect(kv.store.get(KV_KEYS.feed)).toMatch(/<cod>0013<\/cod>[\s\S]*?<disponibil>nu<\/disponibil>/);
    expect(kv.store.get(KV_KEYS.celFeed)).toMatch(/<!\[CDATA\[0012\]\]>[\s\S]*?<stoc><!\[CDATA\[0\]\]><\/stoc>/);
    const history = JSON.parse(kv.store.get(KV_KEYS.history)!);
    expect(history[0]).toMatchObject({ ok: true, products: 4 });
    vi.unstubAllGlobals();
  });

  it('setările invalide din panou sunt ignorate cu avertisment', async () => {
    const kv = new MemKV();
    kv.store.set(KV_KEYS.settings, '{"availableMinStock":-3}');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(SAMPLE)));
    const s = await runSync(loadConfig({ ...baseEnv, CEL_ENABLED: 'false' } as Env), kv);
    expect(s.ok).toBe(true);
    expect(s.settings?.source).toBe('workflow');
    expect(s.warnings?.[0]).toMatch(/invalide/);
    vi.unstubAllGlobals();
  });

  it('verificarea de scădere bruscă folosește istoricul', async () => {
    const kv = new MemKV();
    kv.store.set(KV_KEYS.history, JSON.stringify([{ t: 'x', ok: false }, { t: 'y', ok: true, products: 100 }]));
    vi.stubGlobal('fetch', vi.fn(async () => new Response(SAMPLE)));
    const s = await runSync(loadConfig({ ...baseEnv, CEL_ENABLED: 'false' } as Env), kv);
    expect(s.error).toMatch(/oprit sincronizarea/);
    expect(JSON.parse(kv.store.get(KV_KEYS.history)!)).toHaveLength(3);
    vi.unstubAllGlobals();
  });
});
