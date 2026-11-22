import { describe, expect, it } from 'vitest';
import { compareCounts, dumpCounts, summary } from './counts.js';

const LOG = [
  '2026-11-22T12:00:00.100+0000\twriting uzn.content to archive on stdout',
  '2026-11-22T12:00:00.200+0000\tdone dumping uzn.content (126 documents)',
  '2026-11-22T12:00:00.210+0000\tdone dumping uzn.users (1 document)',
  '2026-11-22T12:00:00.220+0000\tdone dumping uzn.moderation (0 documents)',
  // Так пишет настоящий `mongodump` 100.x (прогон 22.11.2026): с обратными кавычками.
  '2026-11-22T12:00:00.230+0000\tdone dumping `uzn.action_log` (412 documents)',
].join('\n');

describe('backup counts (TZ 9.6, п. 8)', () => {
  it('reads per-collection counts from the mongodump log', () => {
    expect(dumpCounts(LOG)).toEqual({ content: 126, users: 1, moderation: 0, action_log: 412 });
  });

  it('passes only when every collection matches', () => {
    const dumped = dumpCounts(LOG);
    expect(compareCounts(dumped, { ...dumped }).ok).toBe(true);
    expect(compareCounts(dumped, { ...dumped, content: 125 }).ok).toBe(false);
    const missing = compareCounts(dumped, { content: 126, users: 1, moderation: 0 });
    expect(missing.ok).toBe(false);
    expect(missing.rows.find((r) => r.collection === 'action_log')).toEqual({
      collection: 'action_log',
      dumped: 412,
      restored: null,
    });
    expect(compareCounts(dumped, { ...dumped, extra: 3 }).ok).toBe(false);
  });

  it('an empty dump log is a failure, not an empty success', () => {
    expect(compareCounts({}, {}).ok).toBe(false);
  });

  it('summary has names and numbers only', () => {
    const check = compareCounts(dumpCounts(LOG), dumpCounts(LOG));
    const md = summary(check, 'uzn-backup-2026-11-22-run1.archive.gz.age', 20480);
    expect(md).toContain('перевірена');
    expect(md).toContain('| `content` | 126 | 126 |');
    expect(md).toContain('Усього документів: 539.');
  });
});
