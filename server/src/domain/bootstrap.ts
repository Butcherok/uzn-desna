import { LOGIN_RE } from './auth-schemas.js';
import { DuplicateKeyError, type Store } from './model.js';
import { isAcceptableBcryptHash } from './password.js';

/**
 * Первый владелец (ТЗ 9.2, п. 2): создаётся при запуске, если учётных
 * записей нет и заданы `BOOTSTRAP_OWNER_LOGIN` и `BOOTSTRAP_OWNER_PASSWORD_HASH`.
 * Пароль в открытом виде в окружение не попадает — только bcrypt-хэш.
 */

export type BootstrapOutcome =
  | 'created'
  | 'skipped-users-exist'
  | 'skipped-users-exist-vars-left'
  | 'skipped-no-vars'
  | 'rejected-bad-login'
  | 'rejected-bad-hash';

export interface BootstrapInput {
  login: string;
  passwordHash: string;
  displayName: string;
}

export async function bootstrapOwner(
  store: Store,
  input: BootstrapInput | null,
  now: Date,
): Promise<BootstrapOutcome> {
  const users = await store.countUsers();
  if (users > 0) return input ? 'skipped-users-exist-vars-left' : 'skipped-users-exist';
  if (!input) return 'skipped-no-vars';
  if (!LOGIN_RE.test(input.login)) return 'rejected-bad-login';
  if (!isAcceptableBcryptHash(input.passwordHash)) return 'rejected-bad-hash';
  try {
    const user = await store.createUser({
      login: input.login,
      displayName: input.displayName,
      passwordHash: input.passwordHash,
      role: 'owner',
      active: true,
      mustChangePassword: false,
      createdAt: now,
      lastLoginAt: null,
      passwordChangedAt: now,
    });
    await store.appendLog({
      at: now,
      userId: user.id,
      action: 'user.bootstrap',
      entity: 'user',
      entityId: user.id,
      result: 'ok',
      details: { login: user.login, role: 'owner' },
    });
    return 'created';
  } catch (err) {
    // Два экземпляра стартовали одновременно: второй упёрся в уникальный логин.
    if (err instanceof DuplicateKeyError) return 'skipped-users-exist';
    throw err;
  }
}

/** Строка для журнала процесса: что произошло и что делать владельцу. */
export const BOOTSTRAP_MESSAGES: Record<BootstrapOutcome, string> = {
  created:
    'Owner account created from BOOTSTRAP_* variables. Remove them from the service settings now.',
  'skipped-users-exist': 'Users exist; bootstrap not needed.',
  'skipped-users-exist-vars-left':
    'Users exist, but BOOTSTRAP_* variables are still set. Remove them from the service settings.',
  'skipped-no-vars':
    'No users and no BOOTSTRAP_* variables: nobody can sign in. Set BOOTSTRAP_OWNER_LOGIN and BOOTSTRAP_OWNER_PASSWORD_HASH.',
  'rejected-bad-login':
    'BOOTSTRAP_OWNER_LOGIN is invalid: 3–32 chars, lowercase latin letters, digits, ".", "_", "-".',
  'rejected-bad-hash':
    'BOOTSTRAP_OWNER_PASSWORD_HASH is not a bcrypt hash with cost >= 12. Generate it with `npm run hash-password`.',
};
