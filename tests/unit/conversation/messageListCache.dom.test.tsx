/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import type { TMessage } from '@/common/chatLib';
import { MessageListProvider, useMessageList, useMessageLstCache } from '@/renderer/pages/conversation/Messages/hooks';

const mocks = vi.hoisted(() => ({
  getConversationMessagesMock: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    database: {
      getConversationMessages: {
        invoke: mocks.getConversationMessagesMock,
      },
    },
  },
}));

function CacheProbe({ conversationId }: { conversationId: string }) {
  useMessageLstCache(conversationId);
  const messages = useMessageList();
  return (
    <>
      <div data-testid='message-count'>{messages.length}</div>
      <div data-testid='message-order'>{messages.map((message) => message.msg_id).join(',')}</div>
    </>
  );
}

function createTextMessage(id: string, msgId: string, content: string): TMessage {
  return {
    id,
    msg_id: msgId,
    conversation_id: 'conv-1',
    type: 'text',
    position: 'left',
    content: { content },
    createdAt: Date.now(),
  };
}

function createAcpToolCallMessage(id: string, msgId: string, status: 'pending' | 'completed'): TMessage {
  return {
    id,
    msg_id: msgId,
    conversation_id: 'conv-1',
    type: 'acp_tool_call',
    position: 'left',
    content: {
      sessionId: 'session-1',
      update: {
        sessionUpdate: 'tool_call',
        toolCallId: msgId,
        title: 'exec_command',
        status,
      },
    },
    createdAt: Date.now(),
  } as TMessage;
}

describe('useMessageLstCache', () => {
  const flushMicrotasks = async () => {
    await Promise.resolve();
    await Promise.resolve();
  };

  beforeEach(() => {
    vi.useFakeTimers();
    mocks.getConversationMessagesMock.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('reloads database messages shortly after mount to catch delayed persistence', async () => {
    const descendingSnapshot = [
      createTextMessage('m2', 'msg-2', 'latest persisted content'),
      createTextMessage('m1', 'msg-1', 'older content'),
    ];

    mocks.getConversationMessagesMock.mockResolvedValueOnce(descendingSnapshot);

    render(
      <MessageListProvider>
        <CacheProbe conversationId='conv-1' />
      </MessageListProvider>
    );

    await act(async () => {
      await flushMicrotasks();
    });
    expect(screen.getByTestId('message-count')).toHaveTextContent('2');
    expect(screen.getByTestId('message-order')).toHaveTextContent('msg-1,msg-2');
    expect(mocks.getConversationMessagesMock).toHaveBeenCalledWith({
      conversation_id: 'conv-1',
      page: 0,
      pageSize: 10000,
      order: 'DESC',
    });
  });

  it('deduplicates database snapshots that share the same message identity before hydrating the list', async () => {
    const descendingSnapshot = [
      createAcpToolCallMessage('db-row-latest', 'tool-1', 'completed'),
      createAcpToolCallMessage('db-row-older', 'tool-1', 'pending'),
    ];

    mocks.getConversationMessagesMock.mockResolvedValueOnce(descendingSnapshot);

    render(
      <MessageListProvider>
        <CacheProbe conversationId='conv-1' />
      </MessageListProvider>
    );

    await act(async () => {
      await flushMicrotasks();
    });

    expect(screen.getByTestId('message-count')).toHaveTextContent('1');
    expect(screen.getByTestId('message-order')).toHaveTextContent('tool-1');
  });
});
