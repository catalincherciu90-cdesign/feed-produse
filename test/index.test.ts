import { describe, expect, it } from 'vitest';
import worker, { PUBLIC_HOST } from '../src/index';

const env = { FEED_KV: { get: async () => null } as unknown as KVNamespace } as never;

describe('redirect spre domeniul propriu', () => {
  it('trimite linkurile workers.dev spre feed.spotvisionelectric.ro, păstrând calea și parametrii', async () => {
    const res = await worker.fetch(new Request('https://feed-produse.x.workers.dev/cel.xml?token=abc'), env);
    expect(res.status).toBe(301);
    expect(res.headers.get('Location')).toBe(`https://${PUBLIC_HOST}/cel.xml?token=abc`);
  });

  it('nu redirecționează cererile venite prin domeniul propriu', async () => {
    const res = await worker.fetch(new Request('https://feed-produse.x.workers.dev/date-tehnice.xml', { headers: { 'X-Forwarded-Host': PUBLIC_HOST } }), env);
    expect(res.status).not.toBe(301);
    const direct = await worker.fetch(new Request(`https://${PUBLIC_HOST}/date-tehnice.xml`), env);
    expect(direct.status).not.toBe(301);
  });
});
