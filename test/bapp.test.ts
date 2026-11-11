import { describe, expect, it } from 'vitest';
import { buildImportTable, buildTechFeedXml, buildXlsx, buildZip, defaultMapping, DEFAULT_RULES, teamshareTag, translateValue, validateFeedCodes, validateMapping, validateProductCategories } from '../src/bapp';
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
  it('citește linkul fișei tehnice PDF și păstrează începutul comun o singură dată', () => {
    const files = (code: string) =>
      `<section><categories/><files><file><filename>${code}_RO.pdf</filename><url>https://bapp.ro/product-datasheet/abc123/${code}_RO.pdf</url></file></files></section>` +
      `<section><categories/><files><file><name>${code}.rar</name><url>https://cdn.braytron.center/3dfiles/${code}.rar</url></file></files></section>`;
    const x = `<response><products>
<product><code>A1</code><photos/><sections>${files('A1')}</sections></product>
<product><code>A2</code><photos/><sections>${files('A2')}</sections></product>
<product><code>A3</code><photos/><sections/></product>
</products></response>`;
    const d = parseBapp(x, [], { codePrefix: 'BR-', source: 's', generatedAt: 'x' });
    expect(d.datasheetBase).toBe('https://bapp.ro/product-datasheet/abc123/');
    expect(d.products.A1.d).toBe('A1_RO.pdf');
    expect(d.products.A2.d).toBe('A2_RO.pdf');
    expect(d.products.A3.d).toBeUndefined();
    // produsele tale legate care au deja fișiere pe site
    const d2 = parseBapp(x, [{ sku: 'BR-A1', hasFile: true }, { sku: 'BR-A2', hasFile: false }, { sku: 'BR-NIMIC', hasFile: true }], { codePrefix: 'BR-', source: 's', generatedAt: 'x' });
    expect(d2.withFiles).toEqual({ 'BR-A1': 1 });
  });

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

  it('ține minte ce cod din listă a dus la fiecare produs (pentru „Scoate din feed”)', () => {
    // BA13-60920 e codul producătorului; în feed apare ca ALT-COD, codul tău
    const t = buildImportTable(['BA13-60920', 'BR-BH07-04101', 'BH07-04101', 'NU-EXISTA'], data, defaultMapping(), translateValue, TEAMSHARE_COLUMNS);
    expect(t.sources['ALT-COD']).toEqual(['BA13-60920']);
    expect(t.sources['BR-BH07-04101'].sort()).toEqual(['BH07-04101', 'BR-BH07-04101']);
    expect(t.sources['NU-EXISTA']).toEqual(['NU-EXISTA']);
  });

  it('produs nou scris cu codul producătorului: primește prefixul BR-, iar codul Braytron rămâne la furnizor', () => {
    const d = { ...data, index: { 'BR-BH07-04101': 'BH07-04101' } }; // BA13-60920 nu e pe site
    for (const typed of ['BA13-60920', 'BR-BA13-60920']) {
      const t = buildImportTable([typed], d, defaultMapping(), translateValue, TEAMSHARE_COLUMNS);
      expect(t.perProduct.map((p) => [p.code, p.supplierCode, p.existing])).toEqual([['BR-BA13-60920', 'BA13-60920', false]]);
      expect(t.rows[1][0]).toBe('BR-BA13-60920');
    }
    // amândouă scrierile în aceeași listă dau un singur produs, iar ambele pot fi scoase din listă
    const t = buildImportTable(['BA13-60920', 'BR-BA13-60920'], d, defaultMapping(), translateValue, TEAMSHARE_COLUMNS);
    expect(t.perProduct).toHaveLength(1);
    expect(t.sources['BR-BA13-60920'].sort()).toEqual(['BA13-60920', 'BR-BA13-60920']);
    // fără prefix în Mapare, codul rămâne cum a fost scris
    const t2 = buildImportTable(['BA13-60920'], d, { ...defaultMapping(), codePrefix: '' }, translateValue, TEAMSHARE_COLUMNS);
    expect(t2.perProduct[0].code).toBe('BA13-60920');
  });

  it('categoria aleasă înainte pe codul producătorului se păstrează după prefixare', () => {
    const d = { ...data, index: { 'BR-BH07-04101': 'BH07-04101' } };
    const m = { ...defaultMapping(), productCategories: { 'BA13-60920': 'Categoria mea' } };
    const t = buildImportTable(['BA13-60920'], d, m, translateValue, TEAMSHARE_COLUMNS);
    expect(t.perProduct[0]).toMatchObject({ code: 'BR-BA13-60920', category: 'Categoria mea' });
  });

  it('arhiva .zip cu poze și fișă se poate deschide (verificat cu unzip)', async () => {
    const { execFileSync } = await import('node:child_process');
    const { mkdtempSync, writeFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');
    const img = new Uint8Array(256).map((_, i) => i);
    const zip = buildZip([
      { name: 'BR-X-1.webp', data: img },
      { name: 'BR-X-fisa-tehnica.pdf', data: new TextEncoder().encode('%PDF-1.4 test') },
    ]);
    const dir = mkdtempSync(join(tmpdir(), 'zip-'));
    const file = join(dir, 'a.zip');
    writeFileSync(file, zip);
    const out = execFileSync('unzip', ['-t', file]).toString();
    expect(out).toMatch(/No errors detected/);
    expect(out).toContain('BR-X-1.webp');
    expect(out).toContain('BR-X-fisa-tehnica.pdf');
  });

  it('fișele tehnice nu intră în feed deocamdată (oprite), în niciun mod', () => {
    const d = {
      ...data,
      products: { ...data.products, 'BA13-60920': { ...data.products['BA13-60920'], d: 'BA13-60920_RO.pdf' } },
      index: { 'BR-BA13-60920': 'BA13-60920' },
    };
    for (const datasheetMode of ['missing', 'all', 'off']) {
      const t = buildImportTable(['BR-BA13-60920'], d, { ...defaultMapping(), datasheetMode }, translateValue, TEAMSHARE_COLUMNS);
      expect(t.rows[0]).not.toContain('File');
      expect(buildTechFeedXml(t.rows)).not.toContain('<File>');
    }
  });

  it('validează setările fișei', () => {
    const m = validateMapping({ ...defaultMapping(), datasheetMode: 'all', datasheetUrl: 'https://feed.exemplu.ro/fise/' }, TEAMSHARE_COLUMNS);
    expect(m).toMatchObject({ datasheetMode: 'all', datasheetUrl: 'https://feed.exemplu.ro/fise/' });
    expect(validateMapping({ ...defaultMapping(), datasheetMode: undefined, datasheetUrl: undefined }, TEAMSHARE_COLUMNS)).toMatchObject({ datasheetMode: 'missing', datasheetUrl: 'https://feed-produse.catalincherciu90.workers.dev/fise/' });
    // vechea valoare implicită (prin găzduirea cu anti-bot) trece automat pe cea directă
    expect(validateMapping({ ...defaultMapping(), datasheetUrl: 'https://feed.spotvisionelectric.ro/fise/' }, TEAMSHARE_COLUMNS).datasheetUrl).toBe('https://feed-produse.catalincherciu90.workers.dev/fise/');
    expect(() => validateMapping({ ...defaultMapping(), datasheetMode: 'x' }, TEAMSHARE_COLUMNS)).toThrow();
    expect(() => validateMapping({ ...defaultMapping(), datasheetUrl: 'http://fara-https/' }, TEAMSHARE_COLUMNS)).toThrow();
    expect(() => validateMapping({ ...defaultMapping(), datasheetUrl: 'https://fara-slash-final.ro/fise' }, TEAMSHARE_COLUMNS)).toThrow();
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
    const xml = buildTechFeedXml(t.rows, { headerRow: false });
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<products>')).toBe(true);
    expect(xml).toContain('<Product_Code><![CDATA[BR-BH07-04101]]></Product_Code>');
    expect(xml).toContain('<Culoarea_corpului_P39493><![CDATA[Negru]]></Culoarea_corpului_P39493>');
    expect(xml).toContain('<ProductImage_P39360><![CDATA[https://cdn.x/1.webp]]></ProductImage_P39360>');
    expect(xml).toContain('<IP_Grad_de_protectie_P39333><![CDATA[IP20 > IP10]]></IP_Grad_de_protectie_P39333>');
    expect(xml.match(/<product>/g)).toHaveLength(2);
    expect(xml).not.toMatch(/<ProductImage_P39360><!\[CDATA\[\]\]>/); // al doilea produs nu are poze: tag-ul lipsește
  });

  it('primul <product> e rândul de titluri cu numele coloanelor din șablon', () => {
    const t = buildImportTable(['BR-BH07-04101'], data, defaultMapping(), translateValue, TEAMSHARE_COLUMNS);
    const xml = buildTechFeedXml(t.rows);
    expect(xml.match(/<product>/g)).toHaveLength(2);
    const first = xml.slice(xml.indexOf('<product>'), xml.indexOf('</product>'));
    expect(first).toContain('<Product_Code><![CDATA[ProductCode]]></Product_Code>');
    expect(first).toContain('<Culoarea_corpului_P39493><![CDATA[Culoarea corpului: - P39493]]></Culoarea_corpului_P39493>');
  });

  it('fără produse, feed-ul e gol (fără rândul de titluri singur)', () => {
    const xml = buildTechFeedXml(buildImportTable([], data, defaultMapping(), translateValue, TEAMSHARE_COLUMNS).rows);
    expect(xml).not.toContain('<product>');
    expect(xml).toContain('<products>');
  });

  it('validează lista de coduri', () => {
    expect(validateFeedCodes({ codes: [' A ', 'B', 'A', ''] })).toEqual(['A', 'B']);
    expect(() => validateFeedCodes({ codes: 'A' })).toThrow();
    expect(() => validateFeedCodes({ codes: ['x'.repeat(101)] })).toThrow(/lung/);
  });
});

describe('categorii', () => {
  const X = (code: string, main: string, sub: string) => `<product><code>${code}</code><photos/><sections><section><categories><category><attributes>
<attribute><slug>main_family</slug><title>F</title><value>${main}</value></attribute>
<attribute><slug>sub_family</slug><title>S</title><value>${sub}</value></attribute>
</attributes></category></categories></section></sections></product>`;
  const xml = `<response><products>${X('A1', 'Electrice', 'MCB')}${X('A2', 'Electrice', 'MCB')}${X('A3', 'Electrice', 'MCB')}${X('N1', 'Electrice', 'MCB')}${X('N2', 'Altele', 'Nou')}</products></response>`;
  const ours = [
    { sku: 'BR-A1', category: 'Sigurante Automate' },
    { sku: 'BR-A2', category: 'Sigurante Automate' },
    { sku: 'BR-A3', category: 'Electrice/Altele' },
  ];
  const d = parseBapp(xml, ours, { codePrefix: 'BR-', source: 's', generatedAt: 'now' });

  it('învață categoria majoritară din produsele legate', () => {
    expect(d.categories!['Electrice / MCB']).toMatchObject({ category: 'Sigurante Automate', share: 66.7, linked: 3, total: 4, source: 'site' });
    expect(d.categories!['Altele / Nou']).toMatchObject({ category: '', share: 0, linked: 0, total: 1 });
    expect(d.siteCategories).toEqual(['Electrice/Altele', 'Sigurante Automate']);
  });

  it('implicit: categoria doar la produsele noi; existentele o păstrează', () => {
    const t = buildImportTable(['BR-A3', 'N1', 'N2'], d, defaultMapping(), translateValue, TEAMSHARE_COLUMNS);
    const h = t.rows[0];
    expect(h).toContain('Category');
    const cat = (code: string) => t.rows.find((r) => r[0] === code || r[0] === 'BR-' + code)![h.indexOf('Category')];
    expect(cat('BR-A3')).toBe(''); // existent: nu se schimbă
    expect(cat('N1')).toBe('Sigurante Automate'); // nou: categoria învățată
    expect(cat('N2')).toBe(''); // nou, fără corespondență
    expect(t.perProduct.find((p) => p.code === 'BR-N1')).toMatchObject({ existing: false, family: 'Electrice / MCB' });
  });

  it('corecturile tale au prioritate; modurile all și off', () => {
    const m = { ...defaultMapping(), categories: { 'Altele / Nou': 'Diverse' } };
    const t = buildImportTable(['N2'], d, m, translateValue, TEAMSHARE_COLUMNS);
    expect(t.rows[1][t.rows[0].indexOf('Category')]).toBe('Diverse');
    const all = buildImportTable(['BR-A3'], d, { ...defaultMapping(), categoryMode: 'all' }, translateValue, TEAMSHARE_COLUMNS);
    expect(all.rows[1][all.rows[0].indexOf('Category')]).toBe('Sigurante Automate');
    const off = buildImportTable(['N1'], d, { ...defaultMapping(), categoryMode: 'off' }, translateValue, TEAMSHARE_COLUMNS);
    expect(off.rows[0]).not.toContain('Category');
  });

  it('validează modul și categoriile', () => {
    expect(validateMapping({ ...defaultMapping(), categories: { 'A / B': ' X ' } }, TEAMSHARE_COLUMNS).categories).toEqual({ 'A / B': 'X' });
    expect(() => validateMapping({ ...defaultMapping(), categoryMode: 'mereu' }, TEAMSHARE_COLUMNS)).toThrow(/categoryMode/);
    expect(validateMapping({ rules: {}, imageSeparator: '#' }, TEAMSHARE_COLUMNS).categoryMode).toBe('new'); // mapare salvată înainte de categorii
  });
});

describe('categoria aleasă pe produs', () => {
  const X = (code: string) => `<product><code>${code}</code><photos/><sections><section><categories><category><attributes>
<attribute><slug>main_family</slug><title>F</title><value>Electrice</value></attribute>
<attribute><slug>sub_family</slug><title>S</title><value>MCB</value></attribute>
</attributes></category></categories></section></sections></product>`;
  const d = parseBapp(`<response><products>${X('A1')}${X('N1')}${X('N2')}</products></response>`,
    [{ sku: 'BR-A1', category: 'Sigurante Automate' }], { codePrefix: 'BR-', source: 's', generatedAt: 'now' });
  const cat = (t: { rows: string[][] }, code: string) => t.rows.find((r) => r[0] === code || r[0] === 'BR-' + code)![t.rows[0].indexOf('Category')];

  it('are prioritate față de categoria propusă și se aplică și la produse existente', () => {
    const m = { ...defaultMapping(), productCategories: { N1: 'Electrice/Siguranțe noi', 'BR-A1': 'Mutat aici' } };
    const t = buildImportTable(['BR-A1', 'N1', 'N2'], d, m, translateValue, TEAMSHARE_COLUMNS);
    expect(cat(t, 'N1')).toBe('Electrice/Siguranțe noi');
    expect(cat(t, 'N2')).toBe('Sigurante Automate'); // propusă
    expect(cat(t, 'BR-A1')).toBe('Mutat aici'); // alegere explicită
  });

  it('modul „off” nu exportă nicio categorie, nici cele alese', () => {
    const m = { ...defaultMapping(), categoryMode: 'off' as const, productCategories: { N1: 'X' } };
    expect(buildImportTable(['N1'], d, m, translateValue, TEAMSHARE_COLUMNS).rows[0]).not.toContain('Category');
  });

  it('validează lista', () => {
    expect(validateProductCategories({ categories: { ' N1 ': ' X ', N2: '' } })).toEqual({ N1: 'X' });
    expect(() => validateProductCategories({ categories: [] })).toThrow();
    expect(() => validateProductCategories({ categories: { N1: 5 } })).toThrow(/text/);
  });
});

describe('producător (BrandName)', () => {
  it('pune Braytron la toate produsele; se poate schimba sau opri', () => {
    const t = buildImportTable(['BR-BH07-04101', 'ALT-COD'], data, defaultMapping(), translateValue, TEAMSHARE_COLUMNS);
    const i = t.rows[0].indexOf('BrandName');
    expect(i).toBe(t.rows[0].indexOf('BrandName')); // coloana există în șablon
    expect(TEAMSHARE_COLUMNS).toContain('BrandName');
    expect(t.rows.slice(1).map((r) => r[i])).toEqual(['Braytron', 'Braytron']);
    const other = buildImportTable(['ALT-COD'], data, { ...defaultMapping(), brandName: 'Alt brand' }, translateValue, TEAMSHARE_COLUMNS);
    expect(other.rows[1][other.rows[0].indexOf('BrandName')]).toBe('Alt brand');
    const off = buildImportTable(['ALT-COD'], data, { ...defaultMapping(), brandName: '' }, translateValue, TEAMSHARE_COLUMNS);
    expect(off.rows[0]).not.toContain('BrandName');
  });

  it('maparea salvată înainte rămâne cu Braytron', () => {
    expect(validateMapping({ rules: {}, imageSeparator: '#' }, TEAMSHARE_COLUMNS).brandName).toBe('Braytron');
    expect(validateMapping({ ...defaultMapping(), brandName: '' }, TEAMSHARE_COLUMNS).brandName).toBe('');
  });

  it('apare și în feed-ul XML', () => {
    const xml = buildTechFeedXml(buildImportTable(['BR-BH07-04101'], data, defaultMapping(), translateValue, TEAMSHARE_COLUMNS).rows);
    expect(xml).toContain('<BrandName><![CDATA[BrandName]]></BrandName>'); // rândul de titluri
    expect(xml).toContain('<BrandName><![CDATA[Braytron]]></BrandName>');
  });
});

describe('maparea manuală a categoriilor (Claude)', () => {
  const P = (code: string, name: string, main: string, sub: string) => `<product><code>${code}</code><name>${name}</name><photos/><sections><section><categories><category><attributes>
<attribute><slug>main_family</slug><title>F</title><value>${main}</value></attribute>
<attribute><slug>sub_family</slug><title>S</title><value>${sub}</value></attribute>
</attributes></category></categories></section></sections></product>`;
  const xml = `<response><products>
${P('G1', 'BRY-ADVANCE-14W-E27-G95-4000K-LED BULB', 'Becuri & Tuburi', 'Becuri glob')}
${P('G2', 'BRY-ADVANCE-6,5W-E14-P45-3000K-LED BULB', 'Becuri & Tuburi', 'Becuri glob')}
${P('G3', 'BRY-ADVANCE-7W-E27-G95-SFT-3000K-BULB', 'Becuri & Tuburi', 'Becuri glob')}
${P('F1', 'SPB-SPIRAL-09MM-NON-INSULATED STEEL SPIRAL', 'Electrice', 'Flexible Pipe')}
${P('S1', 'BRY-LINEA-1G-16A-WHT-SOCKET', 'Electrice', 'Întrerupător și priză')}
</products></response>`;
  const d = parseBapp(xml, [], { codePrefix: 'BR-', source: 's', generatedAt: 'now' });

  it('regulile după nume împart familia pe categoriile site-ului', () => {
    expect(d.products.G1.k).toBe('Becuri si tuburi/Globe Bulbs');
    expect(d.products.G2.k).toBe('Becuri si tuburi/Becuri Led A60/P45/G45');
    expect(d.products.G3.k).toBe('Becuri si tuburi/Filament Bulbs');
    expect(d.categories!['Becuri & Tuburi / Becuri glob'].source).toBe('rules');
  });

  it('familiile fără produse pe site primesc categoria manuală; cele fără categorie pe site sunt semnalate', () => {
    expect(d.products.F1.k).toBe('Trasee Cabluri/Tub Flexibil Metalic');
    expect(d.categories!['Electrice / Flexible Pipe']).toMatchObject({ category: 'Trasee Cabluri/Tub Flexibil Metalic', source: 'manual' });
    expect(d.products.S1.k).toBeUndefined();
    expect(d.categories!['Electrice / Întrerupător și priză'].suggestNew).toMatch(/Linea/);
  });

  it('în fișier: sugestia pe produs, iar corectura ta pe familie o înlocuiește', () => {
    const t = buildImportTable(['G1', 'G2'], d, defaultMapping(), translateValue, TEAMSHARE_COLUMNS);
    const cat = (tb: { rows: string[][] }, c: string) => tb.rows.find((r) => r[0] === c || r[0] === 'BR-' + c)![tb.rows[0].indexOf('Category')];
    expect(cat(t, 'G1')).toBe('Becuri si tuburi/Globe Bulbs');
    expect(cat(t, 'G2')).toBe('Becuri si tuburi/Becuri Led A60/P45/G45');
    const o = buildImportTable(['G1'], d, { ...defaultMapping(), categories: { 'Becuri & Tuburi / Becuri glob': 'X/Y' } }, translateValue, TEAMSHARE_COLUMNS);
    expect(cat(o, 'G1')).toBe('X/Y');
  });
});
