import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAutoCompactionOrchestrator } from '@process/services/autoCompaction';

const mockDbRefs = vi.hoisted(() => ({
  getConversation: vi.fn(),
  updateConversation: vi.fn(),
}));

const mockAutoCompactionRefs = vi.hoisted(() => ({
  isSessionPoisoned: vi.fn(),
  removeState: vi.fn(),
  clearPoisonedState: vi.fn(),
  reset: vi.fn(),
}));

vi.mock('@process/database', () => ({
  getDatabase: () => ({
    getConversation: mockDbRefs.getConversation,
    updateConversation: mockDbRefs.updateConversation,
  }),
}));

vi.mock('@process/services/autoCompaction', () => ({
  getAutoCompactionOrchestrator: () => mockAutoCompactionRefs,
}));

import {
  buildCoordWakeupMessage,
  CoordDispatcher,
  evaluateConsensusProgress,
} from '../../src/process/services/agentTeam/CoordDispatcher';
import type { IAgentTeamMember } from '@/common/storage';
import type { ICoordTimelineEntry } from '../../src/process/services/agentTeam/types';
import type { IWorkerTaskManager } from '../../src/process/task/IWorkerTaskManager';

type DispatcherMemberState = {
  member: IAgentTeamMember;
  busy: boolean;
  pendingMessages: ICoordTimelineEntry[];
};

type DispatcherWithInternals = CoordDispatcher & {
  memberStates: Map<string, DispatcherMemberState>;
};

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
    expect(result).toContain("Write coord summary/body in the user's language");
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

describe('CoordDispatcher interruptMembers', () => {
  beforeEach(() => {
    mockDbRefs.getConversation.mockReset();
    mockDbRefs.updateConversation.mockReset();
    mockAutoCompactionRefs.isSessionPoisoned.mockReset();
    mockAutoCompactionRefs.removeState.mockReset();
    mockAutoCompactionRefs.clearPoisonedState.mockReset();
    mockAutoCompactionRefs.reset.mockReset();
  });

  afterEach(() => {
    mockAutoCompactionRefs.isSessionPoisoned.mockReset();
    mockAutoCompactionRefs.removeState.mockReset();
    mockAutoCompactionRefs.clearPoisonedState.mockReset();
    mockAutoCompactionRefs.reset.mockReset();
  });

  it('kills and clears only the targeted member state', async () => {
    const members = [
      createMember(),
      createMember({
        conversationId: 'conv-claude',
        memberId: 'member-claude',
        name: 'Claude',
      }),
    ];
    const workerTaskManager = {
      getTask: vi.fn((id: string) =>
        id === 'conv-codex'
          ? ({
              stop: vi.fn().mockResolvedValue(undefined),
            } as unknown)
          : ({
              stop: vi.fn().mockResolvedValue(undefined),
            } as unknown)
      ),
      kill: vi.fn(),
    } as unknown as IWorkerTaskManager;
    const dispatcher = new CoordDispatcher(
      '/tmp/coord',
      members,
      workerTaskManager,
      'user-priority'
    ) as DispatcherWithInternals;

    const codexState = dispatcher.memberStates.get('conv-codex');
    const claudeState = dispatcher.memberStates.get('conv-claude');
    expect(codexState).toBeDefined();
    expect(claudeState).toBeDefined();
    if (!codexState || !claudeState) {
      throw new Error('Expected dispatcher member states to exist');
    }
    codexState.busy = true;
    codexState.pendingMessages = [createEntry({ id: 'pending-codex' })];
    claudeState.busy = true;
    claudeState.pendingMessages = [createEntry({ id: 'pending-claude' })];

    await dispatcher.interruptMembers(['member-codex']);

    expect(workerTaskManager.kill).toHaveBeenCalledTimes(1);
    expect(workerTaskManager.kill).toHaveBeenCalledWith('conv-codex');
    expect(codexState.busy).toBe(false);
    expect(codexState.pendingMessages).toEqual([]);
    expect(claudeState.busy).toBe(true);
    expect(claudeState.pendingMessages).toHaveLength(1);
  });

  it('kills and clears all member states when no targets are provided', async () => {
    const members = [
      createMember(),
      createMember({
        conversationId: 'conv-claude',
        memberId: 'member-claude',
        name: 'Claude',
      }),
    ];
    const workerTaskManager = {
      getTask: vi.fn(() => ({
        stop: vi.fn().mockResolvedValue(undefined),
      })),
      kill: vi.fn(),
    } as unknown as IWorkerTaskManager;
    const dispatcher = new CoordDispatcher(
      '/tmp/coord',
      members,
      workerTaskManager,
      'user-priority'
    ) as DispatcherWithInternals;

    for (const state of dispatcher.memberStates.values()) {
      state.busy = true;
      state.pendingMessages = [createEntry({ id: `pending-${state.member.memberId}` })];
    }

    await dispatcher.interruptMembers();

    expect(workerTaskManager.kill).toHaveBeenCalledTimes(2);
    expect(workerTaskManager.kill).toHaveBeenCalledWith('conv-codex');
    expect(workerTaskManager.kill).toHaveBeenCalledWith('conv-claude');
    for (const state of dispatcher.memberStates.values()) {
      expect(state.busy).toBe(false);
      expect(state.pendingMessages).toEqual([]);
    }
  });

  it('waits for stop to finish before killing the targeted task', async () => {
    let resolveStop: (() => void) | undefined;
    const stop = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveStop = resolve;
        })
    );
    const workerTaskManager = {
      getTask: vi.fn(() => ({ stop })),
      kill: vi.fn(),
    } as unknown as IWorkerTaskManager;
    const dispatcher = new CoordDispatcher('/tmp/coord', [createMember()], workerTaskManager, 'user-priority');

    const interruptPromise = dispatcher.interruptMembers(['member-codex']);

    expect(stop).toHaveBeenCalledTimes(1);
    expect(workerTaskManager.kill).not.toHaveBeenCalled();

    resolveStop?.();
    await interruptPromise;

    expect(workerTaskManager.kill).toHaveBeenCalledWith('conv-codex');
  });

  it('takes the poisoned-session redispatch path for Codex-over-ACP conversations', async () => {
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const workerTaskManager = {
      getTask: vi.fn(() => ({
        stop: vi.fn().mockResolvedValue(undefined),
      })),
      kill: vi.fn(),
      getOrBuildTask: vi.fn().mockResolvedValue({
        sendMessage,
      }),
    } as unknown as IWorkerTaskManager;

    mockDbRefs.getConversation.mockReturnValue({
      success: true,
      data: {
        id: 'conv-codex',
        type: 'acp',
        extra: {
          acpSessionId: 'poisoned-thread',
          acpSessionUpdatedAt: 123,
          foo: 'bar',
        },
      },
    });

    const dispatcher = new CoordDispatcher(
      '/tmp/coord',
      [
        createMember({
          backend: 'codex',
          type: 'acp',
        }),
      ],
      workerTaskManager,
      'user-priority'
    ) as DispatcherWithInternals;

    const orchestrator = getAutoCompactionOrchestrator() as unknown as typeof mockAutoCompactionRefs;
    orchestrator.isSessionPoisoned.mockReturnValue(true);

    const codexState = dispatcher.memberStates.get('conv-codex');
    if (!codexState) {
      throw new Error('Expected Codex member state to exist');
    }

    await (dispatcher as any).dispatchToMember(
      codexState,
      createEntry({
        id: 'user-msg',
        topic: 'a0f736de',
        task_id: 'a0f736de',
      })
    );

    expect(workerTaskManager.kill).toHaveBeenCalledWith('conv-codex');
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        internal: true,
      })
    );
    expect(orchestrator.removeState).toHaveBeenCalledWith('conv-codex');
    expect(orchestrator.clearPoisonedState).toHaveBeenCalledWith('conv-codex');
  });

  it('clears persisted acpSessionId for Codex-over-ACP conversations', () => {
    mockDbRefs.getConversation.mockReturnValue({
      success: true,
      data: {
        id: 'conv-codex',
        type: 'acp',
        extra: {
          acpSessionId: 'poisoned-thread',
          acpSessionUpdatedAt: 123,
          foo: 'bar',
        },
      },
    });

    const dispatcher = new CoordDispatcher(
      '/tmp/coord',
      [
        createMember({
          backend: 'codex',
          type: 'acp',
        }),
      ],
      {} as unknown as IWorkerTaskManager,
      'user-priority'
    );

    (dispatcher as any).clearCodexAcpResumeStateIfNeeded(
      createMember({
        conversationId: 'conv-codex',
        backend: 'codex',
        type: 'acp',
      })
    );

    expect(mockDbRefs.updateConversation).toHaveBeenCalledWith(
      'conv-codex',
      expect.objectContaining({
        extra: {
          foo: 'bar',
        },
      })
    );
  });
});
