/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import type { IMessageText, TMessage } from '@/common/chatLib';

type VirtuosoProps = {
  data: unknown[];
  itemContent: (index: number, item: unknown) => React.ReactNode;
  initialTopMostItemIndex?: number;
};

const mockScrollToIndex = vi.fn();
const mockHideScrollButton = vi.fn();

let mockMessages: TMessage[] = [];
let latestVirtuosoProps: VirtuosoProps | undefined;
let mockLocationState: { targetMessageId?: string } = {};
let mockLocationKey = 'location-key';

vi.mock('@/renderer/pages/conversation/Messages/hooks', () => ({
  useMessageList: () => mockMessages,
}));

vi.mock('@/renderer/hooks/context/ConversationContext', () => ({
  useConversationContextSafe: () => ({ conversationId: 'conversation-1' }),
}));

vi.mock('react-router-dom', () => ({
  useLocation: () => ({
    key: mockLocationKey,
    state: mockLocationState,
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/renderer/pages/conversation/Messages/useAutoScroll', () => ({
  useAutoScroll: () => ({
    virtuosoRef: {
      current: {
        scrollToIndex: mockScrollToIndex,
      },
    },
    handleScroll: vi.fn(),
    handleAtBottomStateChange: vi.fn(),
    handleFollowOutput: vi.fn(),
    showScrollButton: false,
    scrollToBottom: vi.fn(),
    hideScrollButton: mockHideScrollButton,
  }),
}));

vi.mock('react-virtuoso', () => ({
  Virtuoso: ({ data, itemContent, initialTopMostItemIndex }: VirtuosoProps) => {
    latestVirtuosoProps = { data, itemContent, initialTopMostItemIndex };
    return (
      <div data-testid='virtuoso'>
        {data.map((item, index) => (
          <div key={index}>{itemContent(index, item)}</div>
        ))}
      </div>
    );
  },
}));

vi.mock('@arco-design/web-react', () => ({
  Image: {
    PreviewGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  },
}));

vi.mock('@icon-park/react', () => ({
  Down: () => <span>down</span>,
}));

vi.mock('@renderer/utils/ui/HOC', () => ({
  default: (_wrapper: unknown) => (Component: React.ComponentType<unknown>) => Component,
}));

vi.mock('@/renderer/pages/conversation/Messages/components/MessagetText', () => ({
  default: ({ message }: { message: IMessageText }) => <div>{message.content.content}</div>,
}));

vi.mock('@/renderer/pages/conversation/Messages/components/MessageTips', () => ({
  default: () => <div />,
}));

vi.mock('@/renderer/pages/conversation/Messages/components/MessageToolCall', () => ({
  default: () => <div />,
}));

vi.mock('@/renderer/pages/conversation/Messages/components/MessageToolGroup', () => ({
  default: () => <div />,
}));

vi.mock('@/renderer/pages/conversation/Messages/components/MessageToolGroupSummary', () => ({
  default: () => <div />,
}));

vi.mock('@/renderer/pages/conversation/Messages/components/MessageAgentStatus', () => ({
  default: () => <div />,
}));

vi.mock('@/renderer/pages/conversation/Messages/components/MessagePlan', () => ({
  default: () => <div />,
}));

vi.mock('@/renderer/pages/conversation/Messages/acp/MessageAcpPermission', () => ({
  default: () => <div />,
}));

vi.mock('@/renderer/pages/conversation/Messages/acp/MessageAcpToolCall', () => ({
  default: () => <div />,
}));

vi.mock('@/renderer/pages/conversation/Messages/codex/MessageCodexToolCall', () => ({
  default: () => <div />,
}));

vi.mock('@/renderer/pages/conversation/Messages/codex/MessageFileChanges', () => ({
  default: () => <div />,
  parseDiff: () => [],
}));

import MessageList from '@/renderer/pages/conversation/Messages/MessageList';

const createMessage = (id: string): IMessageText => ({
  id,
  msg_id: id,
  type: 'text',
  position: 'left',
  conversation_id: 'conversation-1',
  content: { content: `message-${id}` },
  createdAt: Date.now(),
});

describe('MessageList history navigation recovery', () => {
  beforeEach(() => {
    latestVirtuosoProps = undefined;
    mockMessages = [createMessage('m-1'), createMessage('m-2')];
    mockLocationState = {};
    mockLocationKey = 'location-key';
    mockScrollToIndex.mockReset();
    mockHideScrollButton.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('does not force the list to start from the last message on initial render', () => {
    render(<MessageList />);

    expect(latestVirtuosoProps?.initialTopMostItemIndex).toBeUndefined();
    expect(mockScrollToIndex).not.toHaveBeenCalled();
  });

  it('scrolls to the requested message when chat history navigation targets one', async () => {
    mockLocationState = { targetMessageId: 'm-2' };
    mockLocationKey = 'targeted-location';

    render(<MessageList />);

    await vi.runAllTimersAsync();

    expect(mockHideScrollButton).toHaveBeenCalled();
    expect(mockScrollToIndex).toHaveBeenCalledWith({
      index: 1,
      behavior: 'smooth',
      align: 'center',
    });
  });

  it('does not scroll when the requested history target does not exist', async () => {
    mockLocationState = { targetMessageId: 'missing-message' };
    mockLocationKey = 'missing-location';

    render(<MessageList />);

    await vi.runAllTimersAsync();

    expect(mockScrollToIndex).not.toHaveBeenCalled();
  });
});
