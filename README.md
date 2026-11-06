# feed-produse

Sincronizare automată, fără costuri, pentru feed-ul de produse spotvisionelectric.ro.

Când apeși **„Sincronizează acum”** în panoul de admin:

1. **citește feed-ul XML** de produse;
2. **actualizează stocul pe CEL.ro**, ca să fie mereu identic cu feed-ul tău: produsele cu **sub 10 bucăți primesc stoc 0**, deci nu pot fi comandate. Restul primesc stocul real;
3. **publică un feed XML pentru clienți**: **stoc ≥ 10 = disponibil**, **sub 10 = indisponibil momentan**. Feed-ul nu conține stocul real.

## Arhitectură (0 lei/lună)

```
buton în /admin ──► Worker ──► pornește GitHub Actions
feed XML ──► GitHub Actions ──► API CEL.ro (stoc, opțional)
                     │
                     └──► Cloudflare KV ◄── Worker gratuit ──► /feed.xml pentru clienți
```

| Componentă | Ce face | De ce e gratuită |
|---|---|---|
| GitHub Actions | partea grea: citește 8,4 MB de XML, trimite pe CEL | minutele sunt gratuite pe repouri publice ([GitHub](https://docs.github.com/en/billing/concepts/product-billing/github-actions)) |
| Cloudflare KV | păstrează feed-urile, starea, istoricul, setările și excepțiile | ~480 scrieri/zi din 1.000 gratuite ([Cloudflare](https://developers.cloudflare.com/kv/platform/limits/)) |
| Cloudflare Worker | servește `/feed.xml`, `/cel.xml`, panoul `/admin` și pornește sincronizarea la cerere | doar citește din KV și face un apel la GitHub, consum minim de CPU, încape în planul gratuit |

### Limite de știut

- **Sincronizarea e manuală.** Stocul de pe CEL și din feed-ul clienților e cel de la ultima apăsare a butonului. Panoul arată cât de vechi sunt datele și te avertizează după o zi.
- Butonul are nevoie de secretul `GH_DISPATCH_TOKEN` (vezi mai jos). Fără el, sincronizarea se poate porni doar din GitHub: **Actions > Sincronizare feed > Run workflow**.
- Programarea automată din GitHub (`on: schedule`) nu a pornit deloc în teste, iar în 2026 există multe raportări de rulări programate pierdute ([discuție GitHub](https://github.com/orgs/community/discussions/185355)). De aceea nu se folosește.
- Repoul e public, deci codul se vede. Datele sensibile (link-ul feed-ului, parola CEL, token-urile) stau în **Secrets** și nu apar nicăieri.

## Regulile, pe scurt

| Stoc în feed-ul tău | Pe CEL se trimite | În feed-ul clienților |
|---|---|---|
| 0 - 9 | 0 (nu se poate comanda) | `disponibil: nu`, „indisponibil momentan” |
| 10 sau mai mult | stocul real | `disponibil: da`, „in stoc” |
| orice stoc, dar preț 0 sau lipsă | 0 (nu se poate comanda) | după stoc |
| peste stocul maxim (dacă e setat) | stocul maxim | după stoc |
| produsul dispare din feed | 0 | nu mai apare |

**Comenzile care trec sub prag sunt permise.** Dacă la sincronizare ai 12 bucăți, pe CEL apar 12. O comandă de 5 se plasează normal, chiar dacă rămâi cu 7. Pragul nu anulează comenzi, doar oprește comenzile noi: la următoarea sincronizare, stocul de 7 din feed devine 0 pe CEL. Pe CEL nu se poate comanda niciodată mai mult decât stocul real trimis.

Pragurile se schimbă din panoul de admin (tab-ul Setări) sau în `.github/workflows/sync.yml` (`AVAILABLE_MIN_STOCK`, `CEL_MIN_STOCK`, `CEL_STOCK_BUFFER`, `CEL_MAX_STOCK`).

## Feed-ul pentru CEL (rubrica Publicare > Feed)

URL: `https://feed-produse.<contul-tau>.workers.dev/cel.xml` (sau `?token=...` dacă setezi secretul `CEL_FEED_TOKEN`).

Are **exact aceeași structură și aceleași câmpuri** ca feed-ul tău de pe spotvisionelectric.ro (`Product_Code`, `Product_Name`, `Description`, …, `Stock`), deci maparea câmpurilor din CEL rămâne valabilă. Diferențele:

- lipsește rândul de titluri pe care exportul îl pune ca prim produs;
- lipsește caracterul invizibil (BOM) de la începutul fișierului;
- `Stock` e număr întreg; **sub 10 bucăți este 0**, deci produsul nu poate fi comandat pe CEL.

În adminul CEL înlocuiești linkul feed-ului cu cel de mai sus. Cât de des îl citește CEL depinde de setările lor (butonul cu ceasul de la feed).

**Câmpuri adăugate față de sursă:**

- `Image_Big`: imaginea principală mare (879x879), pusă imediat după `Size_200_x_200`, care e doar o miniatură de 200x200. Linkul se obține din miniatură, schimbând `_LIST.jpg` în `_big.jpg`, după regula Teamshare, verificată pe un eșantion de 40 de produse. În CEL, mapează imaginea principală pe `Image_Big`.

**Taxa verde** vine din câmpul `GreenTax` al feed-ului Teamshare și e copiată neschimbată. Valoarea e **cu TVA** și **nu e inclusă** în `PRET_LISTA`: site-ul o adaugă peste preț în coș (exemplu BR-BD60-00601: preț 72,60 lei + taxa verde 4,24 lei).

Prețul vine din câmpul `PRET_LISTA` al feed-ului Teamshare (preț **cu TVA**, 21%) și e copiat neschimbat. **Produsele cu preț 0 sau fără preț primesc stoc 0 pe CEL** (`CEL_BLOCK_ZERO_PRICE`), ca să nu poată fi comandate la 0 lei.

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
| `ADMIN_TOKEN` | o parolă lungă inventată de tine, pentru panoul `/admin` și `/status` | Worker (necesar pentru panou) |
| `CLIENT_FEED_TOKEN` | dacă vrei ca feed-ul clienților să ceară `?token=...` | Worker (opțional) |
| `CEL_FEED_TOKEN` | dacă vrei ca `/cel.xml` să ceară `?token=...` (recomandat: conține stocul real) | Worker (opțional) |
| `GH_DISPATCH_TOKEN` | token GitHub fine-grained: doar repo-ul `feed-produse`, permisiunea **Actions: Read and write** | Worker (necesar pentru butonul „Sincronizează acum”) |

**Tokenul `GH_DISPATCH_TOKEN`:** GitHub > poza de profil > **Settings** > **Developer settings** > **Personal access tokens** > **Fine-grained tokens** > **Generate new token**. La **Repository access** alegi **Only select repositories** > `feed-produse`. La **Permissions** > **Repository permissions** > **Actions** alegi **Read and write**. Pune-i o dată de expirare, de exemplu un an, și notează-ți să-l reînnoiești.

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

## Panoul de admin

Adresa: **https://feed-produse.catalincherciu90.workers.dev/admin**. Te loghezi cu `ADMIN_TOKEN`, secretul din GitHub. Sesiunea ține până închizi tab-ul.

| Tab | Ce face |
|---|---|
| **Status** | ultima sincronizare (reușită sau nu, erori), cifrele principale, linkurile feed-urilor cu buton de copiere, istoricul ultimelor 96 de rulări (o zi) |
| **Produse** | toate produsele, cu căutare după cod sau nume și filtre: comandabile pe CEL, sub prag, preț 0, blocate manual, disponibile la clienți. Pentru fiecare produs vezi stocul real, prețul, ce primește CEL și de ce |
| **Setări** | pragul pentru clienți, pragul pentru CEL, rezerva CEL, stocul maxim pe CEL, blocarea prețului 0. Au prioritate față de valorile din workflow. „Revino la valorile din workflow” le șterge |
| **Excepții** | regulile pe produs: **Blochează** (stoc 0 pe CEL / indisponibil la clienți) sau **Fără prag** (se vinde și sub prag, dacă are stoc). Regula prețului 0 rămâne activă și cu „Fără prag” |

Orice modificare din panou se aplică **la următoarea sincronizare**: apeși **„Sincronizează acum”** (sus, în dreapta). Durează de obicei sub un minut, iar pagina se actualizează singură când se termină. Butonul poate fi apăsat cel mult o dată pe minut.

Panoul rulează pe planul gratuit Cloudflare. Lista de produse e generată de sincronizare, iar filtrarea se face în browser.

## Endpoint-uri Worker

| Cale | Acces | Ce face |
|---|---|---|
| `/feed.xml` | public (sau `CLIENT_FEED_TOKEN`) | feed-ul pentru clienți |
| `/cel.xml` | public (sau `CEL_FEED_TOKEN`) | feed-ul pentru CEL |
| `/status` | `ADMIN_TOKEN` | rezultatul ultimei sincronizări (JSON) |
| `/admin` | `ADMIN_TOKEN` | panoul de admin |

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
