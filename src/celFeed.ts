/**
 * Feed XML pentru CEL.ro (rubrica Publicare > Feed din adminul CEL).
 * Păstrează exact structura și câmpurile feed-ului sursă, ca maparea configurată în CEL
 * să rămână valabilă. Diferențe față de sursă:
 * - fără rândul de titluri și fără BOM la început
 * - câmpul de stoc e număr întreg; sub prag (implicit 10) devine 0, deci nu poate fi comandat
 * - produsele cu preț 0 sau lipsă primesc stoc 0 (CEL_BLOCK_ZERO_PRICE)
 */
import type { Product } from './source';

export function celStock(stock: number | null, minStock: number, buffer: number): number {
  if (stock === null) return 0; // stoc necunoscut => nu poate fi comandat
  return stock < minStock ? 0 : Math.max(0, stock - buffer);
}

export interface CelStockRules {
  minStock: number;
  buffer: number;
  /** true = produsele fără preț valid (lipsă sau 0) primesc stoc 0, ca să nu se vândă la 0 lei. */
  requirePrice: boolean;
}

export function hasValidPrice(p: Product): boolean {
  return p.price !== null && p.price > 0;
}

/** Stocul trimis pe CEL pentru un produs, după toate regulile. */
export function celStockFor(p: Product, rules: CelStockRules): number {
  if (rules.requirePrice && !hasValidPrice(p)) return 0;
  return celStock(p.stock, rules.minStock, rules.buffer);
}

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

export function buildCelFeed(
  rawItems: Record<string, unknown>[],
  products: Product[],
  opts: { stockField: string; rootTag: string; itemTag: string } & CelStockRules,
): string {
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>', `<${opts.rootTag}>`];
  rawItems.forEach((item, i) => {
    const copy: Record<string, unknown> = { ...item, [opts.stockField]: String(celStockFor(products[i], opts)) };
    lines.push(renderNode(opts.itemTag, copy, ''));
  });
  lines.push(`</${opts.rootTag}>`);
  return lines.join('\n') + '\n';
}
