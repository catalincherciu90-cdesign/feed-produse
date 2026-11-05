import { CelClient, type CelStockUpdate } from './cel';
import { buildCelFeed, celStock } from './celFeed';
import { buildClientFeed, isAvailable } from './clientFeed';
import type { Config } from './config';
import { getJson, KV_KEYS, type KVStore } from './kv';
import { fetchSource, parseFeed, type Product } from './source';

export { KV_KEYS };

const FULL_RESYNC_MS = 24 * 3600 * 1000;

export interface SyncStatus {
  startedAt: string;
  finishedAt?: string;
  ok: boolean;
  source?: {
    products: number;
    available: number;
    unavailable: number;
    missingStock: number;
    skippedNoSku: number;
    skippedHeader: number;
    fieldsUsed: Record<string, string | undefined>;
  };
  celFeed?: { products: number; orderable: number; bytes: number };
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

/** Calculează ce trebuie trimis pe CEL. Funcție pură, testabilă. */
export function planCelUpdates(
  products: Product[],
  pushed: Record<string, number>,
  opts: { minStock: number; buffer: number; zeroMissing: boolean; full: boolean },
): { updates: CelStockUpdate[]; zeroed: string[] } {
  const updates: CelStockUpdate[] = [];
  const current = new Set<string>();
  for (const p of products) {
    current.add(p.sku);
    if (p.stock === null) continue; // nu trimitem nimic dacă stocul e ilizibil
    // Sub prag => 0 pe CEL, ca produsul să nu poată fi comandat.
    const stoc = p.stock < opts.minStock ? 0 : Math.max(0, p.stock - opts.buffer);
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

export async function runSync(config: Config, kv: KVStore, now = new Date()): Promise<SyncStatus> {
  const status: SyncStatus = { startedAt: now.toISOString(), ok: false };
  try {
    // 1. Feed sursă
    const xml = await fetchSource(config);
    const parsed = parseFeed(xml, config);
    const products = parsed.products;

    const prevCount = Number((await kv.get(KV_KEYS.lastCount)) ?? 0);
    if (prevCount > 0 && products.length < prevCount * (1 - config.maxDropPercent / 100)) {
      throw new Error(
        `Feed-ul are ${products.length} produse față de ${prevCount} la rularea anterioară. ` +
          `Am oprit sincronizarea ca să nu golim stocul din greșeală (MAX_DROP_PERCENT=${config.maxDropPercent}).`,
      );
    }

    const available = products.filter((p) => isAvailable(p.stock, config.availableMinStock)).length;
    status.source = {
      products: products.length,
      available,
      unavailable: products.length - available,
      missingStock: products.filter((p) => p.stock === null).length,
      skippedNoSku: parsed.skippedNoSku,
      skippedHeader: parsed.skippedHeader,
      fieldsUsed: parsed.fieldsUsed,
    };

    await kv.put(KV_KEYS.lastCount, String(products.length));

    // 2. Feed clienți
    await kv.put(KV_KEYS.feed, buildClientFeed(products, config.availableMinStock, status.startedAt));

    // 2b. Feed pentru CEL (aceeași structură ca sursa, stoc 0 sub prag)
    if (config.celFeedEnabled) {
      const celXml = buildCelFeed(parsed.rawItems, products, {
        stockField: parsed.fieldsUsed.stock,
        rootTag: parsed.tags.root,
        itemTag: parsed.tags.item,
        minStock: config.celMinStock,
        buffer: config.celStockBuffer,
      });
      await kv.put(KV_KEYS.celFeed, celXml);
      status.celFeed = {
        products: products.length,
        orderable: products.filter((p) => celStock(p.stock, config.celMinStock, config.celStockBuffer) > 0).length,
        bytes: celXml.length,
      };
    }

    // 3. CEL
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
  status.finishedAt = new Date().toISOString();
  await kv.put(KV_KEYS.status, JSON.stringify(status));
  return status;
}
