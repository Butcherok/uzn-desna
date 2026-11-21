import { UPLOAD_TARGETS } from '@uzn/shared';
import { describe, expect, it } from 'vitest';
import { kindDef } from './content-kinds.js';
import type { ContentKind } from './model.js';

describe('UPLOAD_TARGETS', () => {
  it('names the same title field the server builds the slug from', () => {
    for (const [kind, t] of Object.entries(UPLOAD_TARGETS)) {
      expect(kindDef(kind as ContentKind).titleField).toBe(t.titleField);
    }
  });
});
