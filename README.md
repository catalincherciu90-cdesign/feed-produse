# feed-produse

Aplicație Cloudflare Worker care, la fiecare 15 minute:

1. **citește feed-ul tău XML** de produse;
2. **actualizează stocul pe CEL.ro** prin API-ul CEL Marketplace (trimite doar produsele la care s-a schimbat stocul, plus o resincronizare completă o dată pe zi);
3. **publică un feed XML pentru clienți** cu disponibilitatea fiecărui produs: **stoc ≥ 10 = disponibil**, **sub 10 = indisponibil momentan**. Feed-ul nu conține stocul real.

## Feed-ul pentru clienți

URL: `https://<worker>.workers.dev/feed.xml` (sau `?token=...` dacă setezi `CLIENT_FEED_TOKEN`).

```xml
<?xml version="1.0" encoding="UTF-8"?>
<produse generat="2026-11-05T10:00:00.000Z" total="2">
  <produs>
    <cod>0012</cod>
    <nume>Periuță de dinți</nume>
    <disponibil>da</disponibil>
    <status>in stoc</status>
  </produs>
  <produs>
    <cod>0013</cod>
    <nume>Ață dentară</nume>
    <disponibil>nu</disponibil>
    <status>indisponibil momentan</status>
  </produs>
</produse>
```

Produsele fără stoc citibil în feed-ul sursă apar ca indisponibile.

## Cum citește feed-ul sursă

Aplicația caută automat lista de produse (cea mai mare listă de elemente din XML) și câmpurile:

| Ce caută | Nume recunoscute | Setare manuală |
|---|---|---|
| cod produs | `sku`, `cod`, `cod_produs`, `code`, `model`, `id` … | `FIELD_SKU` |
| stoc | `stoc`, `stock`, `cantitate`, `quantity`, `qty` … | `FIELD_STOCK` |
| nume | `nume`, `name`, `denumire`, `title` … | `FIELD_NAME` |

Dacă structura e mai neobișnuită, setează `SOURCE_ITEM_PATH` (ex. `catalog.produs`) și câmpurile manual. După prima rulare, `/status` îți arată ce câmpuri a folosit.

**Important:** codul produsului din feed trebuie să fie același cu `products_model` din contul CEL. Produsele pe care CEL nu le recunoaște apar în `/status` la `cel.badList`.

## Protecții

- Dacă feed-ul sursă nu se poate citi, nu se schimbă nimic (rămâne feed-ul vechi pentru clienți, nu se trimite nimic pe CEL).
- Dacă feed-ul are brusc cu peste 50% mai puține produse decât la rularea anterioară (`MAX_DROP_PERCENT`), sincronizarea se oprește. Asta previne golirea stocului pe CEL din cauza unui export greșit.
- Produsele care dispar din feed primesc stoc 0 pe CEL (`ZERO_MISSING_ON_CEL`).
- `CEL_STOCK_BUFFER` îți permite să păstrezi o rezervă: dacă e 10, pe CEL se trimite `stoc - 10`.

## Cerință: planul Workers Paid (5 USD/lună)

Pe planul gratuit, o rulare programată are voie la 10 ms de procesor. Planul Paid permite 30 de secunde ([limite Cloudflare](https://developers.cloudflare.com/workers/platform/limits/#cpu-time)). Doar citirea feed-ului spotvisionelectric.ro (8,4 MB, 5.678 produse) durează aproximativ 300 ms, deci pe planul gratuit rularea ar fi oprită.

## Instalare

```bash
npm install
```

```bash
npx wrangler login
```

```bash
npx wrangler kv namespace create FEED_KV
```

Pune id-ul primit în `wrangler.toml`, la `PUNE_AICI_ID_KV`. Apoi setează secretele:

```bash
npx wrangler secret put SOURCE_URL
```

```bash
npx wrangler secret put CEL_USERNAME
```

```bash
npx wrangler secret put CEL_PASSWORD
```

```bash
npx wrangler secret put ADMIN_TOKEN
```

Opțional: `SOURCE_AUTH` (dacă feed-ul cere autentificare) și `CLIENT_FEED_TOKEN`.

```bash
npm run deploy
```

### Prima rulare, recomandat în siguranță

1. Pune `CEL_ENABLED = "false"` în `wrangler.toml`, fă deploy și rulează manual:
   ```bash
   curl -X POST -H "Authorization: Bearer <ADMIN_TOKEN>" https://<worker>.workers.dev/sync
   ```
   Verifică în răspuns câmpurile detectate și deschide `/feed.xml`.
2. Activează CEL (`CEL_ENABLED = "true"`), eventual cu `CEL_DEMO = "true"` dacă ai cont de test de la CEL.
3. Verifică `/status` (`cel.badList` trebuie să fie gol sau să conțină doar produse care nu sunt pe CEL).

## Endpoint-uri

| Metodă | Cale | Acces | Ce face |
|---|---|---|---|
| GET | `/feed.xml` | public sau `CLIENT_FEED_TOKEN` | feed-ul de disponibilitate pentru clienți |
| GET | `/status` | `ADMIN_TOKEN` | rezultatul ultimei sincronizări |
| POST | `/sync` | `ADMIN_TOKEN` | rulează sincronizarea imediat |

## Dezvoltare

```bash
npm test
```

```bash
npm run typecheck
```

## Ce nu am putut confirma

- Durata de viață a token-ului CEL nu e documentată. Aplicația îl păstrează 12 ore și îl regenerează automat când CEL îl respinge.
- Wrapper-ul oficial CEL are suport opțional pentru autentificare cu certificat (mTLS, `apimtls-mp.cel.ro`). Aplicația folosește varianta cu user și parolă. Dacă CEL îți cere certificat, trebuie adăugat un binding mTLS în Cloudflare.

Sursa API: [wrapper-ul oficial CEL Marketplace](https://github.com/celdotro/marketplace) și [wiki-ul lui](https://github.com/celdotro/marketplace/wiki).
