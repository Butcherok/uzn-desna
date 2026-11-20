/** Множественное число «зміна» по правилам украинского языка. */
export function pluralChanges(n: number): string {
  const tail = n % 10;
  const tens = n % 100;
  if (tail === 1 && tens !== 11) return `${n} зміна`;
  if (tail >= 2 && tail <= 4 && (tens < 12 || tens > 14)) return `${n} зміни`;
  return `${n} змін`;
}
