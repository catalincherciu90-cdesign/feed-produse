/**
 * Validare coduri de bare GTIN (EAN-8, UPC-A/GTIN-12, EAN-13, GTIN-14): doar cifre,
 * lungime acceptată și cifra de control corectă (algoritmul GS1, ponderi 3 și 1).
 */
export function isValidGtin(code: string | undefined | null): boolean {
  const e = (code ?? '').trim();
  if (!/^\d+$/.test(e) || ![8, 12, 13, 14].includes(e.length)) return false;
  const digits = e.split('').map(Number);
  const check = digits.pop()!;
  let sum = 0;
  digits.reverse().forEach((d, i) => {
    sum += d * (i % 2 === 0 ? 3 : 1);
  });
  return (10 - (sum % 10)) % 10 === check;
}
