/**
 * Feed XML pentru CEL.ro (rubrica Publicare > Feed din adminul CEL).
 * Păstrează exact structura și câmpurile feed-ului sursă, ca maparea configurată în CEL
 * să rămână valabilă. Diferențe față de sursă:
 * - fără rândul de titluri și fără BOM la început
 * - câmpul de stoc e număr întreg; sub prag (implicit 10) devine 0, deci nu poate fi comandat
 * - produsele cu preț 0 sau lipsă primesc stoc 0 (CEL_BLOCK_ZERO_PRICE)
 * - excepțiile din panoul de admin (blocat / fără prag) au prioritate
 * - opțional, un câmp nou cu imaginea mare (CEL_BIG_IMAGE_FROM / CEL_BIG_IMAGE_FIELD)
 * - opțional, un câmp nou cu prețul + taxa verde (CEL_PRICE_WITH_TAX_FIELD)
 * - opțional, câmpuri scoase din feed (CEL_FEED_DROP_FIELDS, ex. GreenTax)
 */
import { celStockFor, type CelStockRules } from './decisions';
import type { Product } from './source';

export { celStock, celStockFor, hasValidPrice, type CelStockRules } from './decisions';

function cdata(value: string): string {
  // "]]>" nu poate apărea într-un CDATA; se împarte în două secțiuni.
  const clean = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  return `<![CDATA[${clean.replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
}

function attrEsc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function renderNode(tag: string, value: unknown, indent: string): string {
  if (Array.isArray(value)) return value.map((v) => renderNode(tag, v, indent)).join('\n');
  if (value === null || value === undefined || value === '') return `${indent}<${tag}><![CDATA[]]></${tag}>`;
  if (typeof value !== 'object') return `${indent}<${tag}>${cdata(String(value))}</${tag}>`;

  const obj = value as Record<string, unknown>;
  const attrs = Object.entries(obj)
    .filter(([k]) => k.startsWith('@_'))
    .map(([k, v]) => ` ${k.slice(2)}="${attrEsc(String(v))}"`)
    .join('');
  const children = Object.entries(obj).filter(([k]) => !k.startsWith('@_') && k !== '#text');
  if (children.length === 0) {
    const t = obj['#text'];
    return `${indent}<${tag}${attrs}>${t === undefined ? '<![CDATA[]]>' : cdata(String(t))}</${tag}>`;
  }
  const inner = children.map(([k, v]) => renderNode(k, v, indent + '  ')).join('\n');
  return `${indent}<${tag}${attrs}>\n${inner}\n${indent}</${tag}>`;
}

/**
 * Imaginea mare derivată din miniatură: Teamshare publică imaginea principală ca
 * „…_LIST.jpg” (200x200) și varianta mare ca „…_big.jpg” (verificat pe un eșantion de produse).
 */
export interface BigImageRule {
  from: string; // câmpul sursă, ex. Size_200_x_200
  to: string; // câmpul nou, ex. Image_Big
}

/**
 * Prețul final: preț + taxa verde (ambele cu TVA).
 * Dacă `to` e chiar câmpul de preț din sursă, valoarea lui e înlocuită (fără câmp nou).
 */
export interface PriceWithTaxRule {
  after: string; // câmpul de preț din sursă, ex. PRET_LISTA
  to: string; // ex. PRET_LISTA (înlocuiește prețul) sau un nume nou (câmp adăugat după preț)
}

/** Preț + taxa verde, rotunjit la bani. Fără preț valid => 0 (produsul e oricum blocat pe CEL). */
export function priceWithGreenTax(price: number | null, greenTax: number | null | undefined): number {
  if (price === null || !(price > 0)) return 0;
  return Math.round((price + (greenTax && greenTax > 0 ? greenTax : 0)) * 100) / 100;
}

export function bigImageUrl(url: string): string {
  return url.replace(/_LIST(\.[a-z0-9]+)(\?.*)?$/i, '_big$1$2');
}

/** Copie a elementului cu câmpul nou inserat imediat după câmpul sursă (ordinea câmpurilor se păstrează). */
function withField(item: Record<string, unknown>, after: string, key: string, value: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  let placed = false;
  for (const [k, v] of Object.entries(item)) {
    if (k === key) continue;
    out[k] = v;
    if (k === after) {
      out[key] = value;
      placed = true;
    }
  }
  if (!placed) out[key] = value;
  return out;
}

function textOf(v: unknown): string {
  if (typeof v === 'string' || typeof v === 'number') return String(v).trim();
  if (v && typeof v === 'object' && '#text' in v) return textOf((v as Record<string, unknown>)['#text']);
  return '';
}

export function buildCelFeed(
  rawItems: Record<string, unknown>[],
  products: Product[],
  opts: {
    stockField: string;
    rootTag: string;
    itemTag: string;
    bigImage?: BigImageRule;
    priceWithTax?: PriceWithTaxRule;
    /** Câmpuri din sursă care NU apar în feed-ul CEL (ex. GreenTax). */
    dropFields?: string[];
  } & CelStockRules,
): string {
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>', `<${opts.rootTag}>`];
  rawItems.forEach((item, i) => {
    let copy: Record<string, unknown> = { ...item, [opts.stockField]: String(celStockFor(products[i], opts)) };
    if (opts.bigImage) {
      const src = textOf(item[opts.bigImage.from]);
      copy = withField(copy, opts.bigImage.from, opts.bigImage.to, src ? bigImageUrl(src) : '');
    }
    if (opts.priceWithTax) {
      const total = priceWithGreenTax(products[i].price, products[i].greenTax);
      if (opts.priceWithTax.to === opts.priceWithTax.after) {
        // Înlocuiește prețul din sursă; la preț 0 sau invalid lasă valoarea originală.
        if (total > 0) copy[opts.priceWithTax.to] = total.toFixed(2);
      } else {
        copy = withField(copy, opts.priceWithTax.after, opts.priceWithTax.to, total.toFixed(2));
      }
    }
    for (const f of opts.dropFields ?? []) delete copy[f];
    lines.push(renderNode(opts.itemTag, copy, ''));
  });
  lines.push(`</${opts.rootTag}>`);
  return lines.join('\n') + '\n';
}
