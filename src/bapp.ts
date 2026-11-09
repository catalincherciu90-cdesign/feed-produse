/**
 * Date tehnice și poze din feed-ul producătorului (bapp.ro / Braytron) pentru importul în Teamshare.
 *
 * - parseBapp (bappParse.ts): citește feed-ul XML, doar în GitHub Actions
 * - DEFAULT_MAPPING / DEFAULT_TRANSLATIONS: maparea atribut -> coloană Teamshare și traducerile
 * - translateValue, buildImportTable, buildXlsx: funcții independente, folosite și în panou
 *   (injectate în pagină cu toString), deci nu au voie să folosească nimic din afara lor
 */
/** Un produs din feed-ul producătorului, în forma compactă păstrată în KV. */
export interface BappProduct {
  c: string; // codul producătorului (ex. BG38-12581)
  e?: string; // EAN
  n?: string; // nume
  p: string[]; // poze, în ordine
  a: Record<string, string>; // atribut (slug) -> valoare
}

export interface BappData {
  generatedAt: string;
  source: string; // de unde a fost citit (fără parametri)
  attributes: Record<string, { title: string; count: number }>;
  products: Record<string, BappProduct>; // cheie: codul producătorului
  index: Record<string, string>; // codul tău (ex. BR-BG38-12581) -> codul producătorului
  matched: { byCode: number; byEan: number };
  /**
   * Corespondența familie producător -> categoria ta, învățată din produsele deja legate.
   * Cheie: „Familie / Subfamilie” (ex. „Electrice / MCB”).
   */
  categories?: Record<string, { category: string; share: number; linked: number; total: number }>;
  /** Toate categoriile de pe site (din feed-ul Teamshare), pentru alegere în panou. */
  siteCategories?: string[];
}

/** Cheia de categorie a unui produs al producătorului: „Familie / Subfamilie”. */
export function familyKey(a: Record<string, string>): string {
  const main = (a.main_family || '').trim();
  const sub = (a.sub_family || '').trim();
  return main && sub ? main + ' / ' + sub : main || sub;
}

/** O regulă de mapare: atributul producătorului merge în coloana Teamshare, cu unitate opțională. */
export interface MappingRule {
  column: string; // numele exact al coloanei din șablon; '' = nu se exportă
  unit?: string; // sufix adăugat dacă valoarea e doar număr (ex. ' w')
}

export interface BappMapping {
  rules: Record<string, MappingRule>;
  translate: boolean;
  translations: Record<string, string>; // englez -> română (fraze sau cuvinte)
  imageSeparator: string; // separatorul pozelor din AddImages
  codePrefix: string; // prefixul codurilor tale față de codurile producătorului (ex. BR-)
  /** new = categoria doar la produsele care nu sunt în catalog; all = la toate; off = niciodată */
  categoryMode: 'new' | 'all' | 'off';
  /** Corecturile tale: „Familie / Subfamilie” -> categoria de pe site (au prioritate față de cea învățată) */
  categories: Record<string, string>;
}

// ---------------------------------------------------------------------------------------------
// Maparea implicită. Sigure: denumirea românească din feed = numele coloanei Teamshare.
// De verificat (au mai multe coloane cu același nume în șablon): type, material, length.
// ---------------------------------------------------------------------------------------------
export const DEFAULT_RULES: Record<string, MappingRule> = {
  model: { column: 'Cod Furnizor: - P39324' }, // pe site apare „Cod Furnizor”
  pcsctn: { column: 'Bucăți pe cutie (PCS/CTN) - P39399', unit: ' pcs' },
  warranty: { column: 'Garanție: - P39488' },
  body_color: { column: 'Culoarea corpului: - P39493' },
  ip: { column: 'IP (Grad de protectie): - P39333' },
  working_temperature: { column: 'Temperatura de lucru: - P39451' },
  nw: { column: 'Greutate netă - P39450' },
  gw: { column: 'Greutate brută - P39334' },
  voltage: { column: 'Tensiune: - P39461' },
  class: { column: 'Clasă: - P39468' },
  lifetime: { column: 'Lifetime: - P39331' },
  color_temperature: { column: 'Temperatura culorii: - P39325' },
  dimmable: { column: 'Dimabil: - P39422' },
  color_rendering_index_cri: { column: 'Indexul de redare a culorilor (CRI): - P39321' },
  beam_angle: { column: 'Unghi de emisie al luminii: - P39392' },
  quse_lumen: { column: 'Lumeni efectivi: - P39351', unit: ' lm' },
  light_source: { column: 'Sursa de lumină: - P39449' },
  lamp_shape: { column: 'Forma lămpii: - P39341' },
  energy_efficiency_level: { column: 'Nivel de eficiență energetică - P39364' },
  power_factor: { column: 'Factor de putere: - P39357' },
  socket: { column: 'Dulie/Soclu - P39494' },
  'max-wattage': { column: 'Putere maxima - P39745' },
  cutout: { column: 'Decupaj (gaură): - P39311' },
  equivalent: { column: 'Echivalent - P39354' },
  ik: { column: 'IK (Protectie la impact) - P39373' },
  sensor_type: { column: 'Tip de senzor: - P39366' },
  detection_distance: { column: 'Distanța de detecție - P39415' },
  time_delay: { column: 'Întârziere în timp - P39397' },
  charging_time: { column: 'Timp de încărcare: - P39462' },
  lux: { column: 'Nivel de iluminare (Lux): - P39317' },
  working_time: { column: 'Timp de funcționare: - P39368' },
  battery: { column: 'Baterie: - P39327' },
  installation_height: { column: 'Înălțimea de instalare - P39306' },
  view_distance: { column: 'View Distance - P39304' },
  capacity_watt: { column: 'Capacity Watt: - P39382' },
  solar_power: { column: 'Puterea solară - P39344' },
  detection_angle: { column: 'Unghiul de detecție - P39356' },
  type_of_cable: { column: 'Type of Cable - P39419' },
  detection_speed: { column: 'Viteza de detecție - P39440' },
  emergency_mode: { column: 'Mod de urgență - P39457' },
  charging_type: { column: 'Tip de încărcare - P39478' },
  cable_cross_section: { column: 'Cable Cross Section - P39400' },
  number_of_charging_cycles: { column: 'Număr de cicluri de încărcare - P39318' },
  size: { column: 'Size - P39438' },
  noise: { column: 'Noise - P39390' },
  air_flow: { column: 'Air-Flow - P39409' },
  motor_rotation: { column: 'Motor Rotation - P39387' },
  // Ambigue în șablon: am ales varianta cu aceeași etichetă ca pe site
  type: { column: 'Tip: - P39482' },
  material: { column: 'Material: - P39441' },
  weight: { column: 'Greutate: - P39486' },
  height: { column: 'Înălțime - P39330' },
  length: { column: 'Lungime: - P39460' },
  width: { column: 'Lățime: - P39386' },
  wattage: { column: 'Putere: - P39305', unit: ' w' },
  diameter: { column: 'Diametru: - P39446' },
  battery_capacity: { column: 'Capacitatea bateriei: - P39492' },
  // Fără coloană implicită (nu se exportă până nu alegi una)
  package_length: { column: '' },
  package_width: { column: '' },
  package_height: { column: '' },
  main_family: { column: '' },
  sub_family: { column: '' },
  ean: { column: '' },
  icons: { column: '' },
  release_date: { column: '' },
  video: { column: '' },
  current: { column: '' },
  led_quantity: { column: '' },
  solar_panel: { column: '' },
};

/** Atributele pe care le-am mapat cu presupuneri; panoul le marchează „de verificat”. */
export const UNCERTAIN_RULES = ['type', 'material', 'length', 'weight', 'height', 'width', 'wattage', 'diameter', 'battery_capacity', 'model'];

export const DEFAULT_TRANSLATIONS: Record<string, string> = {
  // Garanție
  '2 Years(1 Year for battery)': '2 ani (1 an pentru baterie)',
  '1 Years': '1 an',
  Years: 'ani',
  Year: 'an',
  // Culori
  White: 'Alb',
  Black: 'Negru',
  'Dark Grey': 'Gri închis',
  Grey: 'Gri',
  Clear: 'Transparent',
  Silver: 'Argintiu',
  Golden: 'Auriu',
  Gold: 'Auriu',
  Wooden: 'Lemn',
  Chrome: 'Crom',
  Green: 'Verde',
  Blue: 'Albastru',
  Red: 'Roșu',
  Amber: 'Chihlimbar',
  // Lumină
  'Not-Dimmable': 'Nedimabil',
  'Step Dim': 'Dimabil în trepte',
  Dimmable: 'Dimabil',
  'Non-Directional': 'Nedirecțională',
  Directional: 'Direcțională',
  '3IN1': '3 în 1',
  '5IN1': '5 în 1',
  Degrees: 'grade',
  // Clasă
  'CLASS III': 'Clasa III',
  'CLASS II': 'Clasa II',
  'CLASS I': 'Clasa I',
  // Tip produs (cele mai frecvente)
  'Recessed Panel': 'Panou încastrat',
  'Surface Panel': 'Panou aplicat',
  'Ceiling Light': 'Plafonieră',
  'Pendant Light': 'Pendul',
  'Batten Light': 'Corp liniar',
  'Switch and Socket': 'Întrerupător și priză',
  'Power Supply': 'Sursă de alimentare',
  'Mag.Rail': 'Șină magnetică',
  Spotlight: 'Spot',
  Track: 'Șină',
  Strip: 'Bandă',
  Wall: 'Perete',
  Connector: 'Conector',
  Bulkhead: 'Aplică etanșă',
  // Materiale
  Aluminium: 'Aluminiu',
  Glass: 'Sticlă',
  Steel: 'Oțel',
  // Senzori, baterii, urgență
  Motion: 'Mișcare',
  Microwave: 'Microunde',
  Photosel: 'Fotocelulă',
  Infrared: 'Infraroșu',
  Battery: 'Baterie',
  'Non-Maintained': 'Nepermanent',
  Maintained: 'Permanent',
  'Solar Panel Energy': 'Energie panou solar',
  Hours: 'ore',
  Socket: 'Dulie',
  WIRES: 'fire',
};

export function defaultMapping(): BappMapping {
  return {
    rules: JSON.parse(JSON.stringify(DEFAULT_RULES)),
    translate: true,
    translations: { ...DEFAULT_TRANSLATIONS },
    imageSeparator: '#',
    codePrefix: 'BR-',
    categoryMode: 'new',
    categories: {},
  };
}

// ---------------------------------------------------------------------------------------------
// Funcții independente (folosite și în browser). Nu folosesc nimic din afara lor.
// ---------------------------------------------------------------------------------------------

/**
 * Traduce o valoare: întâi potrivire exactă (fără diferență de majuscule), apoi înlocuiește
 * expresiile din dicționar ca cuvinte întregi, de la cele mai lungi la cele mai scurte.
 */
export function translateValue(value: string, translations: Record<string, string>): string {
  const v = String(value == null ? '' : value).trim();
  if (!v) return v;
  const lower: Record<string, string> = {};
  for (const k of Object.keys(translations)) lower[k.toLowerCase()] = translations[k];
  if (Object.prototype.hasOwnProperty.call(lower, v.toLowerCase())) return lower[v.toLowerCase()];
  const keys = Object.keys(translations).sort(function (a, b) { return b.length - a.length; });
  let out = v;
  for (const k of keys) {
    if (!k) continue;
    const esc = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // margini de cuvânt fără \b (care nu știe diacritice): început/sfârșit sau caracter non-literă
    const re = new RegExp('(^|[^A-Za-z0-9ĂÂÎȘȚăâîșț])(' + esc + ')(?=$|[^A-Za-z0-9ĂÂÎȘȚăâîșț])', 'gi');
    out = out.replace(re, function (_m: string, pre: string) { return pre + translations[k]; });
  }
  return out;
}

/**
 * Construiește tabelul de import: primul rând = antet (coduri + coloane mapate + poze),
 * apoi câte un rând pe produs. Coloanele fără nicio valoare la produsele alese nu apar.
 * Rezultat: { rows, missing, perProduct }.
 */
export function buildImportTable(
  codes: string[],
  data: {
    products: Record<string, { c: string; p: string[]; a: Record<string, string> }>;
    index: Record<string, string>;
    categories?: Record<string, { category: string }>;
  },
  mapping: {
    rules: Record<string, { column: string; unit?: string }>;
    translate: boolean;
    translations: Record<string, string>;
    imageSeparator: string;
    codePrefix: string;
    categoryMode?: string;
    categories?: Record<string, string>;
  },
  translateFn: (v: string, t: Record<string, string>) => string,
  columnOrder: readonly string[],
): {
  rows: string[][];
  missing: string[];
  perProduct: { code: string; supplierCode: string; values: number; photos: number; existing: boolean; category: string; family: string }[];
} {
  const CODE = 'ProductCode';
  const IMG = 'ProductImage - P39360';
  const ADD = 'AddImages - P39379';
  const CAT = 'Category';
  const found: { code: string; existing: boolean; prod: { c: string; p: string[]; a: Record<string, string> } }[] = [];
  const missing: string[] = [];
  const seen: Record<string, boolean> = {};
  const reverse: Record<string, string> = {};
  for (const own of Object.keys(data.index)) reverse[data.index[own]] = own;
  for (const raw of codes) {
    const code = String(raw || '').trim();
    if (!code || seen[code]) continue;
    seen[code] = true;
    let key = data.index[code];
    if (!key && data.products[code]) key = code;
    if (!key && mapping.codePrefix && code.indexOf(mapping.codePrefix) === 0 && data.products[code.slice(mapping.codePrefix.length)]) {
      key = code.slice(mapping.codePrefix.length);
    }
    if (key && data.products[key]) {
      // În fișier punem mereu codul tău: dacă ai scris codul producătorului (ex. BG38-12481),
      // îl înlocuim cu codul tău legat de el (BR-BG38-12481). Un cod al tău rămâne neschimbat.
      const own = data.index[code] ? code : reverse[key] || code;
      if (own !== code && seen[own]) continue;
      seen[own] = true;
      found.push({ code: own, existing: !!data.index[own], prod: data.products[key] });
    } else missing.push(code);
  }

  const cells: Record<string, string>[] = [];
  const used: Record<string, boolean> = {};
  const perProduct: { code: string; supplierCode: string; values: number; photos: number; existing: boolean; category: string; family: string }[] = [];
  const mode = mapping.categoryMode || 'new';
  const overrides = mapping.categories || {};
  const learned = data.categories || {};
  for (const f of found) {
    const row: Record<string, string> = {};
    row[CODE] = f.code;
    let values = 0;
    for (const slug of Object.keys(f.prod.a)) {
      const rule = mapping.rules[slug];
      if (!rule || !rule.column) continue;
      let v = String(f.prod.a[slug] == null ? '' : f.prod.a[slug]).trim();
      if (!v) continue;
      if (mapping.translate) v = translateFn(v, mapping.translations);
      if (rule.unit && /^-?\d+([.,]\d+)?$/.test(v)) v = v + rule.unit;
      // două atribute pe aceeași coloană: le păstrăm pe amândouă
      row[rule.column] = row[rule.column] ? row[rule.column] + '; ' + v : v;
      used[rule.column] = true;
      values++;
    }
    const photos = (f.prod.p || []).filter(function (u) { return !!u; });
    if (photos.length) {
      row[IMG] = photos[0];
      used[IMG] = true;
      if (photos.length > 1) {
        row[ADD] = photos.slice(1).join(mapping.imageSeparator);
        used[ADD] = true;
      }
    }
    // Categoria: corectura ta, altfel cea învățată din produsele existente
    const fa = f.prod.a || {};
    const main = String(fa.main_family || '').trim();
    const subf = String(fa.sub_family || '').trim();
    const family = main && subf ? main + ' / ' + subf : main || subf;
    let category = '';
    if (family) {
      if (Object.prototype.hasOwnProperty.call(overrides, family)) category = String(overrides[family] || '').trim();
      else if (learned[family]) category = learned[family].category;
    }
    if (category && (mode === 'all' || (mode === 'new' && !f.existing))) {
      row[CAT] = category;
      used[CAT] = true;
    }
    cells.push(row);
    perProduct.push({ code: f.code, supplierCode: f.prod.c, values: values, photos: photos.length, existing: f.existing, category: row[CAT] || '', family: family });
  }

  // ordinea coloanelor: ca în șablonul Teamshare
  const header = [CODE];
  for (const col of columnOrder) if (col !== CODE && used[col]) header.push(col);
  for (const col of Object.keys(used)) if (header.indexOf(col) < 0) header.push(col);
  const rows = [header];
  for (const r of cells) rows.push(header.map(function (h) { return r[h] || ''; }));
  return { rows: rows, missing: missing, perProduct: perProduct };
}

/**
 * Fișier .xlsx minimal (o foaie, text inline), fără biblioteci: arhivă ZIP fără compresie.
 * Întoarce octeții fișierului.
 */
export function buildXlsx(rows: string[][], sheetName: string): Uint8Array {
  const enc = new TextEncoder();
  const xmlEsc = function (s: string): string {
    return String(s)
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };
  const colName = function (i: number): string {
    let s = '';
    let n = i + 1;
    while (n > 0) {
      const m = (n - 1) % 26;
      s = String.fromCharCode(65 + m) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  };
  let sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>';
  rows.forEach(function (row, r) {
    sheet += '<row r="' + (r + 1) + '">';
    row.forEach(function (val, c) {
      if (val === '' || val == null) return;
      sheet += '<c r="' + colName(c) + (r + 1) + '" t="inlineStr"><is><t xml:space="preserve">' + xmlEsc(val) + '</t></is></c>';
    });
    sheet += '</row>';
  });
  sheet += '</sheetData></worksheet>';

  const files: [string, string][] = [
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="' + xmlEsc(sheetName).slice(0, 31) + '" sheetId="1" r:id="rId1"/></sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'],
    ['xl/worksheets/sheet1.xml', sheet],
  ];

  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table.push(c >>> 0);
  }
  const crc32 = function (b: Uint8Array): number {
    let c = 0xffffffff;
    for (let i = 0; i < b.length; i++) c = table[(c ^ b[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };

  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f[0]);
    const data = enc.encode(f[1]);
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // nume în UTF-8
    local.setUint16(8, 0, true); // fără compresie
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, name.length, true);
    parts.push(new Uint8Array(local.buffer), name, data);

    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(8, 0x0800, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, data.length, true);
    cd.setUint32(24, data.length, true);
    cd.setUint16(28, name.length, true);
    cd.setUint32(42, offset, true);
    central.push(new Uint8Array(cd.buffer), name);
    offset += 30 + name.length + data.length;
  }
  let cdSize = 0;
  for (const c of central) cdSize += c.length;
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);

  const all = parts.concat(central, [new Uint8Array(end.buffer)]);
  let total = 0;
  for (const a of all) total += a.length;
  const out = new Uint8Array(total);
  let pos = 0;
  for (const a of all) {
    out.set(a, pos);
    pos += a.length;
  }
  return out;
}


// ---------------------------------------------------------------------------------------------
// Validarea mapării salvate din panou
// ---------------------------------------------------------------------------------------------

export const MAPPING_LIMITS = { maxRules: 500, maxTranslations: 3000, maxText: 200, maxUnit: 12 } as const;

/** Validează maparea primită din panou. Coloanele trebuie să existe în șablonul Teamshare. */
export function validateMapping(raw: unknown, columns: readonly string[]): BappMapping {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('Mapare invalidă');
  const r = raw as Record<string, unknown>;
  const allowed = new Set(columns);
  const str = (v: unknown, max: number, name: string): string => {
    if (typeof v !== 'string') throw new Error(`${name}: trebuie să fie text`);
    if (v.length > max) throw new Error(`${name}: maximum ${max} caractere`);
    return v;
  };

  const rulesIn = r.rules;
  if (typeof rulesIn !== 'object' || rulesIn === null || Array.isArray(rulesIn)) throw new Error('rules lipsește');
  const entries = Object.entries(rulesIn as Record<string, unknown>);
  if (entries.length > MAPPING_LIMITS.maxRules) throw new Error('Prea multe reguli');
  const rules: Record<string, MappingRule> = {};
  for (const [slug, v] of entries) {
    if (!/^[a-z0-9_.-]{1,64}$/i.test(slug)) throw new Error(`Atribut invalid: ${slug}`);
    const rule = v as Record<string, unknown>;
    const column = str(rule?.column ?? '', MAPPING_LIMITS.maxText, `Coloana pentru ${slug}`);
    if (column && !allowed.has(column)) throw new Error(`Coloana „${column}” nu există în șablonul Teamshare`);
    const unit = rule?.unit === undefined || rule?.unit === '' ? undefined : str(rule.unit, MAPPING_LIMITS.maxUnit, `Unitatea pentru ${slug}`);
    rules[slug] = unit ? { column, unit } : { column };
  }

  const trIn = r.translations ?? {};
  if (typeof trIn !== 'object' || trIn === null || Array.isArray(trIn)) throw new Error('translations invalid');
  const trEntries = Object.entries(trIn as Record<string, unknown>);
  if (trEntries.length > MAPPING_LIMITS.maxTranslations) throw new Error('Prea multe traduceri');
  const translations: Record<string, string> = {};
  for (const [k, v] of trEntries) {
    const key = str(k, MAPPING_LIMITS.maxText, 'Traducere').trim();
    if (!key) continue;
    translations[key] = str(v, MAPPING_LIMITS.maxText, `Traducerea pentru „${key}”`).trim();
  }

  const sep = str(r.imageSeparator ?? '#', 5, 'Separatorul pozelor');
  if (!sep) throw new Error('Separatorul pozelor nu poate fi gol');
  const mode = r.categoryMode === undefined ? 'new' : r.categoryMode;
  if (mode !== 'new' && mode !== 'all' && mode !== 'off') throw new Error('categoryMode trebuie să fie new, all sau off');
  const catIn = r.categories ?? {};
  if (typeof catIn !== 'object' || catIn === null || Array.isArray(catIn)) throw new Error('categories invalid');
  const catEntries = Object.entries(catIn as Record<string, unknown>);
  if (catEntries.length > MAPPING_LIMITS.maxTranslations) throw new Error('Prea multe categorii');
  const categories: Record<string, string> = {};
  for (const [k, v] of catEntries) {
    const key = str(k, MAPPING_LIMITS.maxText, 'Familie').trim();
    if (key) categories[key] = str(v, MAPPING_LIMITS.maxText, `Categoria pentru „${key}”`).trim();
  }
  return {
    categoryMode: mode,
    categories,
    rules,
    translate: r.translate !== false,
    translations,
    imageSeparator: sep,
    codePrefix: str(r.codePrefix ?? '', 20, 'Prefixul codurilor'),
  };
}

// ---------------------------------------------------------------------------------------------
// Feed XML pentru importul în Teamshare (/date-tehnice.xml), în stilul exportului Teamshare
// ---------------------------------------------------------------------------------------------

/**
 * Numele de tag XML pentru o coloană din șablon, după convenția exportului Teamshare
 * (spațiile și semnele devin „_”, fără diacritice). La proprietăți păstrăm și ID-ul (P12345),
 * pentru că șablonul are coloane cu același nume (ex. „Material:” de 3 ori).
 *   ProductCode                     -> Product_Code
 *   Culoarea corpului: - P39493     -> Culoarea_corpului_P39493
 *   ProductImage - P39360           -> ProductImage_P39360
 */
export function teamshareTag(column: string): string {
  if (column === 'ProductCode') return 'Product_Code';
  const m = /^(.*?)\s*-\s*(P\d+)\s*$/.exec(column);
  const base = (m ? m[1] : column)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const tag = m ? (base ? `${base}_${m[2]}` : m[2]) : base;
  return /^[A-Za-z_]/.test(tag) ? tag : `_${tag}`;
}

function cdataTs(v: string): string {
  const clean = v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  return `<![CDATA[${clean.replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
}

/**
 * Feed XML din tabelul de import (primul rând = antet). Celulele goale nu apar în XML.
 * Primul <product> este rândul de titluri (ca în exportul Teamshare): fiecare tag conține numele
 * exact al coloanei din șablonul de import. În Teamshare: „First row has column names” bifat.
 */
export function buildTechFeedXml(rows: string[][], opts: { headerRow?: boolean } = {}): string {
  const header = rows[0] ?? [];
  const tags = header.map(teamshareTag);
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<products>'];
  if (opts.headerRow !== false && header.length) {
    lines.push('<product>');
    header.forEach((name, i) => lines.push(`<${tags[i]}>${cdataTs(name)}</${tags[i]}>`));
    lines.push('</product>');
  }
  for (const row of rows.slice(1)) {
    lines.push('<product>');
    row.forEach((v, i) => {
      if (v) lines.push(`<${tags[i]}>${cdataTs(v)}</${tags[i]}>`);
    });
    lines.push('</product>');
  }
  lines.push('</products>');
  return lines.join('\n') + '\n';
}

export const FEED_CODES_LIMIT = 10000;

/** Validează lista de coduri salvată pentru feed. */
export function validateFeedCodes(raw: unknown): string[] {
  const list = (raw as { codes?: unknown })?.codes;
  if (!Array.isArray(list)) throw new Error('codes trebuie să fie o listă');
  const out: string[] = [];
  const seen = new Set<string>();
  for (const c of list) {
    if (typeof c !== 'string') throw new Error('Codurile trebuie să fie text');
    const code = c.trim();
    if (!code || seen.has(code)) continue;
    if (code.length > 100) throw new Error(`Cod prea lung: ${code.slice(0, 30)}…`);
    seen.add(code);
    out.push(code);
  }
  if (out.length > FEED_CODES_LIMIT) throw new Error(`Maximum ${FEED_CODES_LIMIT} coduri`);
  return out;
}
