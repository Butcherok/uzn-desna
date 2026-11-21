# Запуск бэкенда: Atlas и Render

Пункт 5б, решение 037. Выполняет владелец в своих кабинетах. Пароли, строка
подключения и хэш в чат и в git не передаются: они вводятся только в кабинетах
и в PowerShell на своём компьютере. Названия разделов сверены с документацией
Atlas и Render 20.11.2026; где не сверены — сказано у шага.

Перед началом: PR с `render.yaml` слит в `main`, задача CI на `main` зелёная.

## 1. Atlas: бесплатный кластер

Если кластер в проекте уже есть — к шагу 2.

1. Atlas → проект → создание кластера → тариф **Free**. Провайдер **AWS**,
   регион **Frankfurt (eu-central-1)**, если он есть в списке; если нет — любой
   европейский. Имя кластера — например `uzn-desna`. Подписи кнопок создания
   кластера с документацией не сверены.
2. Должно появиться: кластер в списке, через несколько минут — без значка
   создания. Atlas сам ставит MongoDB 8.0.
3. Стоп, если Atlas просит карту или предлагает только платные тарифы.

## 2. Atlas: пользователь базы с правами на одну базу

1. Боковая панель → раздел **Security** → **Database & Network Access** →
   вкладка **Database Users** → **Add New Database User**.
2. **Authentication Method:** **Password**. Имя: `uzn-api`. Пароль — кнопкой
   автогенерации; сразу сохранить в своём менеджере паролей.
3. **Database User Privileges:** раскрыть **Specific Privileges** →
   **Add Specific Privilege** → роль `readWrite`, база `uzn`, поле коллекции
   пустым. Затем удалить **Built-in Role**, если там что-то выбрано (значок
   удаления появляется, когда выбрано больше одного пункта).
4. **Restrict Access to Specific Clusters** — включить, выбрать свой кластер.
5. **Add User**. Должно появиться: `uzn-api` в списке с одной привилегией
   `readWrite@uzn`. Стоп, если рядом видно `atlasAdmin` или «any database».

## 3. Atlas: список доступа

1. **Database & Network Access** → слева **IP Access List** → **Add IP Address**.
2. Адрес `0.0.0.0/0`. Comment: `Render + GitHub Actions (TZ 10.5 p.3)`.
   **Save as temporary** не отмечать.
3. **Confirm**. Должно появиться: строка `0.0.0.0/0` со статусом **Active**
   (может пройти до нескольких минут). На почту придёт предупреждение Atlas о
   доступе отовсюду — это ожидаемо: защита держится на пароле и правах шага 2.

## 4. Atlas: строка подключения

1. Кластер → **Connect** → **Drivers**. Скопировать строку вида
   `mongodb+srv://uzn-api:<db_password>@…mongodb.net/?…`. Подписи окна
   подключения с документацией не сверены.
2. Заменить `<db_password>` паролем из шага 2. Если в пароле есть знаки
   `@ : / ? # [ ] %` — их нужно закодировать; автогенерированный пароль Atlas
   обычно из букв и цифр. Имя базы в строку не дописывать: оно задано
   переменной `MONGODB_DB=uzn`.
3. Держать строку в блокноте до шага 6, потом закрыть без сохранения.

## 5. Хэш пароля владельца

Нужна папка с кодом репозитория на своём компьютере и Node.js 22.22 или
новее (`node --version`). Путь — без пробелов и кириллицы, например `D:\dev`:
с ними npm на Windows иногда ломается.

Если папки ещё нет — с git (`git --version`):

```
mkdir D:\dev
cd D:\dev
git clone https://github.com/Butcherok/uzn-desna.git
cd uzn-desna
```

Без git: GitHub → `Butcherok/uzn-desna` → **Code** → **Download ZIP**,
распаковать в `D:\dev`, перейти в `D:\dev\uzn-desna-main`. Если папка уже
есть — в ней `git pull`.

Затем (ставятся только зависимости сервера, как на Render):

```
npm ci --workspace=server --include-workspace-root
npm run hash-password
```

Пароль не короче 12 символов, вводится дважды. Должно появиться: строка
`$2b$12$…` из 60 знаков. Это хэш — его и только его вводить в Render.

## 6. Render: сервис из `render.yaml`

1. Render → **New** → **Blueprint** → у репозитория `Butcherok/uzn-desna`
   кнопка **Connect**.
2. Blueprint Name: `uzn-desna`. Branch: `main`. Blueprint Path: `render.yaml`.
3. Render попросит значения четырёх переменных (только сейчас, один раз):
   - `MONGODB_URI` — строка из шага 4;
   - `BOOTSTRAP_OWNER_LOGIN` — логин латиницей, 3–32 знака (`a–z`, `0–9`, `.`, `_`, `-`);
   - `BOOTSTRAP_OWNER_PASSWORD_HASH` — строка из шага 5;
   - `BOOTSTRAP_OWNER_DISPLAY_NAME` — имя в админке; можно оставить пустым.
4. В списке изменений: один веб-сервис `uzn-desna-api`, план **Free**, регион
   **Frankfurt**. Стоп, если план другой или Render просит карту.
5. **Deploy Blueprint** (кнопка может называться **Apply**).
6. Должно появиться: сервис → **Events** — идёт деплой; в журнале сборки
   строка с версией Node.js (ожидается 26.x) и `Done` от esbuild; затем статус
   **Live**. Адрес сервиса — вверху страницы сервиса, вида
   `https://uzn-desna-api….onrender.com`.
7. Стоп, если сборка упала: прислать мне последние 20 строк журнала сборки
   (в нём нет секретов).

## 7. Первый владелец

1. Сервис → **Logs**. Должна быть строка
   `Owner account created from BOOTSTRAP_* variables`.
   Если `rejected-bad-hash` или `rejected-bad-login` — повторить шаг 5 или
   исправить логин в **Environment**.
2. Сервис → **Environment** → удалить `BOOTSTRAP_OWNER_LOGIN`,
   `BOOTSTRAP_OWNER_PASSWORD_HASH`, `BOOTSTRAP_OWNER_DISPLAY_NAME` →
   **Save and deploy**.
3. После перезапуска в **Logs**: `Users exist; bootstrap not needed.`

## 8. Проверки (PowerShell)

Адрес подставить свой:

```
$api = 'https://uzn-desna-api.onrender.com/api/v1'
Invoke-RestMethod "$api/health"
```

Должно быть: `status ok`, `dbConnected True`, `version` — первые 7 знаков
последнего коммита `main`.

Вход и время проверки пароля — три раза подряд. `ВАШ_ЛОГИН` — значение
`BOOTSTRAP_OWNER_LOGIN` из шага 6 (если забыт — Atlas → **Browse Collections**
→ `uzn` → `users`, поле `login`):

```
$p = Read-Host -AsSecureString 'Пароль'
$body = @{ login = 'ВАШ_ЛОГИН'; password = [Net.NetworkCredential]::new('', $p).Password } | ConvertTo-Json
$h = @{ 'X-Requested-With' = 'uzn-admin' }
1..3 | ForEach-Object { $t = Measure-Command { $r = Invoke-WebRequest -UseBasicParsing -Method Post -Uri "$api/auth/login" -ContentType 'application/json' -Headers $h -Body $body }; "$($r.StatusCode)  $($r.Headers['Server-Timing'])  всего $([int]$t.TotalMilliseconds) мс" }
Remove-Variable p, body
```

Должно быть: три строки `200  pw;dur=…  всего … мс`.

Адрес клиента за прокси (`TRUST_PROXY`):

```
Invoke-RestMethod https://api.ipify.org
try { Invoke-WebRequest -UseBasicParsing "$api/auth/me" -Headers @{ 'X-Forwarded-For' = '1.2.3.4' } } catch { $_.Exception.Response.StatusCode }
```

Первая команда печатает ваш адрес. Вторая — `Unauthorized`, так и должно быть.
Затем **Logs** → последняя строка `incoming request` с `/api/v1/auth/me` →
значение `remoteAddress`.

## 9. Что прислать мне

- адрес сервиса;
- ответ `/health` целиком;
- три строки замера входа;
- `remoteAddress` из журнала и совпадает ли он с адресом от `api.ipify.org`
  (`1.2.3.4` там быть не должно);
- версию Node.js из журнала сборки;
- через 20 минут без запросов: есть ли в **Events** запись о засыпании.

Стоп после этого шага: значение `TRUST_PROXY` и выбор по скорости входа
решаются по присланному.

## 10. Публикация: токены (задача 5д, решение 041)

Делается один раз, после слияния PR задачи 5д и выкладки на Render. Значения
токенов не присылать в чат и не сохранять в файлах репозитория.

**Токен GitHub для запуска публикации.**

1. GitHub → аватар справа вверху → **Settings** → внизу слева **Developer
   settings** → **Personal access tokens** → **Fine-grained tokens** →
   **Generate new token**.
2. Token name: `uzn-desna publish`. Expiration: **No expiration**.
   Resource owner: `Butcherok`.
3. Repository access: **Only select repositories** → `Butcherok/uzn-desna`.
4. Permissions → Repository permissions → **Actions: Read and write**. Больше
   ничего не включать (`Metadata: Read` GitHub добавит сам).
5. **Generate token** → скопировать значение (начинается с `github_pat_`).
   Стоп, если в списке прав есть что-то кроме Actions и Metadata.

**Токен выгрузки** — случайная строка из 64 знаков (PowerShell):

```
$b = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
-join ($b | ForEach-Object { $_.ToString('x2') })
```

**Куда вписать.**

1. Render → сервис `uzn-desna-api` → **Environment** → **Add Environment
   Variable**: `GITHUB_DISPATCH_TOKEN` — токен GitHub; `EXPORT_TOKEN` — токен
   выгрузки → **Save and deploy**.
2. GitHub → репозиторий → **Settings** → **Secrets and variables** →
   **Actions** → **New repository secret**: Name `EXPORT_TOKEN`, Secret — тот
   же токен выгрузки → **Add secret**.
3. В **Logs** Render после перезапуска не должно быть строк
   `publishing is not configured` и `export is closed`.

**Проверка.**

1. Админка → «Послуги» → у любой карточки «Приховати» (подтвердить), затем
   у неё же «Показати на сайті». Содержимое сайта не меняется. Внизу:
   «Не опубліковано: 1 зміна» и кнопка «Опублікувати зміни».
2. Нажать кнопку. Должно появиться «Зміни з'являться на сайті протягом
   кількох хвилин», кнопка исчезает.
3. GitHub → **Actions** → **Publish content** — идёт прогон, внутри шаг
   `Deploy and wait`; через 3–5 минут зелёные и он, и запущенный им
   **Deploy**. Первая публикация всегда доходит до сборки: сервер
   переупорядочивает `static-blocks.json` по ключу (решение 041).
4. Админка через минуту после этого: «Усі зміни опубліковано», время
   последней публикации обновилось. В репозитории появилась ветка
   `content-data`, сайт выглядит как прежде.
5. Стоп, если прогон красный: прислать название упавшего шага и строку с
   `::error` из его журнала (в журнале нет секретов).
