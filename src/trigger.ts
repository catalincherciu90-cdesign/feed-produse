/**
 * Pornește workflow-ul de sincronizare din GitHub Actions (workflow_dispatch).
 * Rulează din cron-ul Worker-ului Cloudflare, pentru că rulările programate de GitHub
 * (on: schedule) nu sunt garantate și se pot pierde la ore aglomerate.
 */

export interface TriggerEnv {
  GH_DISPATCH_TOKEN?: string; // fine-grained PAT, doar repo-ul feed-produse, Actions: Read and write
  GH_REPO?: string; // owner/repo
  GH_WORKFLOW?: string; // ex. sync.yml
  GH_REF?: string; // branch-ul pe care rulează workflow-ul
}

export async function dispatchSync(env: TriggerEnv, fetchFn: typeof fetch = (i, init) => fetch(i, init)): Promise<void> {
  const token = env.GH_DISPATCH_TOKEN?.trim();
  if (!token) throw new Error('GH_DISPATCH_TOKEN nu este setat pe Worker: sincronizarea automată nu poate porni');
  const repo = env.GH_REPO?.trim();
  const workflow = env.GH_WORKFLOW?.trim();
  const ref = env.GH_REF?.trim();
  if (!repo || !workflow || !ref) throw new Error('Lipsesc GH_REPO, GH_WORKFLOW sau GH_REF în wrangler.toml');

  const url = `https://api.github.com/repos/${repo}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`;
  const res = await fetchFn(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'feed-produse-worker',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ref }),
  });
  // GitHub răspunde 204 (fără conținut) sau 200 la succes.
  if (res.status !== 204 && res.status !== 200) {
    const text = (await res.text()).slice(0, 300);
    throw new Error(`GitHub a refuzat pornirea sincronizării: HTTP ${res.status} ${text}`);
  }
}
