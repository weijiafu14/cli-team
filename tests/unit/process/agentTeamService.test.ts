/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

vi.mock('@process/database', () => ({
  getDatabase: () => ({
    runInTransaction: (callback: () => void) => callback(),
    createConversation: () => ({ success: true }),
    updateConversation: () => ({ success: true }),
  }),
}));

vi.mock('@process/initStorage', () => ({
  getSystemDir: vi.fn(() => os.tmpdir()),
}));

vi.mock('@process/initAgent', () => ({
  createAcpAgent: vi.fn(),
  createGeminiAgent: vi.fn(),
}));

vi.mock('@/common/ipcBridge', () => ({
  agentTeam: {
    timelineStream: {
      emit: vi.fn(),
    },
  },
}));

import { AgentTeamService } from '../../../src/process/services/agentTeam/AgentTeamService';
import type { IAgentTeamMember, TChatConversation } from '@/common/storage';
import type { IConversationRepository } from '@process/database/IConversationRepository';
import type { IConversationService } from '@process/services/IConversationService';
import type { IWorkerTaskManager } from '@process/task/IWorkerTaskManager';

const createMembers = (): IAgentTeamMember[] =>
  [
    {
      memberId: 'member-claude',
      conversationId: 'conv-claude',
      name: 'Claude Code',
      type: 'acp',
      backend: 'claude',
    },
    {
      memberId: 'member-gemini',
      conversationId: 'conv-gemini',
      name: 'Gemini CLI',
      type: 'gemini',
      backend: 'gemini',
    },
  ] as IAgentTeamMember[];

const createTeamConversation = (
  coordDir: string,
  members: IAgentTeamMember[]
): Extract<TChatConversation, { type: 'agent-team' }> =>
  ({
    id: 'team-1',
    name: 'Team',
    type: 'agent-team',
    createTime: Date.now(),
    modifyTime: Date.now(),
    source: 'aionui',
    extra: {
      workspace: path.dirname(path.dirname(path.dirname(coordDir))),
      customWorkspace: true,
      coordDir,
      dispatchPolicy: 'user-priority',
      defaultView: 'timeline',
      members,
    },
  }) as Extract<TChatConversation, { type: 'agent-team' }>;

describe('AgentTeamService interrupt send', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
  });

  it('interrupts only the targeted member before appending a targeted message', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-team-service-'));
    tempDirs.push(root);
    const coordDir = path.join(root, '.agents', 'teams', 'team-1', 'coord');
    await fs.mkdir(coordDir, { recursive: true });
    const messagesPath = path.join(coordDir, 'messages.jsonl');
    await fs.writeFile(messagesPath, '', 'utf-8');

    const members = createMembers();
    const teamConversation = createTeamConversation(coordDir, members);
    const repo = {
      getConversation: vi.fn((id: string) => (id === 'team-1' ? teamConversation : undefined)),
      listAllConversations: vi.fn(() => [teamConversation]),
    } satisfies Pick<IConversationRepository, 'getConversation' | 'listAllConversations'>;
    const conversationService = {
      updateConversation: vi.fn().mockResolvedValue(true),
    } satisfies Pick<IConversationService, 'updateConversation'>;
    const workerTaskManager = {
      kill: vi.fn(),
    } satisfies Pick<IWorkerTaskManager, 'kill'>;
    const interruptMembers = vi.fn();

    const service = new AgentTeamService(
      repo as unknown as IConversationRepository,
      conversationService as unknown as IConversationService,
      workerTaskManager as unknown as IWorkerTaskManager
    );
    (service as unknown as { dispatchers: Map<string, { interruptMembers: typeof interruptMembers }> }).dispatchers.set(
      'team-1',
      {
        interruptMembers,
      }
    );

    const entry = await service.sendMessage({
      conversationId: 'team-1',
      input: '@Claude Code 紧急处理',
      targets: ['member-claude'],
      interrupt: true,
    });

    expect(interruptMembers).toHaveBeenCalledWith(['member-claude']);
    expect(entry.dispatch).toBe('targets');
    expect(entry.to).toEqual(['member-claude']);

    const stored = await fs.readFile(messagesPath, 'utf-8');
    expect(stored).toContain('"dispatch":"targets"');
    expect(stored).toContain('"to":["member-claude"]');
  });

  it('interrupts all members when interrupt mode is enabled without @mentions', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-team-service-'));
    tempDirs.push(root);
    const coordDir = path.join(root, '.agents', 'teams', 'team-1', 'coord');
    await fs.mkdir(coordDir, { recursive: true });
    await fs.writeFile(path.join(coordDir, 'messages.jsonl'), '', 'utf-8');

    const members = createMembers();
    const teamConversation = createTeamConversation(coordDir, members);
    const repo = {
      getConversation: vi.fn((id: string) => (id === 'team-1' ? teamConversation : undefined)),
      listAllConversations: vi.fn(() => [teamConversation]),
    } satisfies Pick<IConversationRepository, 'getConversation' | 'listAllConversations'>;
    const conversationService = {
      updateConversation: vi.fn().mockResolvedValue(true),
    } satisfies Pick<IConversationService, 'updateConversation'>;
    const workerTaskManager = {
      kill: vi.fn(),
    } satisfies Pick<IWorkerTaskManager, 'kill'>;
    const interruptMembers = vi.fn();

    const service = new AgentTeamService(
      repo as unknown as IConversationRepository,
      conversationService as unknown as IConversationService,
      workerTaskManager as unknown as IWorkerTaskManager
    );
    (service as unknown as { dispatchers: Map<string, { interruptMembers: typeof interruptMembers }> }).dispatchers.set(
      'team-1',
      {
        interruptMembers,
      }
    );

    const entry = await service.sendMessage({
      conversationId: 'team-1',
      input: '全员停一下，先看这个',
      interrupt: true,
    });

    expect(interruptMembers).toHaveBeenCalledWith(undefined);
    expect(entry.dispatch).toBe('all');
    expect(entry.to).toEqual(['*']);
  });
});
