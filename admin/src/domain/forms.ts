/**
 * Поля форм админки (ТЗ 9.3, 9.4; решение 040): подпись, подсказка «что это и
 * где появится на сайте», тип и пределы. Пределы длины совпадают со схемами
 * `shared/` — сверяет тест `forms.test.ts`. Окончательную проверку делает
 * сервер; здесь — ранняя подсказка с фокусом на поле.
 *
 * Служебные поля в формы не входят: `slug` (только владельцу, отдельным
 * блоком), `order` (кнопки в списке), `photoPath` (задача 5е), `status` и
 * `publishedAt` вакансии (пишет сервер), `blockKey` (выбирается при создании).
 */
import type { Kind } from './kinds';
import { BLOCK_LABELS, PLACE_LABELS } from './kinds';

export interface Option {
  value: string;
  label: string;
}

interface Base {
  /** Путь в данных записи; вложенность — через точку. */
  name: string;
  label: string;
  hint: string;
  required?: boolean;
  /** Поле видит и меняет только владелец (ТЗ 9.1). */
  ownerOnly?: boolean;
}

export type Field =
  | (Base & { type: 'lang'; max: number; multiline?: boolean })
  | (Base & { type: 'text'; max: number; pattern?: { re: RegExp; message: string } })
  | (Base & { type: 'email'; max: number })
  | (Base & { type: 'phone' })
  | (Base & { type: 'url'; max: number })
  | (Base & { type: 'date' })
  | (Base & { type: 'bool' })
  | (Base & { type: 'enum'; options: readonly Option[] })
  | (Base & { type: 'contact' })
  /** Отметка подтверждения карточки: `confirmedAt` и `confirmedBy` (ТЗ 5.4, п. 2). */
  | (Base & { type: 'confirm' })
  | (Base & { type: 'langList'; max: number; maxItems: number })
  | (Base & {
      type: 'group';
      fields: readonly Field[];
      maxItems: number;
      /** Состав пунктов задан: без «Додати» и «Прибрати» (источники ленты). */
      fixed?: boolean;
      itemLabel: string;
    })
  /** Перечень корней словаря: по одному в строке. */
  | (Base & { type: 'words'; min?: number })
  /** Связки корней: два слова через пробел в строке. */
  | (Base & { type: 'pairs' });

export type FieldType = Field['type'];

const phoneHint = 'Можна вводити як завгодно: 044 337-35-01, (067) 123 45 67, +380…';

const FORMS: Record<Kind, readonly Field[]> = {
  enterprise: [
    {
      name: 'nameFull',
      type: 'lang',
      max: 300,
      required: true,
      label: 'Повна назва',
      hint: 'Офіційна назва з реєстру. Видно в підвалі та на сторінці «Про підприємство».',
    },
    {
      name: 'nameShort',
      type: 'lang',
      max: 120,
      label: 'Скорочена назва',
      hint: 'Наприклад, «КП УЗН Деснянського району».',
    },
    {
      name: 'edrpou',
      type: 'text',
      max: 8,
      required: true,
      pattern: { re: /^\d{8}$/u, message: 'Код ЄДРПОУ — вісім цифр' },
      label: 'Код ЄДРПОУ',
      hint: 'Вісім цифр. Видно на сторінці «Про підприємство».',
    },
    {
      name: 'email',
      type: 'email',
      max: 120,
      label: 'Електронна пошта',
      hint: 'Загальна адреса підприємства. Видно в підвалі сайту.',
    },
    {
      name: 'legalForm',
      type: 'lang',
      max: 120,
      required: true,
      label: 'Організаційно-правова форма',
      hint: 'Наприклад, «Комунальне підприємство».',
    },
    {
      name: 'registeredAt',
      type: 'date',
      label: 'Дата реєстрації',
      hint: 'З виписки з реєстру.',
    },
    {
      name: 'ownerBody',
      type: 'lang',
      max: 200,
      required: true,
      label: 'Засновник (власник)',
      hint: 'Орган, якому належить підприємство.',
    },
    {
      name: 'governedBy',
      type: 'lang',
      max: 200,
      required: true,
      label: 'Орган управління',
      hint: 'Кому підпорядковане підприємство.',
    },
    {
      name: 'coordinatedBy',
      type: 'lang',
      max: 200,
      label: 'Координує діяльність',
      hint: 'Якщо є окремий орган координації.',
    },
    {
      name: 'kved',
      type: 'group',
      maxItems: 10,
      itemLabel: 'Вид діяльності',
      label: 'Види діяльності (КВЕД)',
      hint: 'Код і назва з реєстру. До 10 пунктів.',
      fields: [
        {
          name: 'code',
          type: 'text',
          max: 10,
          required: true,
          label: 'Код',
          hint: 'Наприклад, 81.30.',
        },
        { name: 'title', type: 'lang', max: 200, required: true, label: 'Назва', hint: '' },
      ],
    },
    {
      name: 'legalBasis',
      type: 'langList',
      max: 300,
      maxItems: 10,
      label: 'Правові підстави',
      hint: 'Статут, рішення про створення тощо. Кожна підстава — окремим пунктом.',
    },
    {
      name: 'infoReference',
      type: 'lang',
      max: 1500,
      multiline: true,
      label: 'Довідка про підприємство',
      hint: 'Короткий текст для сторінки «Про підприємство».',
    },
  ],

  contacts: [
    {
      name: 'purpose',
      type: 'lang',
      max: 120,
      required: true,
      label: 'Назва',
      hint: '«Приймальня», «Диспетчерська». Видно на сторінці «Контакти».',
    },
    { name: 'phone', type: 'phone', required: true, label: 'Телефон', hint: phoneHint },
    {
      name: 'hours',
      type: 'lang',
      max: 120,
      label: 'Години роботи',
      hint: 'Наприклад, «Пн–Пт 8:00–17:00». Порожньо — номер без підпису.',
    },
    {
      name: 'roundClock',
      type: 'bool',
      label: 'Цілодобово',
      hint: 'Номер відповідає вдень і вночі.',
    },
    {
      name: 'confirmed',
      type: 'bool',
      label: 'Номер перевірено',
      hint: 'Неперевірений номер на сайт не виводиться.',
    },
    {
      name: 'showInFooter',
      type: 'bool',
      label: 'Показувати в підвалі',
      hint: 'Номер з’явиться внизу кожної сторінки сайту.',
    },
  ],

  leaders: [
    {
      name: 'fullName',
      type: 'lang',
      max: 120,
      required: true,
      label: 'Прізвище, ім’я, по батькові',
      hint: 'Видно на картці на сторінці «Про підприємство».',
    },
    {
      name: 'position',
      type: 'lang',
      max: 150,
      required: true,
      label: 'Посада',
      hint: 'Як у наказі про призначення.',
    },
    { name: 'phone', type: 'phone', label: 'Телефон', hint: 'Необов’язково. ' + phoneHint },
    {
      name: 'bio',
      type: 'lang',
      max: 2000,
      multiline: true,
      label: 'Біографія',
      hint: 'Розкривається на картці за кнопкою.',
    },
    {
      name: 'photoAlt',
      type: 'lang',
      max: 150,
      label: 'Опис фото',
      hint: 'Що на фото — для людей, які не бачать зображення. Обов’язковий, якщо є фото.',
    },
    {
      name: 'since',
      type: 'date',
      label: 'На посаді з',
      hint: 'Дата призначення, якщо відома.',
    },
    {
      name: 'confirmedAt',
      type: 'confirm',
      ownerOnly: true,
      label: 'Картку підтверджено',
      hint: 'Людина погодила зміст своєї картки. Запис про згоду — у журналі рішень ТЗ 13.3.',
    },
  ],

  services: [
    {
      name: 'title',
      type: 'lang',
      max: 150,
      required: true,
      label: 'Назва послуги',
      hint: 'Заголовок картки на сторінці «Послуги».',
    },
    {
      name: 'summary',
      type: 'lang',
      max: 300,
      multiline: true,
      required: true,
      label: 'Опис',
      hint: 'Одне-два речення: що робимо і для кого.',
    },
    {
      name: 'group',
      type: 'lang',
      max: 120,
      required: true,
      label: 'Група',
      hint: 'Картки з однаковою групою стоять разом.',
    },
    {
      name: 'contactId',
      type: 'contact',
      label: 'Куди телефонувати',
      hint: 'Номер із розділу «Контакти». Порожньо — номер приймальні.',
    },
    {
      name: 'phone',
      type: 'phone',
      label: 'Окремий телефон',
      hint: 'Лише якщо номера немає в «Контактах». ' + phoneHint,
    },
    {
      name: 'audience',
      type: 'enum',
      label: 'Для кого',
      hint: 'Необов’язково.',
      options: [
        { value: 'resident', label: 'Мешканці' },
        { value: 'osbb', label: 'ОСББ і управителі будинків' },
        { value: 'legal', label: 'Підприємства й організації' },
      ],
    },
    {
      name: 'payment',
      type: 'enum',
      label: 'Оплата',
      hint: 'Необов’язково.',
      options: [
        { value: 'paid', label: 'Платна' },
        { value: 'maintenance', label: 'У межах утримання' },
        { value: 'unknown', label: 'Не визначено' },
      ],
    },
  ],

  scenarios: [
    {
      name: 'situation',
      type: 'lang',
      max: 150,
      required: true,
      label: 'Ситуація',
      hint: 'Як скаже мешканець: «Впало дерево на дорогу».',
    },
    {
      name: 'whatWeDo',
      type: 'lang',
      max: 300,
      multiline: true,
      label: 'Що ми робимо',
      hint: 'Коротко: що буде після дзвінка.',
    },
    { name: 'phone', type: 'phone', label: 'Телефон', hint: 'Необов’язково. ' + phoneHint },
    {
      name: 'hours',
      type: 'lang',
      max: 120,
      label: 'Коли телефонувати',
      hint: 'Наприклад, «Цілодобово».',
    },
    {
      name: 'emergency',
      type: 'bool',
      label: 'Аварійна ситуація',
      hint: 'Позначка для ситуацій, коли потрібна негайна допомога.',
    },
  ],

  'public-docs': [
    {
      name: 'title',
      type: 'lang',
      max: 200,
      required: true,
      label: 'Назва документа',
      hint: 'Видно в переліку на сторінці «Публічна інформація».',
    },
    {
      name: 'normRef',
      type: 'lang',
      max: 200,
      label: 'Норма закону',
      hint: 'Наприклад, «ст. 60-2 Закону „Про місцеве самоврядування“».',
    },
    {
      name: 'publishedWhere',
      type: 'enum',
      required: true,
      label: 'Де оприлюднено',
      hint: 'Підпис місця на картці документа.',
      options: Object.entries(PLACE_LABELS).map(([value, label]) => ({ value, label })),
    },
    {
      name: 'externalUrl',
      type: 'url',
      max: 500,
      label: 'Посилання',
      hint: 'Повна адреса, що починається з https://. Для «за запитом» — порожньо.',
    },
    {
      name: 'featured',
      type: 'bool',
      label: 'У блоці документів',
      hint: 'Документ з’явиться в окремому блоці вгорі сторінки. Потрібне посилання.',
    },
  ],

  vacancies: [
    {
      name: 'position',
      type: 'lang',
      max: 150,
      required: true,
      label: 'Посада',
      hint: 'Заголовок оголошення на сторінці «Вакансії».',
    },
    {
      name: 'unit',
      type: 'lang',
      max: 150,
      label: 'Підрозділ',
      hint: 'Необов’язково.',
    },
    {
      name: 'requirements',
      type: 'lang',
      max: 400,
      multiline: true,
      required: true,
      label: 'Вимоги',
      hint: 'Освіта, досвід, умови.',
    },
    {
      name: 'contactId',
      type: 'contact',
      required: true,
      label: 'Куди телефонувати',
      hint: 'Номер із розділу «Контакти».',
    },
    {
      name: 'validThrough',
      type: 'date',
      label: 'Показувати до',
      hint: 'Цього дня оголошення вже не показується. Порожньо — без строку.',
    },
  ],

  'static-blocks': [
    {
      name: 'text',
      type: 'lang',
      max: 1000,
      multiline: true,
      label: 'Текст',
      hint: 'Порожньо — блок на сайті не показується.',
    },
  ],

  'feed-rules': [
    {
      name: 'sources',
      type: 'group',
      fixed: true,
      maxItems: 50,
      itemLabel: 'Джерело',
      label: 'Джерела',
      hint: 'Вимкнене джерело не потрапляє в стрічку з наступного оновлення.',
      fields: [
        { name: 'name', type: 'text', max: 80, required: true, label: 'Назва', hint: '' },
        { name: 'enabled', type: 'bool', label: 'Увімкнено', hint: '' },
        {
          name: 'excerptAllowed',
          type: 'bool',
          label: 'Можна показувати уривок',
          hint: 'Інакше картка — лише заголовок і посилання.',
        },
        {
          name: 'note',
          type: 'text',
          max: 300,
          label: 'Примітка',
          hint: 'Чому вимкнено — для вас і для журналу.',
        },
      ],
    },
    {
      name: 'dictionary.uk.topics',
      type: 'words',
      min: 1,
      required: true,
      label: 'Теми (українською)',
      hint: 'Корені слів, по одному в рядку: «озелен», «сквер».',
    },
    {
      name: 'dictionary.uk.pairs',
      type: 'pairs',
      label: 'Пари слів (українською)',
      hint: 'Два корені через пробіл, що стоять поруч: «зелен зон».',
    },
    {
      name: 'dictionary.uk.stop',
      type: 'words',
      label: 'Стоп-слова (українською)',
      hint: 'Публікація з таким коренем у стрічку не потрапить.',
    },
    {
      name: 'dictionary.en.topics',
      type: 'words',
      min: 1,
      required: true,
      label: 'Теми (англійською)',
      hint: 'Корені слів, по одному в рядку.',
    },
    {
      name: 'dictionary.en.pairs',
      type: 'pairs',
      label: 'Пари слів (англійською)',
      hint: 'Два корені через пробіл.',
    },
    {
      name: 'dictionary.en.stop',
      type: 'words',
      label: 'Стоп-слова (англійською)',
      hint: 'Публікація з таким коренем у стрічку не потрапить.',
    },
  ],
};

export function formFields(kind: Kind, role: 'owner' | 'editor'): Field[] {
  return FORMS[kind].filter((f) => role === 'owner' || !f.ownerOnly);
}

/** Поля всех форм — для теста соответствия схемам. */
export const ALL_FORMS = FORMS;

/** Тексты сторінок, которые ещё можно создать: ключи с местом на сайте без записи. */
export function freeBlockKeys(used: readonly string[]): Option[] {
  return Object.entries(BLOCK_LABELS)
    .filter(([key]) => !used.includes(key))
    .map(([value, label]) => ({ value, label: label ?? value }));
}
