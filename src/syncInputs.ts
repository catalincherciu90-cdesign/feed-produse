/** Inputurile trimise workflow-ului de sincronizare (folosite de panou și de sincronizarea automată). */
import type { SavedFeedCodes } from './bapp';
import { encodeCodesInput } from './codesInput';
import { KV_KEYS } from './kv';

/**
 * Inputurile workflow-ului: lista și categoriile alese, comprimate. Dacă nu încap, doar lista
 * (atunci sincronizarea citește categoriile din KV), iar dacă nici ea nu încape, doar momentul salvării.
 * Trimitem toate categoriile: cheia lor e codul din feed (ex. BR-BD60-03280), care poate diferi de
 * codul scris în listă (BD60-03280), deci o filtrare după listă le-ar pierde.
 */
export async function syncInputs(kv: KVNamespace, saved: SavedFeedCodes): Promise<Record<string, string>> {
  const rawCats = await kv.get(KV_KEYS.bappProductCategories);
  const categories = rawCats ? (JSON.parse(rawCats) as Record<string, string>) : {};
  const inputs: Record<string, string> = { feed_codes_saved_at: String(saved.savedAt) };
  const encoded = (await encodeCodesInput({ ...saved, categories })) ?? (await encodeCodesInput(saved));
  if (encoded) inputs.feed_codes = encoded;
  return inputs;
}
