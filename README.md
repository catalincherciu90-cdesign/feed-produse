# feed-produse

Sincronizare automată, fără costuri, pentru feed-ul de produse spotvisionelectric.ro.

La fiecare 15 minute:

1. **citește feed-ul XML** de produse;
2. **actualizează stocul pe CEL.ro**: produsele cu **sub 10 bucăți primesc stoc 0**, deci nu pot fi comandate. Restul primesc stocul real;
3. **publică un feed XML pentru clienți**: **stoc ≥ 10 = disponibil**, **sub 10 = indisponibil momentan**. Feed-ul nu conține stocul real.

## Arhitectură (0 lei/lună)

```
feed XML ──► GitHub Actions (la 15 min) ──► API CEL.ro (stoc)
                     │
                     └──► Cloudflare KV ◄── Worker gratuit ──► /feed.xml pentru clienți
```

| Componentă | Ce face | De ce e gratuită |
|---|---|---|
| GitHub Actions | partea grea: citește 8,4 MB de XML, trimite pe CEL | minutele sunt gratuite pe repouri publice ([GitHub](https://docs.github.com/en/billing/concepts/product-billing/github-actions)) |
| Cloudflare KV | păstrează feed-ul și starea sincronizării | ~480 scrieri/zi din 1.000 gratuite ([Cloudflare](https://developers.cloudflare.com/kv/platform/limits/)) |
| Cloudflare Worker | servește `/feed.xml` | doar citește din KV, consum minim de CPU, încape în planul gratuit |

### Limite de știut

- **GitHub poate întârzia rulările programate** la ore aglomerate, deci „la 15 minute” poate însemna uneori 20-30 de minute.
- **GitHub oprește automat rulările programate dacă repoul nu are activitate 60 de zile** ([GitHub](https://docs.github.com/en/actions/using-workflows/disabling-and-enabling-a-workflow)). Se repornesc din tab-ul **Actions**, cu butonul **Enable workflow**.
- Repoul e public, deci codul se vede. Datele sensibile (link-ul feed-ului, parola CEL, token-urile) stau în **Secrets** și nu apar nicăieri.

## Regulile, pe scurt

| Stoc în feed-ul tău | Pe CEL se trimite | În feed-ul clienților |
|---|---|---|
| 0 - 9 | 0 (nu se poate comanda) | `disponibil: nu`, „indisponibil momentan” |
| 10 sau mai mult | stocul real | `disponibil: da`, „in stoc” |
| produsul dispare din feed | 0 | nu mai apare |

Pragurile se schimbă în `.github/workflows/sync.yml` (`AVAILABLE_MIN_STOCK`, `CEL_MIN_STOCK`, `CEL_STOCK_BUFFER`).

## Feed-ul pentru clienți

URL: `https://feed-produse.<contul-tau>.workers.dev/feed.xml`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<produse generat="2026-11-05T10:00:00.000Z" total="5678">
  <produs>
    <cod>BL-1KMP-F</cod>
    <nume>PRIZA APLICATA 1x16A CAUCIUC/CAPAC IP44 NEGRU</nume>
    <disponibil>da</disponibil>
    <status>in stoc</status>
  </produs>
</produse>
```

## Instalare, pas cu pas

### 1. Cloudflare (o singură dată)

```bash
npm install
```

```bash
npx wrangler login
```

```bash
npx wrangler kv namespace create FEED_KV
```

Pune id-ul primit în `wrangler.toml` (în locul `PUNE_AICI_ID_KV`), apoi:

```bash
npx wrangler secret put ADMIN_TOKEN
```

```bash
npm run deploy
```

Creează un API token în Cloudflare (**My Profile > API Tokens > Create Token**), cu permisiunea **Account > Workers KV Storage > Edit**. Notează și **Account ID** (apare în dashboard, în dreapta, pe pagina Workers).

### 2. GitHub (o singură dată)

În repo: **Settings > Secrets and variables > Actions > Secrets > New repository secret**:

| Secret | Valoare |
|---|---|
| `SOURCE_URL` | link-ul feed-ului XML |
| `CEL_USERNAME` | user API CEL |
| `CEL_PASSWORD` | parolă API CEL |
| `CF_ACCOUNT_ID` | Account ID Cloudflare |
| `CF_KV_NAMESPACE_ID` | id-ul namespace-ului FEED_KV |
| `CF_API_TOKEN` | token-ul creat la pasul 1 |

### 3. Prima rulare, în siguranță

Workflow-ul pornește cu **CEL oprit** (`CEL_ENABLED` e `false` până îl activezi tu).

1. Tab-ul **Actions > Sincronizare feed > Run workflow**. Verifică rezumatul rulării și deschide `/feed.xml`.
2. Când totul arată bine, activează CEL: **Settings > Secrets and variables > Actions > Variables > New repository variable**, `CEL_ENABLED` = `true`.
3. Rulează din nou și verifică în rezumat câte produse a respins CEL. Produsele respinse sunt, de obicei, cele care nu există pe CEL cu același cod.

Workflow-ul trebuie să existe pe branch-ul implicit al repoului ca să ruleze programat.

## Protecții

- Dacă feed-ul sursă nu se poate citi, nu se schimbă nimic.
- Dacă feed-ul are brusc cu peste 50% mai puține produse (`MAX_DROP_PERCENT`), sincronizarea se oprește. Asta previne golirea stocului pe CEL din cauza unui export greșit.
- Rândul de titluri pe care exportul îl pune ca prim produs e ignorat.
- Pe CEL se trimit doar produsele cu stocul schimbat, plus o resincronizare completă o dată pe zi.

## Endpoint-uri Worker

| Cale | Acces | Ce face |
|---|---|---|
| `/feed.xml` | public (sau `CLIENT_FEED_TOKEN`) | feed-ul pentru clienți |
| `/status` | `ADMIN_TOKEN` | rezultatul ultimei sincronizări |

## Dezvoltare

```bash
npm test
```

```bash
npm run typecheck
```

## Ce nu am putut confirma

- Durata de viață a token-ului CEL nu e documentată. Aplicația îl păstrează 12 ore și îl regenerează automat când CEL îl respinge.
- Wrapper-ul oficial CEL are opțional autentificare cu certificat (mTLS). Aplicația folosește user și parolă.

Sursa API: [wrapper-ul oficial CEL Marketplace](https://github.com/celdotro/marketplace) și [wiki-ul lui](https://github.com/celdotro/marketplace/wiki).
