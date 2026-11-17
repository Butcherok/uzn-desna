/**
 * Правила страницы «Послуги» (ТЗ 4.4). Слой domain:
 * чистые функции над переданными данными, без чтения файлов и сети.
 */
import type { Service } from '@uzn/shared';

export type ServiceGroup = {
  /** Название группы на украинском — ключ группировки */
  readonly name: string;
  readonly services: readonly Service[];
};

/**
 * Услуги, собранные в группы (ТЗ 4.4: «Группы услуг; внутри — карточки услуг»).
 *
 * Внутри группы — порядок `order` (ТЗ 6.1, п. 6), сами группы — по первому
 * появлению в этом же порядке: отдельной сущности группы в модели нет
 * (ТЗ 6.2), поэтому порядок групп задаётся нумерацией услуг.
 *
 * Пустых групп на выходе не бывает: группа создаётся первой же услугой,
 * которая на неё ссылается (чек-лист 12.2, строка «Пустых групп услуг нет»).
 */
export function groupedServices(services: readonly Service[]): ServiceGroup[] {
  const ordered = [...services].sort((a, b) => a.order - b.order);
  const groups: ServiceGroup[] = [];
  const byName = new Map<string, Service[]>();

  for (const service of ordered) {
    const name = service.group.uk;
    let bucket = byName.get(name);
    if (bucket === undefined) {
      bucket = [];
      byName.set(name, bucket);
      groups.push({ name, services: bucket });
    }
    bucket.push(service);
  }

  return groups;
}
