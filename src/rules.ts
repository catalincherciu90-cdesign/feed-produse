/**
 * Setările editabile din panoul de admin și excepțiile pe produs.
 * Fără dependențe de parserul XML: modulul e folosit și de Worker (panoul de admin).
 */

export interface Settings {
  availableMinStock: number; // feed clienți: stoc >= prag => disponibil
  celMinStock: number; // CEL: stoc sub prag => 0
  celStockBuffer: number; // CEL: bucăți rezervate, scăzute din stoc
  celMaxStock: number; // CEL: stocul trimis nu depășește valoarea asta; 0 = fără limită
  celBlockZeroPrice: boolean; // CEL: preț 0 sau lipsă => 0
}

/**
 * block            = produsul nu poate fi comandat / apare indisponibil, orice stoc ar avea
 * ignore-threshold = nu se aplică pragul de stoc (se vinde și sub 10 bucăți, dacă are stoc)
 */
export type OverrideMode = 'block' | 'ignore-threshold';

export interface ProductOverride {
  cel?: OverrideMode;
  client?: OverrideMode;
  note?: string;
  updatedAt?: string;
}

export type Overrides = Record<string, ProductOverride>;

export const LIMITS = { maxStockSetting: 100000, maxNote: 200, maxSku: 100, maxOverrides: 10000 } as const;

const MODES: OverrideMode[] = ['block', 'ignore-threshold'];

function intSetting(raw: unknown, name: string): number {
  const n = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > LIMITS.maxStockSetting) {
    throw new Error(`${name} trebuie să fie un număr întreg între 0 și ${LIMITS.maxStockSetting}`);
  }
  return n;
}

/** Validează setările primite din panou. Aruncă o eroare cu mesaj clar dacă ceva e greșit. */
export function validateSettings(raw: unknown): Settings {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('Setări invalide');
  const r = raw as Record<string, unknown>;
  if (typeof r.celBlockZeroPrice !== 'boolean') throw new Error('celBlockZeroPrice trebuie să fie true sau false');
  return {
    availableMinStock: intSetting(r.availableMinStock, 'Pragul pentru clienți'),
    celMinStock: intSetting(r.celMinStock, 'Pragul pentru CEL'),
    celStockBuffer: intSetting(r.celStockBuffer, 'Rezerva pentru CEL'),
    // opțional, pentru setările salvate înainte să existe limita
    celMaxStock: r.celMaxStock === undefined ? 0 : intSetting(r.celMaxStock, 'Stocul maxim pentru CEL'),
    celBlockZeroPrice: r.celBlockZeroPrice,
  };
}

/** Validează o excepție. Întoarce null dacă nu mai conține nicio regulă (= ștergere). */
export function validateOverride(raw: unknown): ProductOverride | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('Excepție invalidă');
  const r = raw as Record<string, unknown>;
  const mode = (v: unknown, name: string): OverrideMode | undefined => {
    if (v === undefined || v === null || v === '' || v === 'default') return undefined;
    if (!MODES.includes(v as OverrideMode)) throw new Error(`${name}: valoare necunoscută "${String(v)}"`);
    return v as OverrideMode;
  };
  const cel = mode(r.cel, 'CEL');
  const client = mode(r.client, 'Clienți');
  if (!cel && !client) return null;
  const note = typeof r.note === 'string' ? r.note.trim().slice(0, LIMITS.maxNote) : '';
  const out: ProductOverride = { updatedAt: new Date().toISOString() };
  if (cel) out.cel = cel;
  if (client) out.client = client;
  if (note) out.note = note;
  return out;
}

export function validateSku(raw: unknown): string {
  if (typeof raw !== 'string' || raw.trim() === '' || raw.length > LIMITS.maxSku) throw new Error('Cod de produs invalid');
  return raw.trim();
}

/** Citește excepțiile salvate, ignorând intrările stricate (nu blochează sincronizarea). */
export function parseOverrides(raw: string | null): Overrides {
  if (!raw) return {};
  try {
    const data = JSON.parse(raw) as unknown;
    if (typeof data !== 'object' || data === null || Array.isArray(data)) return {};
    const out: Overrides = {};
    for (const [sku, ov] of Object.entries(data as Record<string, unknown>)) {
      try {
        const v = validateOverride(ov);
        if (v) out[sku] = { ...v, updatedAt: (ov as ProductOverride).updatedAt ?? v.updatedAt };
      } catch {
        // intrare invalidă: o sărim
      }
    }
    return out;
  } catch {
    return {};
  }
}
