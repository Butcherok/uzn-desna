import { describe, expect, it } from 'vitest';
import { formatPhone, parseStoredPhone, storedPhoneSchema } from './phone.js';

describe('parseStoredPhone', () => {
  it('приводит запись с разделителями к виду хранения', () => {
    expect(parseStoredPhone('+38 (044) 337-35-01')).toBe('+380443373501');
  });

  it('принимает городской номер, начинающийся с нуля', () => {
    expect(parseStoredPhone('044 337 35 02')).toBe('+380443373502');
  });

  it('принимает мобильный номер оперативного дежурного', () => {
    expect(parseStoredPhone('+38 (067) 448-05-11')).toBe('+380674480511');
  });

  it('отвергает номер неверной длины', () => {
    expect(() => parseStoredPhone('337-35-01')).toThrow();
  });
});

describe('formatPhone', () => {
  it('выводит номер по маске ТЗ 5.1, п. 6', () => {
    expect(formatPhone('+380443373501')).toBe('+38 (044) 337-35-01');
  });

  it('отвергает значение не в формате хранения', () => {
    expect(() => formatPhone('0443373501')).toThrow();
  });
});

describe('storedPhoneSchema', () => {
  it('принимает только +380 и девять цифр', () => {
    expect(storedPhoneSchema.safeParse('+380443373501').success).toBe(true);
    expect(storedPhoneSchema.safeParse('+38044337350').success).toBe(false);
  });
});
