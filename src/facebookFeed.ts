/**
 * Catalog de produse pentru Meta (Facebook / Instagram Shop și reclame dinamice).
 * Format RSS 2.0 cu câmpuri g: (formatul Google Merchant, acceptat de Meta Commerce Manager).
 *
 * Reguli:
 * - prețul este cel afișat pe site (PRET_LISTA, cu TVA, fără taxa verde): Meta cere ca prețul
 *   din catalog să fie același cu cel de pe pagina produsului
 * - disponibilitatea urmează regula feed-ului pentru clienți (prag + excepții din panou)
 * - produsele fără preț, fără link sau fără poză nu intră în catalog (Meta le respinge)
 * - EAN-ul (g:gtin) se trimite doar dacă e valid și nu e folosit la alt produs
 */
import { clientDecision } from './decisions';
import { isValidGtin } from './ean';
import type { Overrides } from './rules';
import type { Product } from './source';

export interface FacebookFeedOptions {
  minStock: number;
  overrides?: Overrides;
  currency: string; // ex. RON
  shopName: string;
  shopUrl: string;
  bigImage?: (url: string) => string; // miniatura -> poza mare
}

const MAX_TITLE = 150;
const MAX_DESCRIPTION = 5000;
const MAX_EXTRA_IMAGES = 10;

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Text simplu din descrierea HTML a magazinului. */
export function plainText(html: string | undefined): string {
  if (!html) return '';
  return html
    .replace(/<\s*(br|\/p|\/div|\/li|\/h\d)\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === '#') {
        const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/[ \t ]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

function cut(s: string, max: number): string {
  if (s.length <= max) return s;
  const part = s.slice(0, max - 1);
  const space = part.lastIndexOf(' ');
  return (space > max * 0.7 ? part.slice(0, space) : part) + '…';
}

export interface FacebookFeedResult {
  xml: string;
  included: number;
  inStock: number;
  skipped: { noPrice: number; noLink: number; noImage: number };
}

export function buildFacebookFeed(products: Product[], opts: FacebookFeedOptions): FacebookFeedResult {
  // EAN-urile folosite la mai multe produse nu se trimit (Meta le-ar lega de produsul greșit).
  const eanUse = new Map<string, number>();
  for (const p of products) if (p.ean) eanUse.set(p.ean, (eanUse.get(p.ean) ?? 0) + 1);

  const skipped = { noPrice: 0, noLink: 0, noImage: 0 };
  let inStock = 0;
  const items: string[] = [];

  for (const p of products) {
    if (p.price === null || !(p.price > 0)) {
      skipped.noPrice++;
      continue;
    }
    if (!p.url) {
      skipped.noLink++;
      continue;
    }
    if (!p.image) {
      skipped.noImage++;
      continue;
    }
    const available = clientDecision(p, opts.minStock, opts.overrides).available;
    if (available) inStock++;

    const title = cut(p.name || p.sku, MAX_TITLE);
    const description = cut(plainText(p.description) || plainText(p.intro) || title, MAX_DESCRIPTION);
    const image = opts.bigImage ? opts.bigImage(p.image) : p.image;
    const lines = [
      '    <item>',
      `      <g:id>${esc(p.sku)}</g:id>`,
      `      <g:title>${esc(title)}</g:title>`,
      `      <g:description>${esc(description)}</g:description>`,
      `      <g:link>${esc(p.url)}</g:link>`,
      `      <g:image_link>${esc(image)}</g:image_link>`,
    ];
    for (const extra of (p.gallery ?? []).filter((u) => u !== image).slice(0, MAX_EXTRA_IMAGES)) {
      lines.push(`      <g:additional_image_link>${esc(extra)}</g:additional_image_link>`);
    }
    lines.push(
      `      <g:availability>${available ? 'in stock' : 'out of stock'}</g:availability>`,
      '      <g:condition>new</g:condition>',
      `      <g:price>${p.price.toFixed(2)} ${esc(opts.currency)}</g:price>`,
      `      <g:brand>${esc(p.brand || opts.shopName)}</g:brand>`,
    );
    if (p.ean && isValidGtin(p.ean) && eanUse.get(p.ean) === 1) lines.push(`      <g:gtin>${esc(p.ean)}</g:gtin>`);
    if (p.category) lines.push(`      <g:product_type>${esc(p.category.split('/').map((c) => c.trim()).join(' > '))}</g:product_type>`);
    lines.push('    </item>');
    items.push(lines.join('\n'));
  }

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">',
    '  <channel>',
    `    <title>${esc(opts.shopName)}</title>`,
    `    <link>${esc(opts.shopUrl)}</link>`,
    `    <description>${esc(`Catalog de produse ${opts.shopName}`)}</description>`,
    ...items,
    '  </channel>',
    '</rss>',
    '',
  ].join('\n');

  return { xml, included: items.length, inStock, skipped };
}
