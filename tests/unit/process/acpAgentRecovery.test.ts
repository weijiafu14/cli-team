/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/agent/acp/AcpAdapter', () => ({
  AcpAdapter: class {
    resetMessageTracking(): void {}
    convertSessionUpdate(): null {
      return null;
    }
  },
}));

vi.mock('@/common/atCommandParser', () => ({
  extractAtPaths: vi.fn(() => []),
  parseAllAtCommands: vi.fn(() => []),
  reconstructQuery: vi.fn((value: string) => value),
}));

vi.mock('@/common/navigation', () => ({
  NavigationInterceptor: {
    isNavigationTool: vi.fn(() => false),
    extractUrl: vi.fn(() => null),
    createPreviewMessage: vi.fn(() => ({ type: 'preview_open' })),
  },
}));

vi.mock('@/common/utils', () => ({
  uuid: vi.fn(() => 'uuid'),
}));

vi.mock('@/types/acpTypes', () => ({
  AcpErrorType: {
    UNKNOWN: 'UNKNOWN',
    CONNECTION_NOT_READY: 'CONNECTION_NOT_READY',
    AUTHENTICATION_FAILED: 'AUTHENTICATION_FAILED',
    TIMEOUT: 'TIMEOUT',
    PERMISSION_DENIED: 'PERMISSION_DENIED',
  },
  createAcpError: vi.fn((type: string, message: string, retryable: boolean) => ({ type, message, retryable })),
}));

vi.mock('@process/initStorage', () => ({
  ProcessConfig: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

vi.mock('@process/utils/mainLogger', () => ({
  mainLog: vi.fn(),
}));

vi.mock('@process/utils/shellEnv', () => ({
  getEnhancedEnv: vi.fn(() => ({})),
  resolveNpxPath: vi.fn(() => 'npx'),
}));

vi.mock('../../../src/agent/acp/AcpConnection', () => ({
  AcpConnection: class {
    disconnect(): Promise<void> {
      return Promise.resolve();
    }
  },
}));

vi.mock('../../../src/agent/acp/ApprovalStore', () => ({
  AcpApprovalStore: class {
    clear(): void {}
  },
  createAcpApprovalKey: vi.fn(() => 'approval-key'),
}));

vi.mock('../../../src/agent/acp/constants', () => ({
  CLAUDE_YOLO_SESSION_MODE: 'bypassPermissions',
  CODEBUDDY_YOLO_SESSION_MODE: 'bypassPermissions',
  IFLOW_YOLO_SESSION_MODE: 'yolo',
  QWEN_YOLO_SESSION_MODE: 'yolo',
}));

vi.mock('../../../src/agent/acp/modelInfo', () => ({
  buildAcpModelInfo: vi.fn(() => null),
  summarizeAcpModelInfo: vi.fn(() => ''),
}));

vi.mock('../../../src/agent/acp/mcpSessionConfig', () => ({
  buildBuiltinAcpSessionMcpServers: vi.fn(() => []),
  parseAcpMcpCapabilities: vi.fn(() => []),
}));

vi.mock('../../../src/agent/acp/utils', () => ({
  getClaudeModel: vi.fn(() => null),
}));

const { getAcpAutoRecoveryDelayMs, shouldAutoRecoverAcpErrorMessage } = await import('../../../src/agent/acp/index');

describe('ACP auto recovery policy', () => {
  it('marks startup timeout style errors as auto-recoverable', () => {
    expect(shouldAutoRecoverAcpErrorMessage('Connection timeout after 70 seconds')).toBe(true);
    expect(shouldAutoRecoverAcpErrorMessage('Initialize timeout after 60 seconds')).toBe(true);
    expect(shouldAutoRecoverAcpErrorMessage('claude process disconnected unexpectedly (code: 1, signal: null)')).toBe(
      true
    );
  });

  it('does not auto-recover on hard-stop configuration errors', () => {
    expect(shouldAutoRecoverAcpErrorMessage("'claude' CLI not found. Please install it.")).toBe(false);
    expect(shouldAutoRecoverAcpErrorMessage('authentication failed')).toBe(false);
    expect(shouldAutoRecoverAcpErrorMessage('model_not_found')).toBe(false);
  });

  it('uses capped exponential backoff for auto-recovery', () => {
    expect(getAcpAutoRecoveryDelayMs(1)).toBe(2000);
    expect(getAcpAutoRecoveryDelayMs(2)).toBe(4000);
    expect(getAcpAutoRecoveryDelayMs(3)).toBe(8000);
    expect(getAcpAutoRecoveryDelayMs(4)).toBe(15000);
    expect(getAcpAutoRecoveryDelayMs(10)).toBe(15000);
  });
});
