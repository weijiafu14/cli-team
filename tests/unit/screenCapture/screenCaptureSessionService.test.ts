/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getSources, getMediaAccessStatus, mkdir, readFile, readdir, writeFile } = vi.hoisted(() => ({
  getSources: vi.fn(),
  getMediaAccessStatus: vi.fn(),
  mkdir: vi.fn(),
  readFile: vi.fn(),
  readdir: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock('electron', () => ({
  desktopCapturer: {
    getSources,
  },
  systemPreferences: {
    getMediaAccessStatus,
  },
}));

vi.mock('fs/promises', () => ({
  mkdir,
  readFile,
  readdir,
  writeFile,
}));

vi.mock('electron-log', () => ({
  default: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

import { ScreenCaptureSessionService } from '@process/services/screenCapture/ScreenCaptureSessionService';

describe('ScreenCaptureSessionService ownership', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    getMediaAccessStatus.mockReturnValue('granted');
    getSources.mockResolvedValue([]);
    mkdir.mockResolvedValue(undefined);
    readFile.mockResolvedValue('');
    readdir.mockResolvedValue([]);
    writeFile.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should expose the active session only to its owning conversation', async () => {
    const service = new ScreenCaptureSessionService();
    const session = await service.startSession({
      goal: '宣传仓库主页',
      conversationId: 'conv-a',
      intervalMinutes: 1,
      workspaceDir: '/tmp/workspace-a',
    });

    const ownerStatus = await service.getStatus('conv-a');
    const otherStatus = await service.getStatus('conv-b');

    expect(ownerStatus.activeSession?.id).toBe(session.id);
    expect(ownerStatus.busyByAnotherConversation).toBe(false);
    expect(otherStatus.activeSession).toBeUndefined();
    expect(otherStatus.busyByAnotherConversation).toBe(true);
  });

  it('should reject starting a second session from another conversation', async () => {
    const service = new ScreenCaptureSessionService();
    await service.startSession({
      goal: '宣传仓库主页',
      conversationId: 'conv-a',
      intervalMinutes: 1,
      workspaceDir: '/tmp/workspace-a',
    });

    await expect(
      service.startSession({
        goal: '宣传新功能',
        conversationId: 'conv-b',
        intervalMinutes: 1,
        workspaceDir: '/tmp/workspace-b',
      })
    ).rejects.toThrow('Another conversation already owns the active screen monitoring session.');
  });

  it('should reject stopping a session from another conversation', async () => {
    const service = new ScreenCaptureSessionService();
    await service.startSession({
      goal: '宣传仓库主页',
      conversationId: 'conv-a',
      intervalMinutes: 1,
      workspaceDir: '/tmp/workspace-a',
    });

    await expect(service.stopSession('conv-b')).rejects.toThrow(
      'Another conversation already owns the active screen monitoring session.'
    );
  });

  it('should reject reading active session captures from another conversation', async () => {
    const service = new ScreenCaptureSessionService();
    await service.startSession({
      goal: '宣传仓库主页',
      conversationId: 'conv-a',
      intervalMinutes: 1,
      workspaceDir: '/tmp/workspace-a',
    });

    await expect(service.getSessionCaptures('conv-b')).rejects.toThrow(
      'Another conversation already owns the active screen monitoring session.'
    );
  });

  it('should reject reading the last completed session from another conversation', async () => {
    const service = new ScreenCaptureSessionService();
    await service.startSession({
      goal: '宣传仓库主页',
      conversationId: 'conv-a',
      intervalMinutes: 1,
      workspaceDir: '/tmp/workspace-a',
    });
    await service.stopSession('conv-a');

    await expect(service.getSessionCaptures('conv-b')).rejects.toThrow(
      'Another conversation already owns the active screen monitoring session.'
    );
  });

  it('should return an empty capture list when another conversation asks for a session id it does not own', async () => {
    const service = new ScreenCaptureSessionService();
    const session = await service.startSession({
      goal: '宣传仓库主页',
      conversationId: 'conv-a',
      intervalMinutes: 1,
      workspaceDir: '/tmp/workspace-a',
    });

    await expect(service.listCaptures(session.id, 'conv-b')).resolves.toEqual([]);
  });
});
