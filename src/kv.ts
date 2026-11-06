/**
 * Stocarea minimă de care are nevoie sincronizarea.
 * - în GitHub Actions: Cloudflare KV prin API-ul REST (CloudflareKvRest)
 * - în teste: un Map în memorie
 */
export const KV_KEYS = {
  feed: 'feed:xml',
  celFeed: 'feed:cel.xml', // feed pentru rubrica Feed din adminul CEL
  facebookFeed: 'feed:facebook.xml', // catalog Meta (Facebook / Instagram)
  status: 'sync:status',
  celPushed: 'cel:pushed', // { sku: stoc } ultima valoare trimisă cu succes
  celLastFull: 'cel:lastFull',
  lastCount: 'source:lastCount', // vechi: nr. produse la ultima citire reușită (înlocuit de istoric)
  history: 'sync:history', // ultimele rulări, cea mai nouă prima
  settings: 'admin:settings', // setări editabile din panou
  overrides: 'admin:overrides', // excepții pe produs din panou
  snapshot: 'admin:products', // lista de produse pentru panou, scrisă la fiecare sincronizare
  lastDispatch: 'admin:lastDispatch', // ultima pornire a sincronizării din panou
} as const;

export interface KVStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
}

export async function getJson<T>(kv: KVStore, key: string): Promise<T | null> {
  const raw = await kv.get(key);
  return raw === null ? null : (JSON.parse(raw) as T);
}

export class CloudflareKvRest implements KVStore {
  private readonly base: string;

  constructor(
    accountId: string,
    namespaceId: string,
    private readonly apiToken: string,
    private readonly fetchFn: typeof fetch = (input, init) => fetch(input, init),
  ) {
    this.base = `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/`;
  }

  async get(key: string): Promise<string | null> {
    const res = await this.fetchFn(this.base + encodeURIComponent(key), {
      headers: { Authorization: `Bearer ${this.apiToken}` },
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Cloudflare KV get ${key}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    return res.text();
  }

  async put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void> {
    const qs = opts?.expirationTtl ? `?expiration_ttl=${opts.expirationTtl}` : '';
    const res = await this.fetchFn(this.base + encodeURIComponent(key) + qs, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${this.apiToken}`, 'Content-Type': 'text/plain; charset=utf-8' },
      body: value,
    });
    if (!res.ok) throw new Error(`Cloudflare KV put ${key}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
}
