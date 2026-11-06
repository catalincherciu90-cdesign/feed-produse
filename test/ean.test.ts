import { describe, expect, it } from 'vitest';
import { loadConfig, type Env } from '../src/config';
import { isValidGtin } from '../src/ean';
import { parseFeed } from '../src/source';
import { buildSnapshot } from '../src/sync';

describe('isValidGtin', () => {
  it('acceptă coduri corecte', () => {
    expect(isValidGtin('5949097736322')).toBe(true); // EAN-13 din feed
    expect(isValidGtin('8681682048775')).toBe(true);
    expect(isValidGtin('96385074')).toBe(true); // EAN-8
    expect(isValidGtin('036000291452')).toBe(true); // UPC-A
    expect(isValidGtin(' 5949097736322 ')).toBe(true);
  });
  it('respinge coduri greșite', () => {
    expect(isValidGtin('5944016071795')).toBe(false); // cifra de control greșită (din feed)
    expect(isValidGtin('67018336')).toBe(false);
    expect(isValidGtin('594909773632')).toBe(false); // 12 cifre, control greșit
    expect(isValidGtin('59490977363AB')).toBe(false);
    expect(isValidGtin('12345')).toBe(false);
    expect(isValidGtin('')).toBe(false);
    expect(isValidGtin(undefined)).toBe(false);
  });
});

describe('EAN în lista din panou', () => {
  it('pune EAN-ul și validitatea în rând', () => {
    const xml = `<products>
<product><Product_Code>A</Product_Code><Stock>5</Stock><EAN>5949097736322</EAN></product>
<product><Product_Code>B</Product_Code><Stock>5</Stock><EAN>5944016071795</EAN></product>
<product><Product_Code>C</Product_Code><Stock>5</Stock><EAN></EAN></product>
</products>`;
    const r = parseFeed(xml, loadConfig({ SOURCE_URL: 'x', SOURCE_ITEM_PATH: 'products.product' } as unknown as Env));
    expect(r.fieldsUsed.ean).toBe('EAN');
    const snap = buildSnapshot(r.products, { availableMinStock: 10, celMinStock: 10, celStockBuffer: 0, celMaxStock: 0, celBlockZeroPrice: false },
      { minStock: 10, buffer: 0, requirePrice: false }, {}, 'now');
    expect(snap.eanField).toBe(true);
    expect(snap.rows.map((x) => x.slice(11))).toEqual([['5949097736322', 1], ['5944016071795', 0], ['', 0]]);
  });
});
