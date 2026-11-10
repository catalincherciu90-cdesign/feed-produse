import { describe, expect, it, vi } from 'vitest';
import { runAutoSync, validateAutoSync } from '../src/autoSync';
import { decodeCodesInput } from '../src/codesInput';
import { KV_KEYS } from '../src/kv';

class FakeKV {
  store = new Map<string, string>();
  async get(key: string) {
    return this.store.get(key) ?? null;
  }
  async put(key: string, value: string) {
    this.store.set(key, value);
  }
}

const H = 3600_000;
const NOW = Date.parse('2026-11-10T12:17:00Z');

function setup(lastRunMsAgo?: number) {
  const kv = new FakeKV();
  if (lastRunMsAgo !== undefined) kv.store.set(KV_KEYS.status, JSON.stringify({ startedAt: new Date(NOW - lastRunMsAgo).toISOString() }));
  const env = { FEED_KV: kv as unknown as KVNamespace, GH_DISPATCH_TOKEN: 'gh', GH_REPO: 'o/r', GH_WORKFLOW: 'sync.yml', GH_REF: 'main' };
  const f = vi.fn(async () => new Response(null, { status: 204 }));
  return { kv, env, f, run: (now = NOW) => runAutoSync(env, now, f as unknown as typeof fetch) };
}

describe('sincronizare automată', () => {
  it('implicit pornește în fiecare oră, cu lista pentru /date-tehnice.xml inclusă', async () => {
    const { kv, f, run } = setup(65 * 60_000);
    kv.store.set(KV_KEYS.bappFeedCodes, JSON.stringify({ savedAt: 5, codes: ['BR-1'] }));
    expect(await run()).toBe('started');
    const body = JSON.parse((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect((await decodeCodesInput(body.inputs.feed_codes))?.codes).toEqual(['BR-1']);
    expect(JSON.parse(kv.store.get(KV_KEYS.autoSyncState)!).lastAt).toBe(new Date(NOW).toISOString());
  });

  it('nu pornește dacă a rulat de curând o sincronizare (și cea manuală contează)', async () => {
    const { f, run } = setup(20 * 60_000);
    expect(await run()).toBe('not-due');
    expect(f).not.toHaveBeenCalled();
  });

  it('respectă intervalul ales și oprirea', async () => {
    const { kv, f, run } = setup(3 * H);
    kv.store.set(KV_KEYS.autoSync, JSON.stringify({ hours: 6 }));
    expect(await run()).toBe('not-due');
    expect(await run(NOW + 3 * H)).toBe('started');
    kv.store.set(KV_KEYS.autoSync, JSON.stringify({ hours: 0 }));
    expect(await run(NOW + 30 * H)).toBe('off');
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('nu pornește de două ori la rând dacă sincronizarea încă rulează', async () => {
    const { run } = setup(5 * H);
    expect(await run()).toBe('started');
    expect(await run(NOW + 60_000)).toBe('not-due');
  });

  it('pornește și la prima rulare, fără nicio sincronizare anterioară', async () => {
    const { run } = setup();
    expect(await run()).toBe('started');
  });

  it('ține minte eroarea, ca panoul să o arate', async () => {
    const { kv, env } = setup(5 * H);
    const f = vi.fn(async () => new Response('{"message":"Bad credentials"}', { status: 401 }));
    expect(await runAutoSync(env, NOW, f as unknown as typeof fetch)).toBe('failed');
    expect(JSON.parse(kv.store.get(KV_KEYS.autoSyncState)!).error).toMatch(/HTTP 401/);
  });

  it('acceptă doar intervalele din listă', () => {
    expect(validateAutoSync({ hours: 2 })).toEqual({ hours: 2 });
    expect(() => validateAutoSync({ hours: 5 })).toThrow();
    expect(() => validateAutoSync({ hours: '1' })).toThrow();
  });
});
