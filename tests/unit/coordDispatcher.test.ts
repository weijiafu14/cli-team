import { describe, expect, it } from 'vitest';
import {
  buildCoordWakeupMessage,
  evaluateConsensusProgress,
} from '../../src/process/services/agentTeam/CoordDispatcher';
import type { IAgentTeamMember } from '@/common/storage';
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

const createMember = (overrides?: Partial<IAgentTeamMember>): IAgentTeamMember =>
  ({
    conversationId: 'conv-codex',
    memberId: 'member-codex',
    name: 'Codex',
    type: 'acp',
    backend: 'claude',
    cliPath: '',
    createdAt: Date.now(),
    ...overrides,
  }) as IAgentTeamMember;

describe('evaluateConsensusProgress', () => {
  const members = [
    createMember(),
    createMember({
      conversationId: 'conv-claude',
      memberId: 'member-claude',
      name: 'Claude',
    }),
  ];

  it('ignores decisions from a different topic and waits for a scoped final decision', () => {
    const progress = evaluateConsensusProgress(
      [
        createEntry({
          id: 'consensus-1',
          type: 'consensus',
          topic: 'afe7e031',
          task_id: 'afe7e031',
        }),
        createEntry({
          id: 'decision-general',
          from: '7af95706',
          role: 'agent',
          type: 'decision',
          topic: 'general',
          task_id: '',
        }),
      ],
      members
    );

    expect(progress).toEqual({ status: 'waiting-decision' });
  });

  it('treats an earlier fully-ACKed decision as already resolved even if a later decision appears', () => {
    const progress = evaluateConsensusProgress(
      [
        createEntry({
          id: 'consensus-1',
          type: 'consensus',
          topic: 'afe7e031',
          task_id: 'afe7e031',
        }),
        createEntry({
          id: 'decision-1',
          from: '7af95706',
          role: 'agent',
          type: 'decision',
          topic: 'afe7e031',
          task_id: 'afe7e031',
        }),
        createEntry({
          id: 'ack-1',
          from: 'member-codex',
          role: 'agent',
          type: 'ack',
          reply_to: 'decision-1',
        }),
        createEntry({
          id: 'ack-2',
          from: 'member-claude',
          role: 'agent',
          type: 'ack',
          reply_to: 'decision-1',
        }),
        createEntry({
          id: 'decision-2',
          from: '7af95706',
          role: 'agent',
          type: 'decision',
          topic: 'afe7e031',
          task_id: 'afe7e031',
        }),
        createEntry({
          id: 'ack-3',
          from: 'member-codex',
          role: 'agent',
          type: 'ack',
          reply_to: 'decision-2',
        }),
      ],
      members
    );

    expect(progress).toEqual({
      status: 'reached',
      finalDecisionId: 'decision-1',
    });
  });

  it('does not let a later scoped conclusion steal the ACK target from an existing decision', () => {
    const progress = evaluateConsensusProgress(
      [
        createEntry({
          id: 'consensus-1',
          type: 'consensus',
          topic: 'afe7e031',
          task_id: 'afe7e031',
        }),
        createEntry({
          id: 'decision-1',
          from: '7af95706',
          role: 'agent',
          type: 'decision',
          topic: 'afe7e031',
          task_id: 'afe7e031',
        }),
        createEntry({
          id: 'ack-1',
          from: 'member-codex',
          role: 'agent',
          type: 'ack',
          reply_to: 'decision-1',
        }),
        createEntry({
          id: 'conclusion-1',
          from: '7af95706',
          role: 'agent',
          type: 'conclusion',
          topic: 'afe7e031',
          task_id: 'afe7e031',
        }),
      ],
      members
    );

    expect(progress).toEqual({
      status: 'awaiting-acks',
      finalDecisionId: 'decision-1',
      missingConversationIds: ['conv-claude'],
    });
  });

  it('waits for a decision when the window only contains a scoped conclusion', () => {
    const progress = evaluateConsensusProgress(
      [
        createEntry({
          id: 'consensus-1',
          type: 'consensus',
          topic: 'afe7e031',
          task_id: 'afe7e031',
        }),
        createEntry({
          id: 'conclusion-1',
          from: '7af95706',
          role: 'agent',
          type: 'conclusion',
          topic: 'afe7e031',
          task_id: 'afe7e031',
        }),
        createEntry({
          id: 'ack-1',
          from: 'member-codex',
          role: 'agent',
          type: 'ack',
          reply_to: 'conclusion-1',
        }),
      ],
      members
    );

    expect(progress).toEqual({ status: 'waiting-decision' });
  });

  it('ends consensus once any scoped decision already has full ACK coverage, even if a later decision appears', () => {
    const progress = evaluateConsensusProgress(
      [
        createEntry({
          id: 'consensus-1',
          type: 'consensus',
          topic: 'afe7e031',
          task_id: 'afe7e031',
        }),
        createEntry({
          id: 'decision-1',
          from: '7af95706',
          role: 'agent',
          type: 'decision',
          topic: 'afe7e031',
          task_id: 'afe7e031',
        }),
        createEntry({
          id: 'ack-1',
          from: 'member-codex',
          role: 'agent',
          type: 'ack',
          reply_to: 'decision-1',
        }),
        createEntry({
          id: 'ack-2',
          from: 'member-claude',
          role: 'agent',
          type: 'ack',
          reply_to: 'decision-1',
        }),
        createEntry({
          id: 'decision-2',
          from: '7af95706',
          role: 'agent',
          type: 'decision',
          topic: 'afe7e031',
          task_id: 'afe7e031',
        }),
      ],
      members
    );

    expect(progress).toEqual({
      status: 'reached',
      finalDecisionId: 'decision-1',
    });
  });

  it('marks consensus reached when all active members ACK the same scoped decision', () => {
    const progress = evaluateConsensusProgress(
      [
        createEntry({
          id: 'consensus-1',
          type: 'consensus',
          topic: 'afe7e031',
          task_id: 'afe7e031',
        }),
        createEntry({
          id: 'decision-1',
          from: '7af95706',
          role: 'agent',
          type: 'decision',
          topic: 'afe7e031',
          task_id: 'afe7e031',
        }),
        createEntry({
          id: 'ack-1',
          from: 'member-codex',
          role: 'agent',
          type: 'ack',
          reply_to: 'decision-1',
        }),
        createEntry({
          id: 'ack-2',
          from: 'member-claude',
          role: 'agent',
          type: 'ack',
          reply_to: 'decision-1',
        }),
      ],
      members
    );

    expect(progress).toEqual({
      status: 'reached',
      finalDecisionId: 'decision-1',
    });
  });

  it('stops enforcing an old consensus after a newer user message appears', () => {
    const progress = evaluateConsensusProgress(
      [
        createEntry({
          id: 'consensus-1',
          type: 'consensus',
          topic: 'afe7e031',
          task_id: 'afe7e031',
        }),
        createEntry({
          id: 'user-followup',
          type: 'message',
          topic: 'afe7e031',
          task_id: 'afe7e031',
        }),
      ],
      members
    );

    expect(progress).toEqual({ status: 'inactive' });
  });
});
