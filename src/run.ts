/**
 * Punct de intrare pentru GitHub Actions (Node.js).
 * Citește feed-ul, trimite stocul pe CEL și scrie feed-ul pentru clienți în Cloudflare KV.
 */
import { loadConfig, type Env } from './config';
import { CloudflareKvRest } from './kv';
import { runSync } from './sync';
import { autoSyncDue, lastRunFromStatus, readAutoSync } from './autoSync';
import { KV_KEYS } from './kv';

function required(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Lipsește variabila ${name}`);
  return v;
}

async function main(): Promise<void> {
  const kv = new CloudflareKvRest(required('CF_ACCOUNT_ID'), required('CF_KV_NAMESPACE_ID'), required('CF_API_TOKEN'));

  // Rulare programată (în fiecare oră): sincronizează doar dacă a trecut intervalul ales în panou.
  // Doar citiri din KV, deci o rulare sărită nu consumă din cele 1.000 de scrieri gratuite pe zi.
  if (process.env.GITHUB_EVENT_NAME === 'schedule') {
    const { hours } = await readAutoSync(kv);
    const last = lastRunFromStatus(await kv.get(KV_KEYS.status));
    if (!autoSyncDue(hours, last, Date.now())) {
      const why = hours ? `ultima sincronizare a fost acum ${Math.round((Date.now() - last) / 60000)} minute, intervalul e de ${hours} ore` : 'sincronizarea automată e oprită din panou';
      process.stdout.write(`Rulare programată sărită: ${why}.\n`);
      return;
    }
    await kv.put(KV_KEYS.autoSyncState, JSON.stringify({ lastAt: new Date().toISOString(), lastTryAt: new Date().toISOString() }));
  }
  const status = await runSync(loadConfig(process.env as unknown as Env), kv);

  const s = status.source;
  const c = status.cel;
  const lines = [
    `Produse: ${s?.products ?? '-'} | disponibile: ${s?.available ?? '-'} | indisponibile: ${s?.unavailable ?? '-'}`,
    `Feed CEL (/cel.xml): ${status.celFeed ? `${status.celFeed.products} produse, ${status.celFeed.orderable} comandabile, ${status.celFeed.blockedNoPrice} blocate fără preț, ${(status.celFeed.bytes / 1e6).toFixed(1)} MB` : 'negenerat'}`,
    `Catalog Facebook (/facebook.xml): ${status.facebookFeed ? `${status.facebookFeed.included} produse, ${status.facebookFeed.inStock} în stoc; excluse: ${status.facebookFeed.skipped.noPrice} fără preț, ${status.facebookFeed.skipped.noLink} fără link, ${status.facebookFeed.skipped.noImage} fără poză` : 'oprit'}`,
    `Date tehnice producător: ${status.bapp ? (status.bapp.error ? 'EROARE ' + status.bapp.error : `${status.bapp.products} produse, ${status.bapp.linked} legate de codurile tale (${status.bapp.byCode} după cod, ${status.bapp.byEan} după EAN)${status.bapp.changed ? ', actualizate' : ', neschimbate'}`) : 'oprit'}`,
    `Feed date tehnice (/date-tehnice.xml): ${status.techFeed ? `${status.techFeed.products} produse din ${status.techFeed.codes} coduri alese, ${status.techFeed.missing} negăsite, ${status.techFeed.columns} coloane, lista ${status.techFeed.from === 'panou' ? 'primită direct de la panou' : 'citită din KV'}` : 'nicio listă salvată'}`,
    `API CEL: ${c?.skipped ?? `mod ${c?.mode}, trimise ${c?.sent ?? 0}, actualizate ${c?.updated ?? 0}, respinse ${c?.badList?.length ?? 0}`}`,
  ];
  if (c?.badList?.length) lines.push(`Respinse de CEL (primele): ${JSON.stringify(c.badList.slice(0, 10))}`);
  if (status.error) lines.push(`EROARE: ${status.error}`);
  if (c?.error) lines.push(`EROARE CEL: ${c.error}`);
  process.stdout.write(lines.join('\n') + '\n');

  // Rezumat vizibil în pagina rulării din GitHub Actions
  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFileSync } = await import('node:fs');
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.map((l) => `- ${l}`).join('\n') + '\n');
  }

  if (!status.ok) process.exit(1);
}

main().catch((e) => {
  process.stderr.write(`EROARE: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
