import { describe, expect, it } from 'vitest';
import { pluralChanges } from './text';

describe('Ukrainian plural for changes', () => {
  it('picks the right form', () => {
    expect([1, 2, 5, 11, 12, 21, 22, 25, 111, 104].map(pluralChanges)).toEqual([
      '1 зміна',
      '2 зміни',
      '5 змін',
      '11 змін',
      '12 змін',
      '21 зміна',
      '22 зміни',
      '25 змін',
      '111 змін',
      '104 зміни',
    ]);
  });
});
