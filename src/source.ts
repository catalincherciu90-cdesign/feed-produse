import { XMLParser } from 'fast-xml-parser';
import type { Config } from './config';

export interface Product {
  sku: string;
  name: string;
  stock: number | null; // null = stoc lipsă sau ilizibil
  price: number | null;
  extra: Record<string, string>;
}

const SKU_CANDIDATES = ['sku', 'cod', 'cod_produs', 'code', 'product_code', 'model', 'products_model', 'id', 'g:id'];
const STOCK_CANDIDATES = ['stoc', 'stock', 'cantitate', 'quantity', 'qty', 'stock_quantity', 'inventory'];
const NAME_CANDIDATES = ['nume', 'name', 'denumire', 'title', 'titlu', 'g:title', 'product_name'];
const PRICE_CANDIDATES = ['pret', 'price', 'pret_vanzare', 'g:price', 'pretf'];

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Text dintr-un nod XML (poate fi string, număr sau obiect cu #text). */
function text(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v).trim();
  if (isObj(v) && '#text' in v) return text(v['#text']);
  return undefined;
}

/** Acceptă "12", "12.00", "12,5", "1.234,50", "199.99 RON". */
export function parseNumber(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  let s = raw.replace(/[^\d.,-]/g, '');
  if (s === '' || s === '-') return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > lastDot) {
    s = s.replace(/\./g, '').replace(',', '.'); // format românesc 1.234,50
  } else {
    s = s.replace(/,/g, ''); // format 1,234.50
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function getPath(root: unknown, path: string): unknown {
  let cur: unknown = root;
  for (const part of path.split('.')) {
    if (!isObj(cur)) return undefined;
    cur = cur[part];
  }
  return cur;
}

/** Găsește cea mai mare listă de obiecte din document: acelea sunt produsele. */
function findLargestArray(node: unknown, best: Obj[] = []): Obj[] {
  if (Array.isArray(node)) {
    const objs = node.filter(isObj);
    if (objs.length > best.length) best = objs;
    for (const item of node) best = findLargestArray(item, best);
  } else if (isObj(node)) {
    for (const v of Object.values(node)) best = findLargestArray(v, best);
  }
  return best;
}

function pickField(items: Obj[], explicit: string | undefined, candidates: string[]): string | undefined {
  if (explicit) return explicit;
  const keys = new Set<string>();
  for (const item of items.slice(0, 20)) Object.keys(item).forEach((k) => keys.add(k));
  const lower = new Map([...keys].map((k) => [k.toLowerCase(), k]));
  for (const c of candidates) {
    const hit = lower.get(c);
    if (hit) return hit;
  }
  return undefined;
}

export interface ParseResult {
  products: Product[];
  fieldsUsed: { sku: string; stock: string; name?: string; price?: string };
  skippedNoSku: number;
}

export function parseFeed(xml: string, config: Pick<Config, 'itemPath' | 'fields' | 'clientFeedExtraFields'>): ParseResult {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseTagValue: false, // păstrăm textul: codurile cu zerouri în față nu se pierd
    trimValues: true,
  });
  const doc = parser.parse(xml);

  let items: Obj[];
  if (config.itemPath) {
    const node = getPath(doc, config.itemPath);
    items = (Array.isArray(node) ? node : node === undefined ? [] : [node]).filter(isObj);
  } else {
    items = findLargestArray(doc);
  }
  if (items.length === 0) {
    throw new Error('Nu am găsit produse în feed. Setează SOURCE_ITEM_PATH (ex. "products.product").');
  }

  const skuField = pickField(items, config.fields.sku, SKU_CANDIDATES);
  const stockField = pickField(items, config.fields.stock, STOCK_CANDIDATES);
  const nameField = pickField(items, config.fields.name, NAME_CANDIDATES);
  const priceField = pickField(items, config.fields.price, PRICE_CANDIDATES);
  const sample = Object.keys(items[0]).join(', ');
  if (!skuField) throw new Error(`Nu am identificat câmpul de cod produs. Setează FIELD_SKU. Câmpuri găsite: ${sample}`);
  if (!stockField) throw new Error(`Nu am identificat câmpul de stoc. Setează FIELD_STOCK. Câmpuri găsite: ${sample}`);

  const products: Product[] = [];
  const seen = new Set<string>();
  let skippedNoSku = 0;
  for (const item of items) {
    const sku = text(item[skuField]);
    if (!sku) {
      skippedNoSku++;
      continue;
    }
    if (seen.has(sku)) continue; // primul câștigă la coduri duplicate
    seen.add(sku);
    const extra: Record<string, string> = {};
    for (const f of config.clientFeedExtraFields) {
      const v = text(item[f]);
      if (v !== undefined) extra[f] = v;
    }
    const stock = parseNumber(text(item[stockField]));
    products.push({
      sku,
      name: (nameField && text(item[nameField])) || '',
      stock: stock === null ? null : Math.max(0, Math.floor(stock)),
      price: priceField ? parseNumber(text(item[priceField])) : null,
      extra,
    });
  }

  return {
    products,
    fieldsUsed: { sku: skuField, stock: stockField, name: nameField, price: priceField },
    skippedNoSku,
  };
}

export async function fetchSource(config: Config): Promise<string> {
  const headers: Record<string, string> = { Accept: 'application/xml, text/xml, */*' };
  if (config.sourceAuth) headers.Authorization = config.sourceAuth;
  const res = await fetch(config.sourceUrl, { headers });
  if (!res.ok) throw new Error(`Feed-ul sursă a răspuns cu HTTP ${res.status}`);
  return res.text();
}
