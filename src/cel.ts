import type { Config } from './config';

/**
 * Client minimal pentru API-ul CEL.ro Marketplace.
 * Comportament preluat din wrapper-ul oficial PHP (github.com/celdotro/marketplace):
 * - POST {api}/login/actionLogin/ cu username + password => token în `message`
 * - POST {api}/products/updateStockAndPrice/ cu header AUTH: Bearer <token>
 *   și câmpul `products` = JSON, maximum 5000 produse pe request.
 */

export const CEL_BATCH_SIZE = 5000;
const API_VERSION = '2.2.0';
const TOKEN_KEY = 'cel:token';

export interface CelStockUpdate {
  products_model: string;
  stoc: number;
}

export interface CelUpdateResult {
  sent: number;
  updated: number;
  badList: unknown[];
}

interface CelResponse {
  error?: number;
  tokenStatus?: number;
  message?: unknown;
}

const TOKEN_ERRORS = new Set([302, 403, 405]);

export class CelClient {
  constructor(
    private readonly config: Config,
    private readonly kv: KVNamespace,
    private readonly fetchFn: typeof fetch = (input, init) => fetch(input, init),
  ) {
    if (!config.celUsername || !config.celPassword) {
      throw new Error('CEL_USERNAME și CEL_PASSWORD trebuie setate ca secrete');
    }
  }

  private async post(path: string, form: Record<string, string>, token?: string): Promise<CelResponse> {
    const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' };
    if (token) headers.AUTH = `Bearer ${token}`;
    if (this.config.celDemo) headers.DEMO = '1';
    const body = new URLSearchParams({ ...form, api_version: API_VERSION });
    const res = await this.fetchFn(`${this.config.celApiUrl}${path}`, { method: 'POST', headers, body });
    const raw = await res.text();
    if (res.status === 400) return { error: 403, tokenStatus: 0, message: raw }; // wrapper-ul oficial regenerează token-ul la 400
    if (!res.ok) throw new Error(`CEL a răspuns cu HTTP ${res.status}: ${raw.slice(0, 300)}`);
    try {
      return JSON.parse(raw) as CelResponse;
    } catch {
      throw new Error(`Răspuns CEL invalid (nu e JSON): ${raw.slice(0, 300)}`);
    }
  }

  private async login(): Promise<string> {
    const res = await this.post('login/actionLogin/', {
      username: this.config.celUsername!,
      password: this.config.celPassword!,
    });
    if (res.error !== 0 || typeof res.message !== 'string' || res.message === '') {
      throw new Error(`Autentificare CEL eșuată: ${JSON.stringify(res.message ?? res)}`);
    }
    // TTL-ul real al token-ului nu e documentat; îl ținem 12h și îl regenerăm la eroare.
    await this.kv.put(TOKEN_KEY, res.message, { expirationTtl: 12 * 3600 });
    return res.message;
  }

  private async call(path: string, form: Record<string, string>): Promise<unknown> {
    let token = (await this.kv.get(TOKEN_KEY)) ?? (await this.login());
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await this.post(path, form, token);
      const tokenProblem = TOKEN_ERRORS.has(res.error ?? -1) || res.tokenStatus === 0;
      if (res.error === 0 && res.tokenStatus === 1) return res.message;
      if (tokenProblem && attempt === 0) {
        token = await this.login();
        continue;
      }
      throw new Error(`Eroare CEL (${res.error}): ${JSON.stringify(res.message)}`);
    }
    throw new Error('Eroare CEL: autentificarea a eșuat de două ori');
  }

  async updateStock(items: CelStockUpdate[]): Promise<CelUpdateResult> {
    const result: CelUpdateResult = { sent: 0, updated: 0, badList: [] };
    for (let i = 0; i < items.length; i += CEL_BATCH_SIZE) {
      const batch = items.slice(i, i + CEL_BATCH_SIZE);
      const msg = (await this.call('products/updateStockAndPrice/', {
        products: JSON.stringify(batch),
      })) as { updated?: unknown; bad_list?: unknown };
      result.sent += batch.length;
      if (Array.isArray(msg?.updated)) result.updated += msg.updated.length;
      else if (typeof msg?.updated === 'number') result.updated += msg.updated;
      if (Array.isArray(msg?.bad_list)) result.badList.push(...msg.bad_list);
    }
    return result;
  }
}
