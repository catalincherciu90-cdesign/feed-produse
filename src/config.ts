/** Variabile de mediu (în GitHub Actions vin din process.env). */
export interface Env {
  // Sursa
  SOURCE_URL: string;
  SOURCE_AUTH?: string; // ex. "Basic xxx" sau "Bearer xxx", trimis ca header Authorization
  SOURCE_ITEM_PATH?: string; // ex. "products.product"; gol = detectare automată
  FIELD_SKU?: string;
  FIELD_STOCK?: string;
  FIELD_NAME?: string;
  FIELD_PRICE?: string;
  FIELD_IMAGE?: string;
  FIELD_GALLERY?: string;
  FIELD_GREEN_TAX?: string;

  // Reguli
  AVAILABLE_MIN_STOCK?: string; // implicit 10: stoc >= 10 = disponibil
  CEL_MIN_STOCK?: string; // implicit = AVAILABLE_MIN_STOCK: sub prag se trimite 0 pe CEL
  CEL_BLOCK_ZERO_PRICE?: string; // implicit "true": preț 0 sau lipsă => stoc 0 pe CEL
  CEL_MAX_STOCK?: string; // implicit 0 = fără limită: stocul maxim trimis pe CEL
  CEL_STOCK_BUFFER?: string; // implicit 0: câte bucăți rezervi (nu le trimiți pe CEL)
  ZERO_MISSING_ON_CEL?: string; // implicit "true"
  MAX_DROP_PERCENT?: string; // implicit 50: oprește sync-ul dacă feed-ul scade brusc

  // CEL
  CEL_FEED_ENABLED?: string; // implicit "true": generează feed-ul /cel.xml
  CEL_ENABLED?: string; // implicit "true" (API CEL)
  CEL_PUSH_ALL?: string; // implicit "true": trimite toate produsele la fiecare rulare
  CEL_USERNAME?: string;
  CEL_PASSWORD?: string;
  CEL_API_URL?: string; // implicit https://api-mp.cel.ro/market_api/
  CEL_DEMO?: string; // "true" = trimite header DEMO: 1

  // Feed clienți
  CLIENT_FEED_EXTRA_FIELDS?: string; // ex. "ean,brand": câmpuri din sursă copiate în feed

  // Feed CEL: imagine mare derivată din miniatură (…_LIST.jpg => …_big.jpg)
  CEL_BIG_IMAGE_FROM?: string; // ex. Size_200_x_200
  CEL_BIG_IMAGE_FIELD?: string; // ex. Image_Big
  // Feed CEL: câmp nou cu prețul + taxa verde (necesită FIELD_PRICE și FIELD_GREEN_TAX)
  CEL_PRICE_WITH_TAX_FIELD?: string; // ex. PRET_FINAL
  // Feed CEL: câmpuri din sursă care nu apar în feed, separate prin virgulă (ex. GreenTax)
  CEL_FEED_DROP_FIELDS?: string;
}

export interface Config {
  sourceUrl: string;
  sourceAuth?: string;
  itemPath?: string;
  fields: { sku?: string; stock?: string; name?: string; price?: string; image?: string; gallery?: string; greenTax?: string };
  availableMinStock: number;
  celMinStock: number;
  celStockBuffer: number;
  celMaxStock: number;
  celBlockZeroPrice: boolean;
  zeroMissingOnCel: boolean;
  maxDropPercent: number;
  celFeedEnabled: boolean;
  celEnabled: boolean;
  celPushAll: boolean;
  celUsername?: string;
  celPassword?: string;
  celApiUrl: string;
  celDemo: boolean;
  clientFeedExtraFields: string[];
  celBigImage?: { from: string; to: string };
  celPriceWithTaxField?: string;
  celFeedDropFields: string[];
}

function num(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`Valoare numerică invalidă în configurare: "${value}"`);
  }
  return n;
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === '') return fallback;
  return ['1', 'true', 'da', 'yes'].includes(value.trim().toLowerCase());
}

function opt(value: string | undefined): string | undefined {
  return value && value.trim() !== '' ? value.trim() : undefined;
}

export function loadConfig(env: Env): Config {
  if (!opt(env.SOURCE_URL)) throw new Error('SOURCE_URL nu este setat');
  const apiUrl = opt(env.CEL_API_URL) ?? 'https://api-mp.cel.ro/market_api/';
  return {
    sourceUrl: env.SOURCE_URL.trim(),
    sourceAuth: opt(env.SOURCE_AUTH),
    itemPath: opt(env.SOURCE_ITEM_PATH),
    fields: {
      sku: opt(env.FIELD_SKU),
      stock: opt(env.FIELD_STOCK),
      name: opt(env.FIELD_NAME),
      price: opt(env.FIELD_PRICE),
      image: opt(env.FIELD_IMAGE),
      gallery: opt(env.FIELD_GALLERY),
      greenTax: opt(env.FIELD_GREEN_TAX),
    },
    availableMinStock: num(env.AVAILABLE_MIN_STOCK, 10),
    celMinStock: num(env.CEL_MIN_STOCK, num(env.AVAILABLE_MIN_STOCK, 10)),
    celStockBuffer: num(env.CEL_STOCK_BUFFER, 0),
    celMaxStock: num(env.CEL_MAX_STOCK, 0),
    celBlockZeroPrice: bool(env.CEL_BLOCK_ZERO_PRICE, true),
    zeroMissingOnCel: bool(env.ZERO_MISSING_ON_CEL, true),
    maxDropPercent: num(env.MAX_DROP_PERCENT, 50),
    celFeedEnabled: bool(env.CEL_FEED_ENABLED, true),
    celEnabled: bool(env.CEL_ENABLED, true),
    celPushAll: bool(env.CEL_PUSH_ALL, true),
    celUsername: opt(env.CEL_USERNAME),
    celPassword: opt(env.CEL_PASSWORD),
    celApiUrl: apiUrl.endsWith('/') ? apiUrl : `${apiUrl}/`,
    celDemo: bool(env.CEL_DEMO, false),
    clientFeedExtraFields: (env.CLIENT_FEED_EXTRA_FIELDS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    celBigImage:
      opt(env.CEL_BIG_IMAGE_FROM) && opt(env.CEL_BIG_IMAGE_FIELD)
        ? { from: opt(env.CEL_BIG_IMAGE_FROM)!, to: opt(env.CEL_BIG_IMAGE_FIELD)! }
        : undefined,
    celPriceWithTaxField: opt(env.CEL_PRICE_WITH_TAX_FIELD),
    celFeedDropFields: (env.CEL_FEED_DROP_FIELDS ?? '').split(',').map((x) => x.trim()).filter(Boolean),
  };
}
