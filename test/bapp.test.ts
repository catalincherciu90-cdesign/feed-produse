import { describe, expect, it } from 'vitest';
import { buildImportTable, buildTechFeedXml, buildXlsx, defaultMapping, DEFAULT_RULES, teamshareTag, translateValue, validateFeedCodes, validateMapping } from '../src/bapp';
import { parseBapp } from '../src/bappParse';
import { TEAMSHARE_COLUMNS } from '../src/teamshareColumns';

const XML = `<response><products>
<product><id>1</id><name>Aplica</name><code>BH07-04101</code><code_ean>5949097727429</code_ean>
<photos><photo><url>https://cdn.x/2.webp</url><order>2</order></photo><photo><url>https://cdn.x/1.webp</url><order>1</order></photo></photos>
<sections><section><categories><category><attributes>
<attribute><slug>body_color</slug><title>Culoarea corpului</title><value>Black</value></attribute>
<attribute><slug>warranty</slug><title>Garanție</title><value>2 Years</value></attribute>
<attribute><slug>wattage</slug><title>Putere</title><value>16</value></attribute>
<attribute><slug>material</slug><title>Material</title><value>Aluminium-PC</value></attribute>
<attribute><slug>icons</slug><title>Icons</title><value>26,68</value></attribute>
<attribute><slug>class</slug><title>Clasă</title><value>CLASS II</value></attribute>
<attribute><slug>dimmable</slug><title>Dimabil</title><value>Not-Dimmable</value></attribute>
</attributes></category></categories></section></sections></product>
<product><id>2</id><name>Bec</name><code>BA13-60920</code><code_ean>5949097727597</code_ean><photos/>
<sections><section><categories><category><attributes>
<attribute><slug>ip</slug><title>IP</title><value>IP20 &gt; IP10</value></attribute>
</attributes></category></categories></section></sections></product>
</products></response>`;

const ours = [{ sku: 'BR-BH07-04101' }, { sku: 'ALT-COD', ean: '5949097727597' }, { sku: 'BR-NIMIC' }];
const data = parseBapp(XML, ours, { codePrefix: 'BR-', source: 'bapp.ro', generatedAt: '2026-11-09T10:00:00Z' });

describe('feed producător (bapp.ro)', () => {
  it('citește produse, poze în ordine, atribute și leagă după cod sau EAN', () => {
    expect(Object.keys(data.products)).toEqual(['BH07-04101', 'BA13-60920']);
    expect(data.products['BH07-04101'].p).toEqual(['https://cdn.x/1.webp', 'https://cdn.x/2.webp']);
    expect(data.products['BA13-60920'].a.ip).toBe('IP20 > IP10');
    expect(data.index).toEqual({ 'BR-BH07-04101': 'BH07-04101', 'ALT-COD': 'BA13-60920' });
    expect(data.matched).toEqual({ byCode: 1, byEan: 1 });
    expect(data.attributes.body_color).toEqual({ title: 'Culoarea corpului', count: 1 });
  });

  it('traduce valorile întregi și pe cuvinte, fără să strice alte cuvinte', () => {
    const t = defaultMapping().translations;
    expect(translateValue('Black', t)).toBe('Negru');
    expect(translateValue('Black-Golden', t)).toBe('Negru-Auriu');
    expect(translateValue('2 Years', t)).toBe('2 ani');
    expect(translateValue('1 Year', t)).toBe('1 an');
    expect(translateValue('Not-Dimmable', t)).toBe('Nedimabil');
    expect(translateValue('Dimmable', t)).toBe('Dimabil');
    expect(translateValue('CLASS II', t)).toBe('Clasa II');
    expect(translateValue('Aluminium-PC', t)).toBe('Aluminiu-PC');
    expect(translateValue('Blackout', t)).toBe('Blackout'); // nu înlocuiește în mijlocul cuvântului
    expect(translateValue('IP65', t)).toBe('IP65');
  });

  it('construiește tabelul de import: codul tău, coloane din șablon, poze, unități', () => {
    const t = buildImportTable(['BR-BH07-04101', 'BA13-60920', 'NU-EXISTA', 'BR-BH07-04101'], data, defaultMapping(), translateValue, TEAMSHARE_COLUMNS);
    expect(t.missing).toEqual(['NU-EXISTA']);
    expect(t.perProduct.map((p) => p.code)).toEqual(['BR-BH07-04101', 'ALT-COD']); // codul producătorului devine codul tău
    const h = t.rows[0];
    expect(h[0]).toBe('ProductCode');
    for (const c of h) expect(TEAMSHARE_COLUMNS).toContain(c);
    const row = Object.fromEntries(h.map((k, i) => [k, t.rows[1][i]]));
    expect(row).toMatchObject({
      'Culoarea corpului: - P39493': 'Negru',
      'Garanție: - P39488': '2 ani',
      'Putere: - P39305': '16 w',
      'Material: - P39441': 'Aluminiu-PC',
      'Clasă: - P39468': 'Clasa II',
      'Dimabil: - P39422': 'Nedimabil',
      'ProductImage - P39360': 'https://cdn.x/1.webp',
      'AddImages - P39379': 'https://cdn.x/2.webp',
    });
    expect(h).not.toContain('Icons'); // icons nu e mapat
    // al doilea produs nu are poze: celula rămâne goală
    expect(t.rows[2][h.indexOf('ProductImage - P39360')]).toBe('');
  });

  it('două coduri ale tale legate de același produs al producătorului rămân separate', () => {
    const d2 = { ...data, index: { ...data.index, 'BR-DUBLU': 'BH07-04101' } };
    const t = buildImportTable(['BR-BH07-04101', 'BR-DUBLU', 'BH07-04101'], d2, defaultMapping(), translateValue, TEAMSHARE_COLUMNS);
    expect(t.perProduct.map((p) => p.code).sort()).toEqual(['BR-BH07-04101', 'BR-DUBLU']);
  });

  it('fără traducere, valorile rămân ca la producător', () => {
    const m = { ...defaultMapping(), translate: false };
    const t = buildImportTable(['BR-BH07-04101'], data, m, translateValue, TEAMSHARE_COLUMNS);
    expect(t.rows[1]).toContain('Black');
  });

  it('generează un .xlsx (arhivă ZIP) cu foaia „Content” și textele escapate', () => {
    const x = buildXlsx([['ProductCode', 'Nume'], ['A&B', '<1>']], 'Content');
    expect(String.fromCharCode(x[0], x[1])).toBe('PK');
    const text = new TextDecoder().decode(x);
    expect(text).toContain('<sheet name="Content"');
    expect(text).toContain('A&amp;B');
    expect(text).toContain('&lt;1&gt;');
  });

  it('validează maparea: coloane doar din șablon', () => {
    expect(validateMapping(defaultMapping(), TEAMSHARE_COLUMNS).rules.model.column).toBe(DEFAULT_RULES.model.column);
    expect(() => validateMapping({ ...defaultMapping(), rules: { ip: { column: 'Inventată' } } }, TEAMSHARE_COLUMNS)).toThrow(/nu există/);
    expect(() => validateMapping({ ...defaultMapping(), rules: { 'a b': { column: '' } } }, TEAMSHARE_COLUMNS)).toThrow(/invalid/);
    expect(() => validateMapping({ ...defaultMapping(), imageSeparator: '' }, TEAMSHARE_COLUMNS)).toThrow(/Separatorul/);
  });

  it('toate coloanele din maparea implicită există în șablon', () => {
    for (const [slug, r] of Object.entries(DEFAULT_RULES)) {
      if (r.column) expect(TEAMSHARE_COLUMNS, slug).toContain(r.column);
    }
  });
});

describe('feed /date-tehnice.xml', () => {
  it('numele tag-urilor urmează convenția exportului Teamshare și păstrează ID-ul proprietății', () => {
    expect(teamshareTag('ProductCode')).toBe('Product_Code');
    expect(teamshareTag('Culoarea corpului: - P39493')).toBe('Culoarea_corpului_P39493');
    expect(teamshareTag('Bucăți pe cutie (PCS/CTN) - P39399')).toBe('Bucati_pe_cutie_PCS_CTN_P39399');
    expect(teamshareTag('ProductImage - P39360')).toBe('ProductImage_P39360');
    expect(teamshareTag(' - P39453')).toBe('P39453');
    expect(teamshareTag('Material: - P39441')).not.toBe(teamshareTag('Material: - P39391'));
  });

  it('generează XML valid, cu CDATA și fără celule goale', () => {
    const t = buildImportTable(['BR-BH07-04101', 'ALT-COD'], data, defaultMapping(), translateValue, TEAMSHARE_COLUMNS);
    const xml = buildTechFeedXml(t.rows);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<products>')).toBe(true);
    expect(xml).toContain('<Product_Code><![CDATA[BR-BH07-04101]]></Product_Code>');
    expect(xml).toContain('<Culoarea_corpului_P39493><![CDATA[Negru]]></Culoarea_corpului_P39493>');
    expect(xml).toContain('<ProductImage_P39360><![CDATA[https://cdn.x/1.webp]]></ProductImage_P39360>');
    expect(xml).toContain('<IP_Grad_de_protectie_P39333><![CDATA[IP20 > IP10]]></IP_Grad_de_protectie_P39333>');
    expect(xml.match(/<product>/g)).toHaveLength(2);
    expect(xml).not.toMatch(/<ProductImage_P39360><!\[CDATA\[\]\]>/); // al doilea produs nu are poze: tag-ul lipsește
  });

  it('validează lista de coduri', () => {
    expect(validateFeedCodes({ codes: [' A ', 'B', 'A', ''] })).toEqual(['A', 'B']);
    expect(() => validateFeedCodes({ codes: 'A' })).toThrow();
    expect(() => validateFeedCodes({ codes: ['x'.repeat(101)] })).toThrow(/lung/);
  });
});
