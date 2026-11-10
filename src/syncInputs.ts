/** Inputurile trimise workflow-ului de sincronizare (folosite de panou și de sincronizarea automată). */
import type { SavedFeedCodes } from './bapp';
import { encodeCodesInput } from './codesInput';
import { KV_KEYS } from './kv';

/** Inputurile workflow-ului: lista și categoriile, comprimate; dacă sunt prea mari, doar momentul salvării. */
export async function syncInputs(kv: KVNamespace, saved: SavedFeedCodes): Promise<Record<string, string>> {
  const rawCats = await kv.get(KV_KEYS.bappProductCategories);
  const categories = rawCats ? (JSON.parse(rawCats) as Record<string, string>) : {};
  const wanted = new Set(saved.codes);
  const own: Record<string, string> = {};
  for (const [k, v] of Object.entries(categories)) if (wanted.has(k)) own[k] = v;
  const inputs: Record<string, string> = { feed_codes_saved_at: String(saved.savedAt) };
  const encoded = (await encodeCodesInput({ ...saved, categories: own })) ?? (await encodeCodesInput(saved));
  if (encoded) inputs.feed_codes = encoded;
  return inputs;
}
