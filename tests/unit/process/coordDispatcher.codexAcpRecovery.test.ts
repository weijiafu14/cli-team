import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { IAgentTeamMember } from '@/common/storage';

const mockGetConversation = vi.fn();
const mockUpdateConversation = vi.fn();

vi.mock('@process/database', () => ({
  getDatabase: () => ({
    getConversation: mockGetConversation,
    updateConversation: mockUpdateConversation,
  }),
}));

import { CoordDispatcher } from '../../../src/process/services/agentTeam/CoordDispatcher';

type DispatcherWithInternals = CoordDispatcher & {
  clearCodexAcpResumeStateIfNeeded: (member: IAgentTeamMember) => void;
};

const createMember = (overrides?: Partial<IAgentTeamMember>): IAgentTeamMember =>
  ({
    conversationId: 'conv-codex-acp',
    memberId: 'member-codex-acp',
    name: 'Codex ACP',
    type: 'acp',
    backend: 'codex',
    cliPath: '',
    createdAt: Date.now(),
    ...overrides,
  }) as IAgentTeamMember;

describe('CoordDispatcher codex-over-acp poisoned recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('clears persisted acpSessionId for a codex-over-acp member', () => {
    mockGetConversation.mockReturnValue({
      success: true,
      data: {
        id: 'conv-codex-acp',
        type: 'acp',
        extra: {
          acpSessionId: 'stale-session-id',
          acpSessionUpdatedAt: 1234567890,
          sessionMode: 'default',
        },
      },
    });

    const dispatcher = new CoordDispatcher(
      '/tmp/coord',
      [createMember()],
      {} as never,
      'user-priority'
    ) as DispatcherWithInternals;

    dispatcher.clearCodexAcpResumeStateIfNeeded(createMember());

    expect(mockUpdateConversation).toHaveBeenCalledWith(
      'conv-codex-acp',
      expect.objectContaining({
        extra: expect.not.objectContaining({
          acpSessionId: expect.anything(),
          acpSessionUpdatedAt: expect.anything(),
        }),
      })
    );
  });

  it('does not touch conversation extra for non-codex ACP members', () => {
    const dispatcher = new CoordDispatcher(
      '/tmp/coord',
      [createMember({ conversationId: 'conv-claude-acp', memberId: 'member-claude', backend: 'claude' })],
      {} as never,
      'user-priority'
    ) as DispatcherWithInternals;

    dispatcher.clearCodexAcpResumeStateIfNeeded(
      createMember({ conversationId: 'conv-claude-acp', memberId: 'member-claude', backend: 'claude' })
    );

    expect(mockGetConversation).not.toHaveBeenCalled();
    expect(mockUpdateConversation).not.toHaveBeenCalled();
  });
});
