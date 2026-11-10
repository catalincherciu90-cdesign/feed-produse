/**
 * Maparea categoriilor făcută manual (de Claude), pe lângă cea învățată din produsele existente.
 *
 * - FAMILY_CATEGORIES: categoria pentru familii Braytron care nu aveau produse pe site (deci nimic
 *   de învățat) sau la care categoria majoritară nu se potrivea cu produsele.
 * - NAME_RULES: în unele familii, produsele stau pe site în categorii diferite după tipul din nume
 *   (ex. „Becuri glob”: P45 -> A60/P45/G45, G95 -> Globe Bulbs). Prima regulă care se potrivește câștigă.
 *
 * Toate categoriile de aici există pe site (verificat față de feed-ul Teamshare, 9 nov. 2026).
 * Corecturile din panou au prioritate față de tot ce e aici.
 */

export const FAMILY_CATEGORIES: Record<string, string> = {
  // Fără produse pe site până acum
  'Electrice / Flexible Pipe': 'Trasee Cabluri/Tub Flexibil Metalic', // spirală metalică pentru cabluri
  'Iluminat Exterior / Lumină de perete tip wall washer': 'Iluminat exterior/Corp LED PT', // ca restul lămpilor LED de perete
  'CLS LED Decorativ / Pendul': 'Decorative/Sticla transparenta', // DELIA, sticlă fumurie: de verificat
  // Majoritatea de pe site nu se potrivea cu produsele
  'Iluminat Exterior / Corp LED etanș': 'Iluminat exterior/Corp lineer proline IP65', // toate sunt PROLINE IP65
  'Bandă LED / Bandă LED 220V': 'Benzi LED/Banda LED 220V', // ECOLINE; COBLINE merge la Neon (regulă)
};

export interface NameRule {
  family: string;
  match: RegExp; // pe numele produsului de la producător
  category: string;
}

export const NAME_RULES: NameRule[] = [
  { family: 'Bandă LED / Bandă LED 220V', match: /COBLINE|NEON/i, category: 'Benzi LED/Neon LED 220V' },
  { family: 'Becuri & Tuburi / Becuri glob', match: /-SFT-/i, category: 'Becuri si tuburi/Filament Bulbs' },
  { family: 'Becuri & Tuburi / Becuri glob', match: /-G(80|95|120|125)-/i, category: 'Becuri si tuburi/Globe Bulbs' },
  { family: 'Becuri & Tuburi / Becuri glob', match: /-(P45|G45)-/i, category: 'Becuri si tuburi/Becuri Led A60/P45/G45' },
  { family: 'Becuri & Tuburi / Becuri filament', match: /-C35T?-/i, category: 'Becuri si tuburi/Becuri lumanare' },
  { family: 'Becuri & Tuburi / Becuri filament', match: /./, category: 'Becuri si tuburi/Filament Bulbs' },
  { family: 'Becuri & Tuburi / Becuri formă A', match: /-DIM-/i, category: 'Becuri si tuburi/Becuri led dimabile, cu baterii, cu led' },
  { family: 'Becuri & Tuburi / Becuri formă A', match: /./, category: 'Becuri si tuburi/Becuri Led A60/P45/G45' },
  { family: 'Iluminat Interior / Spot LED', match: /MINISPOT/i, category: 'Iluminat interior/Spoturi LED' },
  { family: 'Iluminat Interior / Spot LED', match: /./, category: 'Iluminat interior/Spot LED' },
  { family: 'Iluminat Interior / Plafonieră', match: /-SNS-/i, category: 'Iluminat interior/Aplica tavan' },
  { family: 'Iluminat Interior / Plafonieră', match: /CEILING-D\d/i, category: 'Iluminat interior/Plafoniere LED' },
  { family: 'Iluminat Interior / Plafonieră', match: /JADE/i, category: 'Iluminat interior/Spoturi LED' }, // ca pe site acum
  { family: 'Electrice / Prelungitor', match: /IPLINE/i, category: 'Accesorii/Accesorii Braytron' },
  { family: 'Electrice / Prelungitor', match: /./, category: 'Aparataj Electric/Prelungitoare/Prelungitoare Braytron' },
  { family: 'LED Decorativ / Lampă de birou LED', match: /DESK/i, category: 'Iluminat Decorative LED/Lampi LED de birou' },
  { family: 'LED Decorativ / Lampă de birou LED', match: /TABLE/i, category: 'Iluminat Decorative LED/Lampi LED de masa' },
];

/** Familii pentru care pe site nu există o categorie potrivită: trebuie create întâi în Teamshare. */
export const NEEDS_NEW_CATEGORY: Record<string, string> = {
  'Electrice / Întrerupător și priză': 'Aparataj Electric/Aparataje Monobloc/Gama Linea Braytron',
};

/** Categoria sugerată pentru un produs: regulă după nume, apoi categoria manuală a familiei. */
export function curatedCategory(family: string, name: string): string {
  for (const r of NAME_RULES) if (r.family === family && r.match.test(name)) return r.category;
  return FAMILY_CATEGORIES[family] || '';
}
