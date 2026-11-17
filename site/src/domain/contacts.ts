/**
 * Правила вывода контактных точек (ТЗ 4.6, 3.1). Слой domain:
 * чистые функции над переданными данными, без чтения файлов и сети.
 */
import type { Contact } from '@uzn/shared';

const byOrder = (a: Contact, b: Contact): number => a.order - b.order;

/** Непроверенный телефон на сайт не идёт (ТЗ 4.6). */
export function publishedContacts(contacts: readonly Contact[]): Contact[] {
  return contacts.filter((contact) => contact.confirmed).sort(byOrder);
}

/** Точки подвала: приймальня и оперативний черговий (ТЗ 3.1, подвал, пп. 1–2). */
export function footerContacts(contacts: readonly Contact[]): Contact[] {
  return publishedContacts(contacts).filter((contact) => contact.showInFooter);
}

/** Точка по слагу. Нет записи или не подтверждена — `undefined`, блок скрывается. */
export function contactBySlug(contacts: readonly Contact[], slug: string): Contact | undefined {
  return publishedContacts(contacts).find((contact) => contact.slug === slug);
}
