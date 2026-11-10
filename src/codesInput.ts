/**
 * Lista de coduri pentru /date-tehnice.xml trimisă direct workflow-ului de sincronizare
 * (input workflow_dispatch), ca sincronizarea să nu depindă de întârzierea KV între regiuni.
 * Conține și categoriile alese pe produs, din același motiv.
 * Format: "gz:" + base64(gzip(JSON { savedAt, codes, categories })). Merge în Worker și în Node 22.
 */
import type { SavedFeedCodes } from './bapp';

export interface CodesPayload extends SavedFeedCodes {
  categories?: Record<string, string>;
}

/** GitHub acceptă cel mult 65.535 de caractere pentru toate inputurile; păstrăm loc pentru restul. */
export const CODES_INPUT_MAX = 60_000;

async function pipe(data: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([data]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** Întoarce textul pentru input sau null dacă lista e prea mare (atunci sincronizarea citește din KV). */
export async function encodeCodesInput(saved: CodesPayload): Promise<string | null> {
  const gz = await pipe(new TextEncoder().encode(JSON.stringify(saved)), new CompressionStream('gzip'));
  const text = 'gz:' + toBase64(gz);
  return text.length <= CODES_INPUT_MAX ? text : null;
}

/** Citește inputul; null dacă lipsește. Aruncă eroare dacă e stricat. */
export async function decodeCodesInput(text: string | undefined): Promise<CodesPayload | null> {
  const t = text?.trim();
  if (!t) return null;
  if (!t.startsWith('gz:')) throw new Error('format necunoscut pentru lista de coduri primită');
  const json = new TextDecoder().decode(await pipe(fromBase64(t.slice(3)), new DecompressionStream('gzip')));
  const v = JSON.parse(json) as { savedAt?: unknown; codes?: unknown; categories?: unknown };
  if (!Array.isArray(v.codes)) throw new Error('lista de coduri primită nu e validă');
  const out: CodesPayload = {
    savedAt: typeof v.savedAt === 'number' ? v.savedAt : 0,
    codes: v.codes.filter((c): c is string => typeof c === 'string'),
  };
  if (v.categories && typeof v.categories === 'object' && !Array.isArray(v.categories)) {
    out.categories = {};
    for (const [k, c] of Object.entries(v.categories as Record<string, unknown>)) if (typeof c === 'string') out.categories[k] = c;
  }
  return out;
}
