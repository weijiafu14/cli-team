/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRefs = vi.hoisted(() => ({
  addMessage: vi.fn(),
  addOrUpdateMessage: vi.fn(),
  updateConversation: vi.fn(),
  acpEmit: vi.fn(),
  conversationEmit: vi.fn(),
  confirmationEmit: vi.fn(),
  agentSendMessage: vi.fn().mockResolvedValue({
    success: true,
  }),
}));

vi.mock('@/worker/fork/ForkTask', () => ({
  ForkTask: class {
    protected data: unknown;

    constructor(_path: string, data: unknown) {
      this.data = data;
    }

    protected init(): void {}

    protected postMessagePromise(): Promise<void> {
      return Promise.resolve();
    }

    once(): void {}

    emit(): void {}

    kill(): void {}
  },
}));

vi.mock('@/agent/acp', () => ({
  AcpAgent: class {
    sendMessage = mockRefs.agentSendMessage;
  },
}));

vi.mock('@/channels/agent/ChannelEventBus', () => ({
  channelEventBus: {
    emitAgentMessage: vi.fn(),
  },
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    acpConversation: {
      responseStream: {
        emit: mockRefs.acpEmit,
      },
    },
    conversation: {
      confirmation: {
        add: { emit: mockRefs.confirmationEmit },
        update: { emit: mockRefs.confirmationEmit },
        remove: { emit: mockRefs.confirmationEmit },
      },
      responseStream: {
        emit: mockRefs.conversationEmit,
      },
    },
  },
}));

vi.mock('@/common/constants', () => ({
  AIONUI_FILES_MARKER: '__AIONUI_FILES__',
}));

vi.mock('@/common/utils', () => ({
  parseError: vi.fn((error: unknown) => String(error)),
  uuid: vi.fn(() => 'generated-uuid'),
}));

vi.mock('@/extensions', () => ({
  ExtensionRegistry: {
    getInstance: vi.fn(() => ({
      getAcpAdapters: vi.fn(() => []),
    })),
  },
}));

vi.mock('@process/database', () => ({
  getDatabase: () => ({
    updateConversation: mockRefs.updateConversation,
    getConversation: vi.fn(() => ({ success: false })),
  }),
}));

vi.mock('@process/services/autoCompaction', () => ({
  downscaleImageIfNeeded: vi.fn(async (file: string) => file),
  getAutoCompactionOrchestrator: vi.fn(() => ({
    reportError: vi.fn(),
    reportUsage: vi.fn(),
    hasActions: vi.fn(() => false),
    registerConversationActions: vi.fn(),
  })),
}));

vi.mock('@process/services/cron/CronBusyGuard', () => ({
  cronBusyGuard: {
    setProcessing: vi.fn(),
  },
}));

vi.mock('@process/initStorage', () => ({
  ProcessConfig: {
    get: vi.fn(async () => ({})),
  },
}));

vi.mock('../../../src/process/message', () => ({
  addMessage: mockRefs.addMessage,
  addOrUpdateMessage: mockRefs.addOrUpdateMessage,
  nextTickToLocalFinish: vi.fn(),
}));

vi.mock('../../../src/process/utils/previewUtils', () => ({
  handlePreviewOpenEvent: vi.fn(),
}));

vi.mock('../../../src/process/utils/mainLogger', () => ({
  mainError: vi.fn(),
  mainLog: vi.fn(),
  mainWarn: vi.fn(),
}));

vi.mock('../../../src/process/task/CronCommandDetector', () => ({
  hasCronCommands: vi.fn(() => false),
}));

vi.mock('../../../src/process/task/MessageMiddleware', () => ({
  extractTextFromMessage: vi.fn(() => ''),
  processCronInMessage: vi.fn(),
}));

vi.mock('../../../src/process/task/ThinkTagDetector', () => ({
  stripThinkTags: vi.fn((value: string) => value),
}));

import AcpAgentManager from '../../../src/process/task/AcpAgentManager';

describe('AcpAgentManager internal team wakeups', () => {
  beforeEach(() => {
    mockRefs.addMessage.mockReset();
    mockRefs.addOrUpdateMessage.mockReset();
    mockRefs.updateConversation.mockReset();
    mockRefs.acpEmit.mockReset();
    mockRefs.conversationEmit.mockReset();
    mockRefs.confirmationEmit.mockReset();
    mockRefs.agentSendMessage.mockReset();
    mockRefs.agentSendMessage.mockResolvedValue({
      success: true,
    });
  });

  it('does not persist internal wakeups as visible user messages', async () => {
    const manager = new AcpAgentManager({
      workspace: '/tmp',
      backend: 'codex',
      conversation_id: 'conv-codex',
    });
    const managerWithInternals = manager as unknown as {
      agent: { sendMessage: typeof mockRefs.agentSendMessage };
      initAgent: (data: unknown) => Promise<void>;
    };
    managerWithInternals.agent = {
      sendMessage: mockRefs.agentSendMessage,
    };
    managerWithInternals.initAgent = vi.fn().mockResolvedValue(undefined);

    await manager.sendMessage({
      content: '[Internal Agent Team Wakeup]\nUnread: 1',
      msg_id: 'msg-internal',
      internal: true,
    });

    expect(mockRefs.addMessage).not.toHaveBeenCalled();
    expect(mockRefs.updateConversation).not.toHaveBeenCalled();
    expect(mockRefs.acpEmit).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'user_content',
      })
    );
    expect(mockRefs.agentSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        content: '[Internal Agent Team Wakeup]\nUnread: 1',
        internal: true,
      })
    );
  });

  it('still persists normal visible user messages', async () => {
    const manager = new AcpAgentManager({
      workspace: '/tmp',
      backend: 'codex',
      conversation_id: 'conv-codex',
    });
    const managerWithInternals = manager as unknown as {
      agent: { sendMessage: typeof mockRefs.agentSendMessage };
      initAgent: (data: unknown) => Promise<void>;
    };
    managerWithInternals.agent = {
      sendMessage: mockRefs.agentSendMessage,
    };
    managerWithInternals.initAgent = vi.fn().mockResolvedValue(undefined);

    await manager.sendMessage({
      content: 'Please inspect the bug',
      msg_id: 'msg-user',
    });

    expect(mockRefs.addMessage).toHaveBeenCalledTimes(1);
    expect(mockRefs.updateConversation).toHaveBeenCalledTimes(1);
    expect(mockRefs.acpEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'user_content',
        msg_id: 'msg-user',
      })
    );
  });
});
