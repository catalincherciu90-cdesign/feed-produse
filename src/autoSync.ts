/**
 * Sincronizare automată: Cloudflare rulează Worker-ul în fiecare oră (Cron Trigger din wrangler.toml,
 * gratuit). Dacă a trecut intervalul ales în panou, Worker-ul pornește workflow-ul din GitHub,
 * exact ca butonul „Sincronizează acum” (cu lista pentru /date-tehnice.xml inclusă).
 */
import { readSavedFeedCodes } from './bapp';
import { KV_KEYS } from './kv';
import { dispatchSync, type TriggerEnv } from './trigger';
import { syncInputs } from './syncInputs';

/** Intervalele permise, în ore; 0 = oprită. */
export const AUTO_SYNC_HOURS = [0, 1, 2, 3, 4, 6, 8, 12, 24] as const;
/** Implicit: în fiecare oră. ~10 scrieri KV pe sincronizare, deci ~250 pe zi din cele 1.000 gratuite. */
export const AUTO_SYNC_DEFAULT_HOURS = 1;

export interface AutoSyncSettings {
  hours: number;
}

export interface AutoSyncState {
  lastAt?: string; // ultima pornire automată reușită
  lastTryAt?: string; // ultima încercare (reușită sau nu)
  error?: string; // eroarea ultimei încercări, dacă a eșuat
}

export function validateAutoSync(raw: unknown): AutoSyncSettings {
  const h = (raw as { hours?: unknown })?.hours;
  if (typeof h !== 'number' || !(AUTO_SYNC_HOURS as readonly number[]).includes(h)) {
    throw new Error(`hours trebuie să fie una dintre valorile ${AUTO_SYNC_HOURS.join(', ')}`);
  }
  return { hours: h };
}

export async function readAutoSync(kv: KVNamespace): Promise<AutoSyncSettings> {
  const raw = await kv.get(KV_KEYS.autoSync);
  if (!raw) return { hours: AUTO_SYNC_DEFAULT_HOURS };
  try {
    return validateAutoSync(JSON.parse(raw));
  } catch {
    return { hours: AUTO_SYNC_DEFAULT_HOURS };
  }
}

export async function readAutoSyncState(kv: KVNamespace): Promise<AutoSyncState> {
  const raw = await kv.get(KV_KEYS.autoSyncState);
  return raw ? (JSON.parse(raw) as AutoSyncState) : {};
}

/** Marjă: cron-ul rulează la fix o dată pe oră, dar nu chiar la aceeași secundă. */
const TOLERANCE_MS = 10 * 60 * 1000;

/**
 * Apelată de Cloudflare în fiecare oră. Întoarce ce a făcut (pentru jurnal și teste).
 * Ultima sincronizare de orice fel (manuală sau automată) contează: dacă ai apăsat butonul
 * acum 20 de minute, nu mai pornește alta.
 */
export async function runAutoSync(
  env: TriggerEnv & { FEED_KV: KVNamespace },
  now: number,
  fetchFn?: typeof fetch,
): Promise<'off' | 'not-due' | 'started' | 'failed'> {
  const kv = env.FEED_KV;
  const { hours } = await readAutoSync(kv);
  if (!hours) return 'off';

  const state = await readAutoSyncState(kv);
  // ultima sincronizare care a rulat (pornită de oriunde) și ultima pornire automată
  const status = await kv.get(KV_KEYS.status);
  const lastRun = status ? Date.parse((JSON.parse(status) as { startedAt?: string }).startedAt ?? '') || 0 : 0;
  const lastAuto = state.lastAt ? Date.parse(state.lastAt) || 0 : 0;
  const last = Math.max(lastRun, lastAuto);
  if (now - last < hours * 3600_000 - TOLERANCE_MS) return 'not-due';

  const tryAt = new Date(now).toISOString();
  try {
    const saved = readSavedFeedCodes(await kv.get(KV_KEYS.bappFeedCodes));
    await dispatchSync(env, fetchFn, saved ? await syncInputs(kv, saved) : undefined);
    await kv.put(KV_KEYS.autoSyncState, JSON.stringify({ lastAt: tryAt, lastTryAt: tryAt } satisfies AutoSyncState));
    return 'started';
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await kv.put(KV_KEYS.autoSyncState, JSON.stringify({ ...state, lastTryAt: tryAt, error } satisfies AutoSyncState));
    return 'failed';
  }
}
