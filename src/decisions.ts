/**
 * Decizia finală pentru fiecare produs: ce stoc primește CEL și dacă apare disponibil la clienți.
 * Un singur loc pentru reguli, folosit de feed-ul CEL, feed-ul clienților, API-ul CEL și panoul de admin.
 */
import type { ProductOverride } from './rules';

export interface ProductLike {
  sku: string;
  stock: number | null;
  price: number | null;
}

export interface CelStockRules {
  minStock: number;
  buffer: number;
  /** Stocul maxim trimis pe CEL; 0 sau lipsă = fără limită. */
  maxStock?: number;
  /** true = produsele fără preț valid (lipsă sau 0) primesc stoc 0, ca să nu se vândă la 0 lei. */
  requirePrice: boolean;
  overrides?: Record<string, ProductOverride>;
}

/** Motivul pentru care un produs e (sau nu e) comandabil. */
export type Reason = 'ok' | 'fara-stoc' | 'prag' | 'pret' | 'blocat' | 'exceptie';

export function hasValidPrice(p: ProductLike): boolean {
  return p.price !== null && p.price > 0;
}

export function celStock(stock: number | null, minStock: number, buffer: number): number {
  if (stock === null) return 0; // stoc necunoscut => nu poate fi comandat
  return stock < minStock ? 0 : Math.max(0, stock - buffer);
}

/** Aplică limita superioară (0 = fără limită). */
export function capStock(stock: number, maxStock: number | undefined): number {
  return maxStock && maxStock > 0 ? Math.min(stock, maxStock) : stock;
}

export function celDecision(p: ProductLike, rules: CelStockRules): { stock: number; reason: Reason } {
  const ov = rules.overrides?.[p.sku]?.cel;
  if (ov === 'block') return { stock: 0, reason: 'blocat' };
  if (rules.requirePrice && !hasValidPrice(p)) return { stock: 0, reason: 'pret' };
  if (p.stock === null || p.stock <= 0) return { stock: 0, reason: 'fara-stoc' };
  if (ov === 'ignore-threshold') {
    const stock = capStock(Math.max(0, p.stock - rules.buffer), rules.maxStock);
    return { stock, reason: stock > 0 ? 'exceptie' : 'fara-stoc' };
  }
  const stock = capStock(celStock(p.stock, rules.minStock, rules.buffer), rules.maxStock);
  if (stock > 0) return { stock, reason: 'ok' };
  return { stock: 0, reason: p.stock < rules.minStock ? 'prag' : 'fara-stoc' };
}

/** Stocul trimis pe CEL pentru un produs, după toate regulile. */
export function celStockFor(p: ProductLike, rules: CelStockRules): number {
  return celDecision(p, rules).stock;
}

export function clientDecision(
  p: ProductLike,
  minStock: number,
  overrides?: Record<string, ProductOverride>,
): { available: boolean; reason: Reason } {
  const ov = overrides?.[p.sku]?.client;
  if (ov === 'block') return { available: false, reason: 'blocat' };
  if (p.stock === null || p.stock <= 0) return { available: false, reason: 'fara-stoc' };
  if (ov === 'ignore-threshold') return { available: true, reason: 'exceptie' };
  if (p.stock < minStock) return { available: false, reason: 'prag' };
  return { available: true, reason: 'ok' };
}
