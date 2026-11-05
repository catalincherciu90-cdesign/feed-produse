import type { Product } from './source';

export function isAvailable(stock: number | null, minStock: number): boolean {
  return stock !== null && stock >= minStock;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    // caractere de control invalide în XML 1.0
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

function tagName(field: string): string {
  const t = field.replace(/[^A-Za-z0-9_.-]/g, '_');
  return /^[A-Za-z_]/.test(t) ? t : `_${t}`;
}

/**
 * Feed pentru clienți. Nu expune stocul real, doar dacă produsul se poate cumpăra.
 */
export function buildClientFeed(products: Product[], minStock: number, generatedAt: string): string {
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<produse generat="${esc(generatedAt)}" total="${products.length}">`,
  ];
  for (const p of products) {
    const ok = isAvailable(p.stock, minStock);
    lines.push('  <produs>');
    lines.push(`    <cod>${esc(p.sku)}</cod>`);
    if (p.name) lines.push(`    <nume>${esc(p.name)}</nume>`);
    for (const [k, v] of Object.entries(p.extra)) {
      const t = tagName(k);
      lines.push(`    <${t}>${esc(v)}</${t}>`);
    }
    lines.push(`    <disponibil>${ok ? 'da' : 'nu'}</disponibil>`);
    lines.push(`    <status>${ok ? 'in stoc' : 'indisponibil momentan'}</status>`);
    lines.push('  </produs>');
  }
  lines.push('</produse>');
  return lines.join('\n') + '\n';
}
