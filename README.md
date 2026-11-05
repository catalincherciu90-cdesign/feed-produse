# feed-produse

Sincronizare automată, fără costuri, pentru feed-ul de produse spotvisionelectric.ro.

La fiecare 15 minute:

1. **citește feed-ul XML** de produse;
2. **actualizează stocul pe CEL.ro**, ca să fie mereu identic cu feed-ul tău: produsele cu **sub 10 bucăți primesc stoc 0**, deci nu pot fi comandate. Restul primesc stocul real;
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

**Comenzile care trec sub prag sunt permise.** Dacă la sincronizare ai 12 bucăți, pe CEL apar 12. O comandă de 5 se plasează normal, chiar dacă rămâi cu 7. Pragul nu anulează comenzi, doar oprește comenzile noi: la următoarea sincronizare, stocul de 7 din feed devine 0 pe CEL. Pe CEL nu se poate comanda niciodată mai mult decât stocul real trimis.

Pragurile se schimbă în `.github/workflows/sync.yml` (`AVAILABLE_MIN_STOCK`, `CEL_MIN_STOCK`, `CEL_STOCK_BUFFER`).

## Feed-ul pentru CEL (rubrica Publicare > Feed)

URL: `https://feed-produse.<contul-tau>.workers.dev/cel.xml` (sau `?token=...` dacă setezi secretul `CEL_FEED_TOKEN`).

Are **exact aceeași structură și aceleași câmpuri** ca feed-ul tău de pe spotvisionelectric.ro (`Product_Code`, `Product_Name`, `Description`, …, `Stock`), deci maparea câmpurilor din CEL rămâne valabilă. Diferențele:

- lipsește rândul de titluri pe care exportul îl pune ca prim produs;
- lipsește caracterul invizibil (BOM) de la începutul fișierului;
- `Stock` e număr întreg; **sub 10 bucăți este 0**, deci produsul nu poate fi comandat pe CEL.

În adminul CEL înlocuiești linkul feed-ului cu cel de mai sus. Cât de des îl citește CEL depinde de setările lor (butonul cu ceasul de la feed).

Limită: feed-ul tău nu conține preț. Dacă CEL cere prețul, trebuie adăugat în exportul de pe site.

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

Totul se face din browser, nu trebuie instalat nimic pe calculator.

### 1. Cloudflare (o singură dată)

1. **Namespace KV:** în dashboard, **Storage & Databases > Workers KV > Create**, cu numele `feed-produse`. Notează id-ul.
2. **API token:** **My Profile > API Tokens > Create Token > Create Custom Token**, cu permisiunile:
   - **Account > Workers Scripts > Edit** (pentru deploy)
   - **Account > Workers KV Storage > Edit** (pentru sincronizare)
3. **Account ID:** apare în dashboard, pe pagina **Workers & Pages**, în dreapta.

### 2. GitHub (o singură dată)

În repo: **Settings > Secrets and variables > Actions > Secrets > New repository secret**:

| Secret | Valoare | Folosit de |
|---|---|---|
| `CF_API_TOKEN` | token-ul de la pasul 1 | deploy + sincronizare |
| `CF_ACCOUNT_ID` | Account ID Cloudflare | deploy + sincronizare |
| `CF_KV_NAMESPACE_ID` | id-ul namespace-ului KV | deploy + sincronizare |
| `SOURCE_URL` | link-ul feed-ului XML | sincronizare |
| `CEL_USERNAME` | user API CEL | sincronizare |
| `CEL_PASSWORD` | parolă API CEL | sincronizare |
| `ADMIN_TOKEN` | o parolă lungă inventată de tine, pentru `/status` | Worker (opțional) |
| `CLIENT_FEED_TOKEN` | dacă vrei ca feed-ul clienților să ceară `?token=...` | Worker (opțional) |
| `CEL_FEED_TOKEN` | dacă vrei ca `/cel.xml` să ceară `?token=...` (recomandat: conține stocul real) | Worker (opțional) |

Apoi publică Worker-ul: **Actions > Deploy Worker > Run workflow**. Workflow-ul rulează testele, pune id-ul KV în configurare, face deploy și setează secretele Worker-ului. Rulează automat și la orice modificare a codului Worker-ului.

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
- La fiecare rulare se trimite pe CEL stocul tuturor produselor (`CEL_PUSH_ALL`), deci CEL arată mereu ce e în feed-ul tău, chiar dacă stocul s-a modificat între timp pe partea CEL. Cu `CEL_PUSH_ALL: "false"` se trimit doar produsele schimbate, plus o resincronizare completă pe zi.

## Endpoint-uri Worker

| Cale | Acces | Ce face |
|---|---|---|
| `/feed.xml` | public (sau `CLIENT_FEED_TOKEN`) | feed-ul pentru clienți |
| `/cel.xml` | public (sau `CEL_FEED_TOKEN`) | feed-ul pentru CEL |
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
