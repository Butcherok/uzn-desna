import {
  contactSchema,
  enterpriseSchema,
  feedRulesSchema,
  leaderSchema,
  publicDocSchema,
  serviceSchema,
  staticBlockSchema,
  vacancySchema,
} from '@uzn/shared';
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { PLACE_LABELS as SITE_PLACE_LABELS } from '../../../site/src/domain/public-docs';
import contacts from '../../../data/contacts.json';
import enterprise from '../../../data/enterprise.json';
import feedRules from '../../../data/feed-rules.json';
import leaders from '../../../data/leaders.json';
import publicDocs from '../../../data/public-docs.json';
import services from '../../../data/services.json';
import staticBlocks from '../../../data/static-blocks.json';
import vacancies from '../../../data/vacancies.json';
import { ALL_FORMS, type Field } from './forms';
import { buildPatch, crossCheck, errorKeyFor, fieldKeys, fromForm, toForm } from './form-values';
import { PLACE_LABELS, type Kind } from './kinds';

const SCHEMAS: Record<Kind, z.ZodType> = {
  contacts: contactSchema,
  leaders: leaderSchema,
  services: serviceSchema,
  'public-docs': publicDocSchema,
  vacancies: vacancySchema,
  'static-blocks': staticBlockSchema,
  enterprise: enterpriseSchema,
  'feed-rules': feedRulesSchema,
};

/** Схема поля по пути `a.b.c` через `shape` объектов Zod. */
function schemaAt(schema: z.ZodType, path: string): z.ZodType | undefined {
  let cur: unknown = schema;
  for (const part of path.split('.')) {
    let def = (cur as { def?: { type?: string; innerType?: unknown; element?: unknown } }).def;
    while (def?.type === 'optional' || def?.type === 'pipe') {
      cur = def.type === 'optional' ? def.innerType : (def as { in?: unknown }).in;
      def = (cur as { def?: { type?: string; innerType?: unknown } }).def;
    }
    const shape = (cur as { shape?: Record<string, unknown> }).shape;
    if (!shape || !(part in shape)) return undefined;
    cur = shape[part];
  }
  return cur as z.ZodType;
}

const unwrap = (s: z.ZodType): z.ZodType => {
  let cur: z.ZodType = s;
  for (;;) {
    const def = (cur as unknown as { def: { type: string; innerType?: z.ZodType } }).def;
    if (def.type === 'optional' && def.innerType) cur = def.innerType;
    else return cur;
  }
};

const isOptional = (s: z.ZodType) =>
  (s as unknown as { def: { type: string } }).def.type === 'optional';

function maxOf(s: z.ZodType): number | null | undefined {
  return (unwrap(s) as unknown as { maxLength?: number | null }).maxLength;
}

describe('form fields follow the shared schemas', () => {
  for (const [kind, fields] of Object.entries(ALL_FORMS) as [Kind, readonly Field[]][]) {
    it(`${kind}: every field exists, limits and required flags match`, () => {
      const schema = SCHEMAS[kind];
      for (const f of fields) {
        if (f.type === 'confirm') {
          expect(schemaAt(schema, 'confirmedAt'), 'confirmedAt').toBeDefined();
          expect(schemaAt(schema, 'confirmedBy'), 'confirmedBy').toBeDefined();
          continue;
        }
        const s = schemaAt(schema, f.name);
        expect(s, `${kind}.${f.name}`).toBeDefined();
        if (!s) continue;
        if (!['bool', 'group', 'words', 'pairs'].includes(f.type)) {
          expect(isOptional(s), `${kind}.${f.name} required`).toBe(!f.required);
        }
        if (f.type === 'lang') {
          expect(maxOf(schemaAt(s, 'uk') as z.ZodType), `${kind}.${f.name} max`).toBe(f.max);
        }
        // Длину поля с шаблоном (ЄДРПОУ) задаёт сам шаблон.
        if ((f.type === 'text' && !f.pattern) || f.type === 'email' || f.type === 'url') {
          expect(maxOf(s), `${kind}.${f.name} max`).toBe(f.max);
        }
      }
    });
  }

  it('place labels match the site', () => {
    expect(PLACE_LABELS).toEqual(SITE_PLACE_LABELS);
  });
});

describe('form values', () => {
  it('round-trips every record of the data files without changes', () => {
    const files: [Kind, { items: unknown[] }][] = [
      ['contacts', contacts],
      ['enterprise', enterprise],
      ['feed-rules', feedRules],
      ['leaders', leaders],
      ['public-docs', publicDocs],
      ['services', services],
      ['static-blocks', staticBlocks],
      ['vacancies', vacancies],
    ];
    let checked = 0;
    for (const [kind, file] of files) {
      const fields = ALL_FORMS[kind];
      for (const item of file.items) {
        const data = item as Record<string, unknown>;
        const { data: back, errors } = fromForm(fields, toForm(fields, data));
        expect(errors, kind).toEqual({});
        expect(buildPatch(fields, data, back), kind).toEqual({});
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(30);
  });

  it('reads numbers with a comma or a dot and checks digits and limits', () => {
    const fields = ALL_FORMS.enterprise;
    const state = toForm(fields, enterprise.items[0] as Record<string, unknown>);
    expect(state['staffCount']).toBe('223');
    const rows = state['areas'] as Record<string, unknown>[];
    expect(rows[0]?.['hectares']).toBe('513,5552');
    expect(rows[1]?.['count']).toBe('');

    const edit = (staff: string, ha: string) =>
      fromForm(fields, {
        ...state,
        staffCount: staff,
        areas: [{ ...rows[0], hectares: ha }],
      });
    const ok = edit('1 250', '513.5552');
    expect(ok.errors).toEqual({});
    expect(ok.data['staffCount']).toBe(1250);
    expect((ok.data['areas'] as { hectares: number }[])[0]?.hectares).toBe(513.5552);

    expect(edit('22,5', '1').errors['staffCount']).toBe('Введіть ціле число');
    expect(edit('223', 'багато').errors['areas.0.hectares']).toMatch(/Введіть число/u);
    expect(edit('223', '1,1234567').errors['areas.0.hectares']).toBe(
      'Не більше 6 знаків після коми',
    );
    expect(edit('223', '0').errors['areas.0.hectares']).toBe('Має бути більше нуля');
    expect(edit('0', '1').errors['staffCount']).toBe('Не менше 1');
    expect(edit('223', '').errors['areas.0.hectares']).toBe('Заповніть це поле');
  });

  it('normalizes a phone typed in any form and shows it back readable', () => {
    const fields = ALL_FORMS.contacts;
    const state = toForm(fields, contacts.items[0] as Record<string, unknown>);
    expect(state['phone']).toBe('044 337-35-01');
    const { data } = fromForm(fields, { ...state, phone: '(067) 123 45 67' });
    expect(data['phone']).toBe('+380671234567');
    const bad = fromForm(fields, { ...state, phone: '12345' });
    expect(bad.errors['phone']).toMatch(/10 цифр/u);
  });

  it('sends null for a cleared optional field and keeps fields outside the form', () => {
    const fields = ALL_FORMS.contacts;
    const original = { ...(contacts.items[0] as Record<string, unknown>), hours: { uk: 'Пн–Пт' } };
    const state = toForm(fields, original);
    const { data } = fromForm(fields, { ...state, hours: { uk: '', en: '' } });
    const patch = buildPatch(fields, original, data);
    expect(patch).toEqual({ hours: null });
    expect('order' in patch || 'slug' in patch).toBe(false);
  });

  it('requires Ukrainian text and checks length', () => {
    const fields = ALL_FORMS.contacts;
    const empty = fromForm(fields, toForm(fields, {}));
    expect(empty.errors['purpose']).toBe('Заповніть українською');
    expect(empty.errors['phone']).toBe('Заповніть це поле');
    const long = fromForm(fields, {
      ...toForm(fields, {}),
      purpose: { uk: 'я'.repeat(121), en: '' },
    });
    expect(long.errors['purpose']).toBe('Не довше 120 знаків');
  });

  it('builds the leader confirmation from one checkbox', () => {
    const fields = ALL_FORMS.leaders;
    const now = () => new Date('2026-11-21T10:00:00Z');
    const base = { fullName: { uk: 'А' }, position: { uk: 'Б' }, order: 1 };
    const state = toForm(fields, base);
    const checked = fromForm(
      fields,
      { ...state, confirmedAt: { checked: true, at: '', by: ' Карп Є. А. ' } },
      now,
    );
    expect(checked.data['confirmedAt']).toBe('2026-11-21T10:00:00.000Z');
    expect(checked.data['confirmedBy']).toBe('Карп Є. А.');
    const noName = fromForm(fields, { ...state, confirmedAt: { checked: true, at: '', by: '' } });
    expect(noName.errors['confirmedAt.by']).toBeDefined();
    const confirmed = { ...base, confirmedAt: '2026-11-01T00:00:00.000Z', confirmedBy: 'X' };
    const cleared = fromForm(fields, {
      ...toForm(fields, confirmed),
      confirmedAt: { checked: false, at: '', by: '' },
    });
    expect(buildPatch(fields, confirmed, cleared.data)).toEqual({
      confirmedAt: null,
      confirmedBy: null,
    });
  });

  it('reads dictionary roots line by line', () => {
    const fields = ALL_FORMS['feed-rules'];
    const r = fromForm(fields, {
      ...toForm(fields, { sources: [] }),
      'dictionary.uk.topics': 'Озелен\n\n сквер ',
      'dictionary.uk.pairs': 'зелен зон',
      'dictionary.en.topics': 'park',
    });
    expect(r.errors).toEqual({});
    expect(r.data['dictionary']).toEqual({
      uk: { topics: ['озелен', 'сквер'], pairs: [['зелен', 'зон']], stop: [] },
      en: { topics: ['park'], pairs: [], stop: [] },
    });
    const bad = fromForm(fields, {
      ...toForm(fields, { sources: [] }),
      'dictionary.uk.pairs': 'одне',
    });
    expect(bad.errors['dictionary.uk.pairs']).toMatch(/два корені/u);
  });

  it('checks public document rules across fields', () => {
    expect(crossCheck('public-docs', { publishedWhere: 'parent' })).toHaveProperty('externalUrl');
    expect(
      crossCheck('public-docs', { publishedWhere: 'request', externalUrl: 'https://a.b' }),
    ).toHaveProperty('externalUrl');
    expect(crossCheck('public-docs', { publishedWhere: 'request', featured: true })).toHaveProperty(
      'featured',
    );
    expect(
      crossCheck('public-docs', { publishedWhere: 'parent', externalUrl: 'https://a.b' }),
    ).toEqual({});
  });

  it('wants a file instead of a link for a document on this site', () => {
    const file = 'media/public-docs/statut-1a2b3c4d.pdf';
    expect(crossCheck('public-docs', { publishedWhere: 'own' })).toHaveProperty('filePath');
    expect(
      crossCheck('public-docs', {
        publishedWhere: 'own',
        filePath: file,
        externalUrl: 'https://a.b',
      }),
    ).toHaveProperty('externalUrl');
    expect(
      crossCheck('public-docs', {
        publishedWhere: 'parent',
        externalUrl: 'https://a.b',
        filePath: file,
      }),
    ).toHaveProperty('filePath');
    expect(
      crossCheck('public-docs', { publishedWhere: 'own', filePath: file, featured: true }),
    ).toEqual({});
  });

  it('maps server error paths to form fields', () => {
    const fields = ALL_FORMS.enterprise;
    const state = toForm(fields, enterprise.items[0] as Record<string, unknown>);
    const known = fieldKeys(fields, state);
    expect(errorKeyFor('nameFull.uk', known)).toBe('nameFull');
    expect(errorKeyFor('kved.0.title.uk', known)).toBe('kved.0.title');
    expect(errorKeyFor('nothing', known)).toBeNull();
  });
});
