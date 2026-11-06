import { describe, expect, it } from 'vitest';
import { bigImageUrl } from '../src/celFeed';
import { buildFacebookFeed, plainText } from '../src/facebookFeed';
import type { Product } from '../src/source';

const base = { extra: {}, url: 'https://s.ro/p', image: 'https://s.ro/u/1_LIST.jpg', brand: 'Braytron' };
const P = (o: Partial<Product>): Product => ({ sku: 'A', name: 'Bec LED', stock: 50, price: 10.89, ...base, ...o } as Product);
const opts = { minStock: 10, currency: 'RON', shopName: 'SpotVision Electric', shopUrl: 'https://s.ro', bigImage: bigImageUrl };

describe('catalog Facebook', () => {
  it('generează câmpurile cerute de Meta', () => {
    const r = buildFacebookFeed([P({ ean: '5949097736322', gallery: ['https://s.ro/g/1.jpg', 'https://s.ro/g/2.jpg'], category: 'Iluminat interior/Spoturi LED', description: '<p>Bec &amp; dulie</p>' })], opts);
    expect(r.xml).toContain('xmlns:g="http://base.google.com/ns/1.0"');
    for (const s of [
      '<g:id>A</g:id>', '<g:title>Bec LED</g:title>', '<g:description>Bec &amp; dulie</g:description>',
      '<g:link>https://s.ro/p</g:link>', '<g:image_link>https://s.ro/u/1_big.jpg</g:image_link>',
      '<g:additional_image_link>https://s.ro/g/2.jpg</g:additional_image_link>',
      '<g:availability>in stock</g:availability>', '<g:condition>new</g:condition>',
      '<g:price>10.89 RON</g:price>', '<g:brand>Braytron</g:brand>', '<g:gtin>5949097736322</g:gtin>',
      '<g:product_type>Iluminat interior &gt; Spoturi LED</g:product_type>',
    ]) expect(r.xml).toContain(s);
    expect(r).toMatchObject({ included: 1, inStock: 1 });
  });

  it('sub prag apare „out of stock”; fără preț, link sau poză nu intră deloc', () => {
    const r = buildFacebookFeed([
      P({ sku: 'A', stock: 5 }), P({ sku: 'B', price: 0 }), P({ sku: 'C', url: undefined }), P({ sku: 'D', image: undefined }),
    ], opts);
    expect(r.included).toBe(1);
    expect(r.xml).toContain('<g:availability>out of stock</g:availability>');
    expect(r.skipped).toEqual({ noPrice: 1, noLink: 1, noImage: 1 });
  });

  it('nu trimite EAN invalid sau duplicat; folosește intro sau numele când lipsește descrierea', () => {
    const r = buildFacebookFeed([
      P({ sku: 'A', ean: '5944016071795', intro: 'Text scurt' }),
      P({ sku: 'B', ean: '5949097736322' }), P({ sku: 'C', ean: '5949097736322' }),
    ], opts);
    expect(r.xml).not.toContain('<g:gtin>');
    expect(r.xml).toContain('<g:description>Text scurt</g:description>');
    expect(r.xml).toContain('<g:description>Bec LED</g:description>');
  });

  it('excepția „blocat” la clienți face produsul indisponibil și pe Facebook', () => {
    const r = buildFacebookFeed([P({ sku: 'A' })], { ...opts, overrides: { A: { client: 'block' } } });
    expect(r.xml).toContain('<g:availability>out of stock</g:availability>');
  });

  it('plainText curăță HTML-ul', () => {
    expect(plainText('<p>Priză&nbsp;IP44</p><p>16A &#8211; negru</p>')).toBe('Priză IP44\n16A – negru');
    expect(plainText(undefined)).toBe('');
  });
});
