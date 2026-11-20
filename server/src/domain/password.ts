import bcrypt from 'bcryptjs';

/**
 * Пароли (ТЗ 8.2, п. 4; 6.4): не короче 12 символов, проверка по короткому
 * списку очевидных паролей, без требований «заглавная, цифра, символ».
 * Хэш — bcrypt, cost 12. Библиотека — `bcryptjs` (чистый JavaScript):
 * ей не нужна сборка под машину на Render.
 */

export const BCRYPT_COST = 12;
export const PASSWORD_MIN_LENGTH = 12;
/**
 * bcrypt учитывает только первые 72 байта пароля, остальное молча
 * отбрасывает. Чтобы два разных длинных пароля не давали один хэш,
 * длиннее 72 байт новый пароль не принимается. Кириллическая буква
 * в UTF-8 — 2 байта, поэтому кириллицей это 36 знаков.
 */
export const PASSWORD_MAX_BYTES = 72;

/** Очевидные пароли длиной от 12 знаков. Сравнение без учёта регистра. */
const COMMON_PASSWORDS = new Set([
  '123456789012',
  '1234567890123',
  '12345678901234',
  '123456789000',
  '000000000000',
  '111111111111',
  '123123123123',
  '121212121212',
  'qwertyuiop12',
  'qwertyuiop123',
  'qwerty123456',
  '1q2w3e4r5t6y',
  '1qaz2wsx3edc',
  'qazwsxedcrfv',
  'asdfghjkl123',
  'zxcvbnm12345',
  'password1234',
  'password12345',
  'passwordpassword',
  'admin1234567',
  'administrator',
  'adminadminadmin',
  'iloveyou1234',
  'letmein12345',
  'welcome12345',
  'йцукенгшщзхї',
  'йцукенгшщзхъ',
  'фівапролджє',
  'пароль123456',
  'парольпароль',
  'київ12345678',
  'kyiv12345678',
  'ukraine12345',
  'україна12345',
  'slavaukraini',
  'славаукраїні',
  'uznadmin1234',
  'uzndesna1234',
  'zelenbud1234',
]);

export interface PasswordCheck {
  ok: boolean;
  message?: string;
}

/** Проверка нового пароля. Сообщения — для редактора, на украинском. */
export function checkNewPassword(password: string, login?: string): PasswordCheck {
  if ([...password].length < PASSWORD_MIN_LENGTH) {
    return { ok: false, message: `Пароль має бути не коротший за ${PASSWORD_MIN_LENGTH} символів` };
  }
  if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES) {
    return {
      ok: false,
      message: 'Пароль задовгий: до 72 символів латиницею або до 36 кирилицею',
    };
  }
  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lower) || COMMON_PASSWORDS.has(lower.replace(/\s+/g, ''))) {
    return { ok: false, message: 'Цей пароль занадто простий. Придумайте інший' };
  }
  if (new Set(lower).size <= 2) {
    return { ok: false, message: 'Цей пароль занадто простий. Придумайте інший' };
  }
  if (login && login.length >= 3 && lower.includes(login.toLowerCase())) {
    return { ok: false, message: 'Пароль не повинен містити логін' };
  }
  return { ok: true };
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** Формат хэша, который принимает `BOOTSTRAP_OWNER_PASSWORD_HASH`: bcrypt, cost не ниже 12. */
const BCRYPT_HASH_RE = /^\$2[aby]\$(\d{2})\$[./A-Za-z0-9]{53}$/;

export function isAcceptableBcryptHash(hash: string): boolean {
  const m = BCRYPT_HASH_RE.exec(hash);
  return m !== null && Number(m[1]) >= BCRYPT_COST;
}

/**
 * Хэш-пустышка для сравнения, когда логина нет: время ответа при неверном
 * логине и при неверном пароле одинаковое, и перебор не узнаёт, какие
 * логины существуют (ТЗ 8.2, п. 3). Считается один раз при первом обращении.
 */
let dummyHash: Promise<string> | undefined;
export function getDummyHash(): Promise<string> {
  dummyHash ??= bcrypt.hash('dummy-password-for-timing', BCRYPT_COST);
  return dummyHash;
}
