/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { execFile } from 'node:child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { promisify } from 'node:util';

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
import { createAcpAgent, createGeminiAgent } from '@process/initAgent';
import type { IConversationRepository } from '@process/database/IConversationRepository';
import type { IConversationService } from '@process/services/IConversationService';
import type { IWorkerTaskManager } from '@process/task/IWorkerTaskManager';

const execFileAsync = promisify(execFile);

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

describe('AgentTeamService protocol language injection', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    vi.mocked(createAcpAgent).mockReset();
    vi.mocked(createGeminiAgent).mockReset();
    await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
  });

  it('writes the user-language rule into generated team protocol assets', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-team-protocol-assets-'));
    tempDirs.push(root);
    const coordDir = path.join(root, '.agents', 'teams', 'team-1', 'coord');
    const service = new AgentTeamService(
      {} as IConversationRepository,
      {} as IConversationService,
      {} as IWorkerTaskManager
    );

    await (
      service as unknown as {
        ensureTeamWorkspace: (
          dir: string,
          workspace: string,
          teamName: string,
          memberDefs: Array<{ name: string; type: string; backend?: string; memberId: string }>,
          teamId: string
        ) => Promise<void>;
      }
    ).ensureTeamWorkspace(
      coordDir,
      root,
      'Team',
      [{ name: 'Codex', type: 'acp', backend: 'claude', memberId: 'member-codex' }],
      'team-1'
    );

    const protocolContent = await fs.readFile(path.join(coordDir, 'protocol.md'), 'utf-8');
    const skillContent = await fs.readFile(path.join(coordDir, 'SKILL.md'), 'utf-8');

    expect(protocolContent).toContain("they MUST use the user's language");
    expect(skillContent).toContain("use the user's language");
  });

  it('injects the user-language rule into acp preset prompts', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-team-protocol-prompt-'));
    tempDirs.push(root);

    vi.mocked(createAcpAgent).mockResolvedValue({
      id: 'conv-codex',
      name: 'Codex',
      type: 'acp',
      createTime: Date.now(),
      modifyTime: Date.now(),
      source: 'aionui',
      extra: {},
    } as Extract<TChatConversation, { type: 'acp' }>);

    const service = new AgentTeamService(
      {} as IConversationRepository,
      {} as IConversationService,
      {} as IWorkerTaskManager
    );

    await (
      service as unknown as {
        createMemberConversation: (
          member: {
            name: string;
            type: 'acp';
            backend: 'claude';
            memberId: string;
          },
          workspace: string,
          customWorkspace: boolean,
          teamId: string,
          teamName: string,
          coordDir: string
        ) => Promise<Extract<TChatConversation, { type: 'acp' }>>;
      }
    ).createMemberConversation(
      {
        name: 'Codex',
        type: 'acp',
        backend: 'claude',
        memberId: 'member-codex',
      },
      root,
      true,
      'team-1',
      'Team',
      path.join(root, '.agents', 'teams', 'team-1', 'coord')
    );

    expect(vi.mocked(createAcpAgent)).toHaveBeenCalledWith(
      expect.objectContaining({
        extra: expect.objectContaining({
          presetContext: expect.stringContaining("use the user's language"),
        }),
      })
    );
  });
});

describe('AgentTeamService coord_write guardrails', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
  });

  it('forces ack messages to stay no-wakeup even when an agent asks for broadcast', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-team-coord-write-'));
    tempDirs.push(root);
    const coordDir = path.join(root, '.agents', 'teams', 'team-1', 'coord');
    await fs.mkdir(path.join(coordDir, 'scripts'), { recursive: true });
    const service = new AgentTeamService(
      {} as IConversationRepository,
      {} as IConversationService,
      {} as IWorkerTaskManager
    );

    await (
      service as unknown as { writeCoordScripts: (dir: string, teamId: string) => Promise<void> }
    ).writeCoordScripts(coordDir, 'team-1');

    const scriptPath = path.join(coordDir, 'scripts', 'coord_write.py');
    const messagesPath = path.join(coordDir, 'messages.jsonl');
    const attachmentsDir = path.join(coordDir, 'attachments');
    const locksDir = path.join(coordDir, 'locks');

    const { stdout } = await execFileAsync('python3', [
      scriptPath,
      '--messages',
      messagesPath,
      '--attachments-dir',
      attachmentsDir,
      '--locks-dir',
      locksDir,
      '--agent-id',
      'member-codex',
      '--type',
      'ack',
      '--summary',
      'ack summary',
      '--dispatch',
      'all',
    ]);

    const entry = JSON.parse(stdout);
    expect(entry.dispatch).toBe('none');
    expect(entry.to).toEqual(['user']);
  });

  it('auto-acquires a task lock when an agent sends a claim with task-id', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-team-coord-write-'));
    tempDirs.push(root);
    const coordDir = path.join(root, '.agents', 'teams', 'team-1', 'coord');
    await fs.mkdir(path.join(coordDir, 'scripts'), { recursive: true });
    const service = new AgentTeamService(
      {} as IConversationRepository,
      {} as IConversationService,
      {} as IWorkerTaskManager
    );

    await (
      service as unknown as { writeCoordScripts: (dir: string, teamId: string) => Promise<void> }
    ).writeCoordScripts(coordDir, 'team-1');

    const scriptPath = path.join(coordDir, 'scripts', 'coord_write.py');
    const messagesPath = path.join(coordDir, 'messages.jsonl');
    const attachmentsDir = path.join(coordDir, 'attachments');
    const locksDir = path.join(coordDir, 'locks');

    // Agent A claims task "fix-bug"
    const { stdout: claimA } = await execFileAsync('python3', [
      scriptPath,
      '--messages',
      messagesPath,
      '--attachments-dir',
      attachmentsDir,
      '--locks-dir',
      locksDir,
      '--agent-id',
      'agent-A',
      '--type',
      'claim',
      '--task-id',
      'fix-bug',
      '--summary',
      'I claim this',
    ]);

    const entryA = JSON.parse(claimA);
    expect(entryA.lock).toBeDefined();
    expect(entryA.lock.key).toBe('task-fix-bug');
    expect(entryA.lock.status).toBe('acquired');

    // Agent B tries to claim same task — should be blocked
    try {
      await execFileAsync('python3', [
        scriptPath,
        '--messages',
        messagesPath,
        '--attachments-dir',
        attachmentsDir,
        '--locks-dir',
        locksDir,
        '--agent-id',
        'agent-B',
        '--type',
        'claim',
        '--task-id',
        'fix-bug',
        '--summary',
        'I also want this',
      ]);
      // If it didn't throw, check exit code via stdout
    } catch (error: unknown) {
      // execFile rejects on non-zero exit — exit code 2 means blocked
      const err = error as { code: number; stdout: string };
      expect(err.code).toBe(2);
      const entryB = JSON.parse(err.stdout);
      expect(entryB.lock.status).toBe('blocked');
      expect(entryB.lock.owner).toBe('agent-A');
    }
  });

  it('auto-releases the task lock when the owner sends done', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-team-coord-write-'));
    tempDirs.push(root);
    const coordDir = path.join(root, '.agents', 'teams', 'team-1', 'coord');
    await fs.mkdir(path.join(coordDir, 'scripts'), { recursive: true });
    const service = new AgentTeamService(
      {} as IConversationRepository,
      {} as IConversationService,
      {} as IWorkerTaskManager
    );

    await (
      service as unknown as { writeCoordScripts: (dir: string, teamId: string) => Promise<void> }
    ).writeCoordScripts(coordDir, 'team-1');

    const scriptPath = path.join(coordDir, 'scripts', 'coord_write.py');
    const messagesPath = path.join(coordDir, 'messages.jsonl');
    const attachmentsDir = path.join(coordDir, 'attachments');
    const locksDir = path.join(coordDir, 'locks');

    // Agent A claims task
    await execFileAsync('python3', [
      scriptPath,
      '--messages',
      messagesPath,
      '--attachments-dir',
      attachmentsDir,
      '--locks-dir',
      locksDir,
      '--agent-id',
      'agent-A',
      '--type',
      'claim',
      '--task-id',
      'fix-bug',
      '--summary',
      'claiming',
    ]);

    // Agent A sends done — lock auto-released
    const { stdout: doneOutput } = await execFileAsync('python3', [
      scriptPath,
      '--messages',
      messagesPath,
      '--attachments-dir',
      attachmentsDir,
      '--locks-dir',
      locksDir,
      '--agent-id',
      'agent-A',
      '--type',
      'done',
      '--task-id',
      'fix-bug',
      '--summary',
      'finished',
    ]);

    const doneEntry = JSON.parse(doneOutput);
    expect(doneEntry.lock).toBeDefined();
    expect(doneEntry.lock.key).toBe('task-fix-bug');
    expect(doneEntry.lock.status).toBe('released');

    // Agent B can now claim the same task
    const { stdout: reclaimOutput } = await execFileAsync('python3', [
      scriptPath,
      '--messages',
      messagesPath,
      '--attachments-dir',
      attachmentsDir,
      '--locks-dir',
      locksDir,
      '--agent-id',
      'agent-B',
      '--type',
      'claim',
      '--task-id',
      'fix-bug',
      '--summary',
      'my turn',
    ]);

    const reclaimEntry = JSON.parse(reclaimOutput);
    expect(reclaimEntry.lock.status).toBe('acquired');
  });

  it('downgrades broadcast update messages to no-wakeup timeline entries', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-team-coord-write-'));
    tempDirs.push(root);
    const coordDir = path.join(root, '.agents', 'teams', 'team-1', 'coord');
    await fs.mkdir(path.join(coordDir, 'scripts'), { recursive: true });
    const service = new AgentTeamService(
      {} as IConversationRepository,
      {} as IConversationService,
      {} as IWorkerTaskManager
    );

    await (
      service as unknown as { writeCoordScripts: (dir: string, teamId: string) => Promise<void> }
    ).writeCoordScripts(coordDir, 'team-1');

    const scriptPath = path.join(coordDir, 'scripts', 'coord_write.py');
    const messagesPath = path.join(coordDir, 'messages.jsonl');
    const attachmentsDir = path.join(coordDir, 'attachments');
    const locksDir = path.join(coordDir, 'locks');

    const { stdout } = await execFileAsync('python3', [
      scriptPath,
      '--messages',
      messagesPath,
      '--attachments-dir',
      attachmentsDir,
      '--locks-dir',
      locksDir,
      '--agent-id',
      'member-codex',
      '--type',
      'update',
      '--summary',
      'update summary',
      '--dispatch',
      'all',
    ]);

    const entry = JSON.parse(stdout);
    expect(entry.dispatch).toBe('none');
    expect(entry.to).toEqual(['user']);
  });
});
