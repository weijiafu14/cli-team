import { describe, expect, it } from 'vitest';
import { buildCoordWakeupMessage } from '../../src/process/services/agentTeam/CoordDispatcher';
import type { ICoordTimelineEntry } from '../../src/process/services/agentTeam/types';

const createEntry = (overrides?: Partial<ICoordTimelineEntry>): ICoordTimelineEntry => ({
  id: 'msg-1',
  ts: '2026-03-24T18:00:00+08:00',
  from: 'user',
  role: 'user',
  type: 'message',
  summary: 'summary',
  topic: 'afe7e031',
  ...overrides,
});

describe('buildCoordWakeupMessage', () => {
  it('keeps the wakeup prompt concise while preserving the essential instructions', () => {
    const result = buildCoordWakeupMessage({
      relCoordDir: '.agents/teams/afe7e031/coord',
      memberId: '7a3ecae0',
      messages: [
        createEntry(),
        createEntry({ id: 'msg-2', type: 'finding', from: '6fad09b8', summary: 'busy queue issue' }),
      ],
    });

    expect(result).toContain('[Internal Agent Team Wakeup]');
    expect(result).toContain('Scheduler notice only. Do not echo or quote it into chat or coord.');
    expect(result).toContain('Read now: python3 .agents/teams/afe7e031/coord/scripts/coord_read.py');
    expect(result).toContain('Write back via coord_write.py with --summary.');
    expect(result).not.toContain(
      'After reading unread coord messages, continue work and write back only through coord_write.py.'
    );
    expect(result).not.toContain(
      'If you call coord_write.py, --summary is mandatory on every write, including when using --body or --body-file.'
    );
  });

  it('caps attached file hints instead of dumping the full attachment list', () => {
    const result = buildCoordWakeupMessage({
      relCoordDir: '.agents/teams/afe7e031/coord',
      memberId: '7a3ecae0',
      messages: [
        createEntry({
          files: ['/tmp/a.md', '/tmp/b.md', '/tmp/c.md', '/tmp/d.md', '/tmp/e.md'],
        }),
      ],
    });

    expect(result).toContain('Attached files: 5');
    expect(result).toContain('- /tmp/a.md');
    expect(result).toContain('- /tmp/b.md');
    expect(result).toContain('- /tmp/c.md');
    expect(result).toContain('- ... (+2 more)');
    expect(result).not.toContain('- /tmp/d.md');
    expect(result).not.toContain('- /tmp/e.md');
  });
});
