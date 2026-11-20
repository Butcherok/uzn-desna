/**
 * `npm run hash-password` — хэш пароля для `BOOTSTRAP_OWNER_PASSWORD_HASH`
 * (ТЗ 9.2, п. 2). Запускается владельцем на своём компьютере. Пароль
 * вводится дважды и не отображается на экране; выводится только хэш.
 * Пароль не пишется ни в файл, ни в историю команд.
 */
import { checkNewPassword, hashPassword } from '../domain/password.js';

function readHidden(prompt: string): Promise<string> {
  const { stdin, stdout } = process;
  // Ввод через конвейер (не терминал): одна строка без скрытия — для проверок.
  if (!stdin.isTTY) {
    return new Promise((resolve) => {
      let data = '';
      stdin.setEncoding('utf8');
      stdin.on('data', (chunk: string) => (data += chunk));
      stdin.on('end', () => resolve(data.split(/\r?\n/)[0] ?? ''));
    });
  }
  return new Promise((resolve) => {
    stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let value = '';
    const onData = (chunk: string): void => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          stdout.write('\n');
          resolve(value);
          return;
        }
        if (ch === '\u0003') {
          stdout.write('\n');
          process.exit(130);
        }
        if (ch === '\u007f' || ch === '\b') {
          value = [...value].slice(0, -1).join('');
          continue;
        }
        value += ch;
      }
    };
    stdin.on('data', onData);
  });
}

async function main(): Promise<void> {
  const first = await readHidden('Пароль (не відображається): ');
  const check = checkNewPassword(first);
  if (!check.ok) {
    console.error(check.message);
    process.exit(1);
  }
  if (process.stdin.isTTY) {
    const second = await readHidden('Повторіть пароль: ');
    if (second !== first) {
      console.error('Паролі не збігаються. Запустіть команду ще раз.');
      process.exit(1);
    }
  }
  console.log(await hashPassword(first));
}

void main();
