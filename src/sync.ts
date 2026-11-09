import { CelClient, type CelStockUpdate } from './cel';
import { buildCelFeed } from './celFeed';
import { buildClientFeed } from './clientFeed';
import { buildFacebookFeed } from './facebookFeed';
import { bigImageUrl } from './celFeed';
import type { Config } from './config';
import { celDecision, celStockFor, clientDecision, hasValidPrice, type CelStockRules, type Reason } from './decisions';
import { isValidGtin } from './ean';
import { getJson, KV_KEYS, type KVStore } from './kv';
import { parseOverrides, validateSettings, type Overrides, type Settings } from './rules';
import { parseBapp } from './bappParse';
import { fetchSource, parseFeed, type Product } from './source';

export { KV_KEYS };

const FULL_RESYNC_MS = 24 * 3600 * 1000;
export const HISTORY_SIZE = 96; // o zi la 15 minute

export interface SyncStatus {
  startedAt: string;
  finishedAt?: string;
  ok: boolean;
  settings?: Settings & { source: 'panou' | 'workflow' };
  overrides?: number;
  warnings?: string[];
  source?: {
    products: number;
    available: number;
    unavailable: number;
    missingStock: number;
    skippedNoSku: number;
    skippedHeader: number;
    fieldsUsed: Record<string, string | undefined>;
  };
  celFeed?: { products: number; orderable: number; blockedNoPrice: number; bytes: number };
  bapp?: { products: number; linked: number; byCode: number; byEan: number; changed: boolean; bytes: number; error?: string };
  facebookFeed?: { included: number; inStock: number; skipped: { noPrice: number; noLink: number; noImage: number }; bytes: number };
  cel?: {
    skipped?: string;
    mode?: 'diff' | 'full';
    sent?: number;
    updated?: number;
    zeroedMissing?: number;
    badList?: unknown[];
    error?: string;
  };
  error?: string;
}

/** O intrare compactă în istoric. */
export interface HistoryEntry {
  t: string; // startedAt
  ok: boolean;
  products?: number;
  available?: number;
  celOrderable?: number;
  error?: string;
}

/**
 * Rând în lista de produse din panou:
 * [cod, nume, stoc, preț, stoc CEL, motiv CEL, disponibil clienți, motiv clienți,
 *  imagine (relativ la imageBase), taxa verde, nr. poze în galerie,
 *  EAN ('' = lipsă), EAN valid (1/0)]
 */
export type SnapshotRow = [
  string, string, number | null, number | null, number, Reason, 0 | 1, Reason,
  string, number | null, number,
  string, 0 | 1,
];

export interface Snapshot {
  generatedAt: string;
  settings: Settings;
  priceField: boolean;
  /** true dacă feed-ul are câmp de EAN. */
  eanField: boolean;
  /** Prefixul comun al linkurilor de imagine (scurtează lista). */
  imageBase: string;
  rows: SnapshotRow[];
}

/** Calculează ce trebuie trimis pe CEL. Funcție pură, testabilă. */
export function planCelUpdates(
  products: Product[],
  pushed: Record<string, number>,
  opts: {
    minStock: number;
    buffer: number;
    maxStock?: number;
    zeroMissing: boolean;
    full: boolean;
    requirePrice?: boolean;
    overrides?: Overrides;
  },
): { updates: CelStockUpdate[]; zeroed: string[] } {
  const updates: CelStockUpdate[] = [];
  const current = new Set<string>();
  for (const p of products) {
    current.add(p.sku);
    if (p.stock === null) continue; // nu trimitem nimic dacă stocul e ilizibil
    // Sub prag, fără preț valid sau blocat din panou => 0 pe CEL.
    const stoc = celStockFor(p, {
      minStock: opts.minStock,
      buffer: opts.buffer,
      maxStock: opts.maxStock,
      requirePrice: !!opts.requirePrice,
      overrides: opts.overrides,
    });
    if (opts.full || pushed[p.sku] !== stoc) updates.push({ products_model: p.sku, stoc });
  }
  const zeroed: string[] = [];
  if (opts.zeroMissing) {
    for (const sku of Object.keys(pushed)) {
      if (!current.has(sku)) {
        zeroed.push(sku);
        if (pushed[sku] !== 0 || opts.full) updates.push({ products_model: sku, stoc: 0 });
      }
    }
  }
  return { updates, zeroed };
}

/** Setările din panou au prioritate față de cele din workflow. */
export function applySettings(config: Config, s: Settings): Config {
  return {
    ...config,
    availableMinStock: s.availableMinStock,
    celMinStock: s.celMinStock,
    celStockBuffer: s.celStockBuffer,
    celMaxStock: s.celMaxStock,
    celBlockZeroPrice: s.celBlockZeroPrice,
  };
}

export function settingsFromConfig(config: Config): Settings {
  return {
    availableMinStock: config.availableMinStock,
    celMinStock: config.celMinStock,
    celStockBuffer: config.celStockBuffer,
    celMaxStock: config.celMaxStock,
    celBlockZeroPrice: config.celBlockZeroPrice,
  };
}

export function buildSnapshot(
  products: Product[],
  settings: Settings,
  rules: CelStockRules,
  overrides: Overrides,
  generatedAt: string,
): Snapshot {
  const imageBase = commonPrefix(products.map((p) => p.image).filter((u): u is string => !!u));
  return {
    generatedAt,
    settings,
    priceField: rules.requirePrice || products.some((p) => p.price !== null),
    imageBase,
    eanField: products.some((p) => p.ean !== undefined),
    rows: products.map((p) => {
      const c = celDecision(p, rules);
      const k = clientDecision(p, settings.availableMinStock, overrides);
      const img = p.image ? (p.image.startsWith(imageBase) ? p.image.slice(imageBase.length) : p.image) : '';
      return [
        p.sku, p.name, p.stock, p.price, c.stock, c.reason, k.available ? 1 : 0, k.reason,
        img, p.greenTax ?? null, p.galleryCount ?? 0,
        p.ean ?? '', isValidGtin(p.ean) ? 1 : 0,
      ];
    }),
  };
}

/** Prefixul comun până la ultimul „/” (ex. https://site.ro/userfiles/.../products/). */
export function commonPrefix(urls: string[]): string {
  if (!urls.length) return '';
  let pre = urls[0];
  for (const u of urls) {
    let i = 0;
    while (i < pre.length && i < u.length && pre[i] === u[i]) i++;
    pre = pre.slice(0, i);
    if (!pre) return '';
  }
  return pre.slice(0, pre.lastIndexOf('/') + 1);
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function loadAdmin(kv: KVStore, config: Config, warnings: string[]) {
  let settings = settingsFromConfig(config);
  let source: 'panou' | 'workflow' = 'workflow';
  const rawSettings = await kv.get(KV_KEYS.settings);
  if (rawSettings) {
    try {
      settings = validateSettings(JSON.parse(rawSettings));
      source = 'panou';
    } catch (e) {
      warnings.push(`Setările din panou sunt invalide și au fost ignorate: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const overrides = parseOverrides(await kv.get(KV_KEYS.overrides));
  return { settings, source, overrides };
}

async function previousCount(kv: KVStore): Promise<number> {
  const history = (await getJson<HistoryEntry[]>(kv, KV_KEYS.history)) ?? [];
  const last = history.find((h) => typeof h.products === 'number' && h.products > 0);
  if (last?.products) return last.products;
  return Number((await kv.get(KV_KEYS.lastCount)) ?? 0); // compatibilitate cu versiunea fără istoric
}

export async function runSync(baseConfig: Config, kv: KVStore, now = new Date()): Promise<SyncStatus> {
  const status: SyncStatus = { startedAt: now.toISOString(), ok: false };
  const warnings: string[] = [];
  try {
    // 0. Setări și excepții din panou
    const admin = await loadAdmin(kv, baseConfig, warnings);
    const config = applySettings(baseConfig, admin.settings);
    const overrides = admin.overrides;
    status.settings = { ...admin.settings, source: admin.source };
    status.overrides = Object.keys(overrides).length;

    // 1. Feed sursă
    const xml = await fetchSource(config);
    const parsed = parseFeed(xml, config);
    const products = parsed.products;

    const prevCount = await previousCount(kv);
    if (prevCount > 0 && products.length < prevCount * (1 - config.maxDropPercent / 100)) {
      throw new Error(
        `Feed-ul are ${products.length} produse față de ${prevCount} la rularea anterioară. ` +
          `Am oprit sincronizarea ca să nu golim stocul din greșeală (MAX_DROP_PERCENT=${config.maxDropPercent}).`,
      );
    }

    const available = products.filter((p) => clientDecision(p, config.availableMinStock, overrides).available).length;
    status.source = {
      products: products.length,
      available,
      unavailable: products.length - available,
      missingStock: products.filter((p) => p.stock === null).length,
      skippedNoSku: parsed.skippedNoSku,
      skippedHeader: parsed.skippedHeader,
      fieldsUsed: parsed.fieldsUsed,
    };

    // 2. Feed clienți
    await kv.put(KV_KEYS.feed, buildClientFeed(products, config.availableMinStock, status.startedAt, overrides));

    // Reguli CEL: prețul se verifică doar dacă feed-ul are câmp de preț.
    const rules: CelStockRules = {
      minStock: config.celMinStock,
      buffer: config.celStockBuffer,
      maxStock: config.celMaxStock,
      requirePrice: config.celBlockZeroPrice && !!parsed.fieldsUsed.price,
      overrides,
    };

    if (config.celPriceWithTaxField && !(parsed.fieldsUsed.price && parsed.fieldsUsed.greenTax)) {
      warnings.push(`${config.celPriceWithTaxField} nu a fost generat: feed-ul nu are câmp de preț sau de taxă verde.`);
    }

    // 2b. Feed pentru CEL (aceeași structură ca sursa, stoc 0 sub prag)
    if (config.celFeedEnabled) {
      const celXml = buildCelFeed(parsed.rawItems, products, {
        stockField: parsed.fieldsUsed.stock,
        rootTag: parsed.tags.root,
        itemTag: parsed.tags.item,
        bigImage: config.celBigImage,
        // Prețul cu taxa verde: doar dacă feed-ul are ambele câmpuri.
        priceWithTax:
          config.celPriceWithTaxField && parsed.fieldsUsed.price && parsed.fieldsUsed.greenTax
            ? { after: parsed.fieldsUsed.price, to: config.celPriceWithTaxField }
            : undefined,
        dropFields: config.celFeedDropFields,
        ...rules,
      });
      await kv.put(KV_KEYS.celFeed, celXml);
      status.celFeed = {
        products: products.length,
        orderable: products.filter((p) => celStockFor(p, rules) > 0).length,
        blockedNoPrice: rules.requirePrice ? products.filter((p) => !hasValidPrice(p)).length : 0,
        bytes: celXml.length,
      };
    }

    // 2b2. Catalog Facebook
    if (config.facebook.enabled) {
      const fb = buildFacebookFeed(products, {
        minStock: config.availableMinStock,
        overrides,
        currency: config.facebook.currency,
        shopName: config.facebook.shopName,
        shopUrl: config.facebook.shopUrl,
        bigImage: config.celBigImage ? bigImageUrl : undefined,
      });
      await kv.put(KV_KEYS.facebookFeed, fb.xml);
      status.facebookFeed = { included: fb.included, inStock: fb.inStock, skipped: fb.skipped, bytes: fb.xml.length };
    }

    // 2b3. Date tehnice și poze de la producător (bapp.ro). O eroare aici nu oprește sincronizarea.
    if (config.bapp.url) {
      try {
        const res = await fetch(config.bapp.url, { headers: { Accept: 'application/xml, text/xml, */*' } });
        if (!res.ok) throw new Error(`feed-ul producătorului a răspuns cu HTTP ${res.status}`);
        const data = parseBapp(await res.text(), products, {
          codePrefix: config.bapp.codePrefix,
          source: new URL(config.bapp.url).host,
          generatedAt: status.startedAt,
        });
        // Amprenta nu include data generării, ca să scriem în KV doar când datele chiar s-au schimbat.
        const body = JSON.stringify({ ...data, generatedAt: '' });
        const hash = await sha256(body);
        const changed = hash !== (await kv.get(KV_KEYS.bappHash));
        const json = JSON.stringify(data);
        if (changed) {
          await kv.put(KV_KEYS.bappData, json);
          await kv.put(KV_KEYS.bappHash, hash);
        }
        status.bapp = {
          products: Object.keys(data.products).length,
          linked: Object.keys(data.index).length,
          byCode: data.matched.byCode,
          byEan: data.matched.byEan,
          changed,
          bytes: json.length,
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        status.bapp = { products: 0, linked: 0, byCode: 0, byEan: 0, changed: false, bytes: 0, error: msg };
        warnings.push(`Datele tehnice de la producător nu au fost actualizate: ${msg}`);
      }
    }

    // 2c. Lista de produse pentru panou
    await kv.put(KV_KEYS.snapshot, JSON.stringify(buildSnapshot(products, admin.settings, rules, overrides, status.startedAt)));

    // 3. CEL prin API
    if (!config.celEnabled) {
      status.cel = { skipped: 'CEL_ENABLED=false' };
    } else {
      status.cel = {};
      try {
        const pushed = (await getJson<Record<string, number>>(kv, KV_KEYS.celPushed)) ?? {};
        const lastFull = Number((await kv.get(KV_KEYS.celLastFull)) ?? 0);
        // CEL_PUSH_ALL: trimite tot stocul la fiecare rulare, ca CEL să oglindească mereu feed-ul sursă.
        const full = config.celPushAll || now.getTime() - lastFull > FULL_RESYNC_MS;
        const plan = planCelUpdates(products, pushed, {
          minStock: config.celMinStock,
          buffer: config.celStockBuffer,
          maxStock: config.celMaxStock,
          requirePrice: rules.requirePrice,
          overrides,
          zeroMissing: config.zeroMissingOnCel,
          full,
        });
        status.cel.mode = full ? 'full' : 'diff';
        status.cel.zeroedMissing = plan.zeroed.length;
        if (plan.updates.length > 0) {
          const res = await new CelClient(config, kv).updateStock(plan.updates);
          status.cel.sent = res.sent;
          status.cel.updated = res.updated;
          status.cel.badList = res.badList.slice(0, 50);
          for (const u of plan.updates) pushed[u.products_model] = u.stoc;
          for (const sku of plan.zeroed) delete pushed[sku];
          await kv.put(KV_KEYS.celPushed, JSON.stringify(pushed));
        } else {
          status.cel.sent = 0;
        }
        if (full) await kv.put(KV_KEYS.celLastFull, String(now.getTime()));
      } catch (e) {
        status.cel.error = e instanceof Error ? e.message : String(e);
      }
    }

    status.ok = !status.cel?.error;
  } catch (e) {
    status.error = e instanceof Error ? e.message : String(e);
  }
  if (warnings.length) status.warnings = warnings;
  status.finishedAt = new Date().toISOString();
  await kv.put(KV_KEYS.status, JSON.stringify(status));

  // Istoric: cea mai nouă rulare prima, maximum HISTORY_SIZE intrări.
  const history = (await getJson<HistoryEntry[]>(kv, KV_KEYS.history)) ?? [];
  const entry: HistoryEntry = {
    t: status.startedAt,
    ok: status.ok,
    products: status.source?.products,
    available: status.source?.available,
    celOrderable: status.celFeed?.orderable,
    error: status.error ?? status.cel?.error,
  };
  await kv.put(KV_KEYS.history, JSON.stringify([entry, ...history].slice(0, HISTORY_SIZE)));
  return status;
}
