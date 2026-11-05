import { describe, expect, it, vi } from 'vitest';
import { dispatchSync } from '../src/trigger';

const env = { GH_DISPATCH_TOKEN: 'tok', GH_REPO: 'o/r', GH_WORKFLOW: 'sync.yml', GH_REF: 'claude/happy-cray-ubjmi1' };

describe('dispatchSync', () => {
  it('cere GitHub-ului să pornească workflow-ul pe branch-ul corect', async () => {
    const f = vi.fn(async () => new Response(null, { status: 204 }));
    await dispatchSync(env, f as unknown as typeof fetch);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.github.com/repos/o/r/actions/workflows/sync.yml/dispatches');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect((init.headers as Record<string, string>)['User-Agent']).toBeTruthy();
    expect(JSON.parse(init.body as string)).toEqual({ ref: 'claude/happy-cray-ubjmi1' });
  });

  it('dă o eroare clară fără token sau când GitHub refuză', async () => {
    await expect(dispatchSync({ ...env, GH_DISPATCH_TOKEN: '' })).rejects.toThrow(/GH_DISPATCH_TOKEN/);
    const f = vi.fn(async () => new Response('{"message":"Bad credentials"}', { status: 401 }));
    await expect(dispatchSync(env, f as unknown as typeof fetch)).rejects.toThrow(/HTTP 401.*Bad credentials/);
  });
});
