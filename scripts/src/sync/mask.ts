/**
 * Маскирование секретов в выводе и в `sync-state.json` (ТЗ 7.5, п. 6).
 * Значение заменяется на `***` целиком, без «последних четырёх символов».
 */

/** Значения длиннее этого порога маскируются: короткие совпадали бы с обычными словами. */
const MIN_SECRET_LENGTH = 6;

/** Шаблоны, которые маскируются независимо от списка секретов. */
const PATTERNS: readonly RegExp[] = [
  /(authorization\s*[:=]\s*)(?:bearer\s+)?[^\s,;"']+/giu,
  /(cookie\s*[:=]\s*)[^\n]+/giu,
  /([?&](?:access_token|token|key|password)=)[^&\s"']+/giu,
  /(mongodb(?:\+srv)?:\/\/)[^\s"']+/giu,
];

export function secretValues(env: NodeJS.ProcessEnv, names: readonly string[]): string[] {
  return names
    .map((name) => env[name])
    .filter((value): value is string => value !== undefined && value.length >= MIN_SECRET_LENGTH);
}

export function mask(text: string, secrets: readonly string[]): string {
  let out = text;
  for (const secret of secrets) out = out.split(secret).join('***');
  for (const pattern of PATTERNS) out = out.replace(pattern, '$1***');
  return out;
}
