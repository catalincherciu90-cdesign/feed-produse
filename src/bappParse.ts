/**
 * Citirea feed-ului bapp.ro (producătorul Braytron). Rulează doar în GitHub Actions:
 * folosește parserul XML, care nu trebuie să ajungă în Worker.
 */
import { XMLParser } from 'fast-xml-parser';
import type { BappData } from './bapp';

// ---------------------------------------------------------------------------------------------
// Citirea feed-ului (GitHub Actions)
// ---------------------------------------------------------------------------------------------

function arr<T>(v: T | T[] | undefined | null): T[] {
  return v == null ? [] : Array.isArray(v) ? v : [v];
}

function txt(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v).trim();
  if (typeof v === 'object' && v !== null && '#text' in v) return txt((v as Record<string, unknown>)['#text']);
  return '';
}

/**
 * Citește feed-ul bapp.ro și leagă produsele de codurile tale:
 * întâi după cod (prefix + codul producătorului), apoi după EAN.
 */
export function parseBapp(
  xml: string,
  ours: { sku: string; ean?: string }[],
  opts: { codePrefix: string; source: string; generatedAt: string },
): BappData {
  const parser = new XMLParser({
    ignoreAttributes: true,
    parseTagValue: false,
    trimValues: true,
    // Feed-ul are mii de entități standard (&gt; &amp;) în texte. Ridicăm doar limita totală;
    // limitele pentru entități definite în DOCTYPE (protecția la „billion laughs”) rămân stricte.
    processEntities: {
      enabled: true,
      maxTotalExpansions: 1_000_000,
      maxExpandedLength: 100_000_000,
      maxEntitySize: 10_000,
      maxExpansionDepth: 10,
      maxEntityCount: 100,
    },
  });
  const doc = parser.parse(xml) as Record<string, unknown>;
  const root = (doc.response ?? doc) as Record<string, unknown>;
  const list = arr((root.products as Record<string, unknown> | undefined)?.product as unknown);
  if (!list.length) throw new Error('Feed-ul producătorului nu conține produse (lipsește <products><product>)');

  const attributes: BappData['attributes'] = {};
  const products: BappData['products'] = {};
  for (const raw of list) {
    const p = raw as Record<string, unknown>;
    const code = txt(p.code);
    if (!code) continue;
    const photos = arr((p.photos as Record<string, unknown> | undefined)?.photo as unknown)
      .map((ph) => ph as Record<string, unknown>)
      .sort((a, b) => Number(txt(a.order) || 0) - Number(txt(b.order) || 0))
      .map((ph) => txt(ph.url))
      .filter((u) => /^https?:\/\//i.test(u));
    const a: Record<string, string> = {};
    for (const s of arr((p.sections as Record<string, unknown> | undefined)?.section as unknown)) {
      for (const c of arr(((s as Record<string, unknown>).categories as Record<string, unknown> | undefined)?.category as unknown)) {
        for (const at of arr(((c as Record<string, unknown>).attributes as Record<string, unknown> | undefined)?.attribute as unknown)) {
          const atr = at as Record<string, unknown>;
          const slug = txt(atr.slug);
          const value = txt(atr.value);
          if (!slug || !value) continue;
          a[slug] = value;
          const info = attributes[slug] ?? (attributes[slug] = { title: txt(atr.title) || slug, count: 0 });
          info.count++;
        }
      }
    }
    products[code] = { c: code, e: txt(p.code_ean) || undefined, n: txt(p.name) || undefined, p: photos, a };
  }

  const byEan = new Map<string, string>();
  for (const pr of Object.values(products)) if (pr.e) byEan.set(pr.e, pr.c);
  const index: Record<string, string> = {};
  let byCode = 0;
  let byEanCount = 0;
  for (const o of ours) {
    const direct = opts.codePrefix && o.sku.startsWith(opts.codePrefix) ? o.sku.slice(opts.codePrefix.length) : '';
    if (direct && products[direct]) {
      index[o.sku] = direct;
      byCode++;
    } else if (o.ean && byEan.has(o.ean)) {
      index[o.sku] = byEan.get(o.ean)!;
      byEanCount++;
    }
  }
  return {
    generatedAt: opts.generatedAt,
    source: opts.source,
    attributes,
    products,
    index,
    matched: { byCode, byEan: byEanCount },
  };
}
