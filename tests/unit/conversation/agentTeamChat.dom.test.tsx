/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ICoordTimelineEntry } from '@/common/ipcBridge';

const mockRefs = vi.hoisted(() => ({
  scrollToMock: vi.fn(),
  navigateMock: vi.fn(),
  getTimelineMock: vi.fn(),
  timelineStreamOnMock: vi.fn(),
  getConversationMock: vi.fn(),
  readFileMock: vi.fn(),
  getImageBase64Mock: vi.fn(),
  sendMessageMock: vi.fn(),
  abortMock: vi.fn(),
}));

function MockArcoImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  return <img src={src} alt={alt} className={className} data-testid='agent-team-image' />;
}

MockArcoImage.PreviewGroup = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;

vi.mock('@/common/ipcBridge', () => ({
  agentTeam: {
    getTimeline: { invoke: mockRefs.getTimelineMock },
    timelineStream: { on: mockRefs.timelineStreamOnMock },
    abort: { invoke: mockRefs.abortMock },
    sendMessage: { invoke: mockRefs.sendMessageMock },
    getMembers: { invoke: vi.fn() },
  },
  conversation: {
    get: { invoke: mockRefs.getConversationMock },
  },
  fs: {
    readFile: { invoke: mockRefs.readFileMock },
    getImageBase64: { invoke: mockRefs.getImageBase64Mock },
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string }) => options?.defaultValue || _key,
  }),
}));

vi.mock('@/renderer/hooks/context/ConversationContext', () => ({
  ConversationProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/renderer/components/chat/sendbox', () => ({
  default: ({
    value,
    onChange,
    onSend,
    tools,
  }: {
    value?: string;
    onChange?: (value: string) => void;
    onSend: (message: string) => Promise<void>;
    tools?: React.ReactNode;
  }) => (
    <div data-testid='sendbox'>
      <input data-testid='sendbox-input' value={value || ''} onChange={(event) => onChange?.(event.target.value)} />
      <button type='button' onClick={() => void onSend(value || '')}>
        send
      </button>
      {tools}
    </div>
  ),
}));

vi.mock('@/renderer/components/media/FileAttachButton', () => ({
  default: () => <div data-testid='file-attach' />,
}));

vi.mock('@/renderer/components/media/FilePreview', () => ({
  default: ({ path }: { path: string }) => <div data-testid='file-preview'>{path}</div>,
}));

vi.mock('@/renderer/components/media/HorizontalFileList', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/renderer/hooks/file/useOpenFileSelector', () => ({
  useOpenFileSelector: () => ({ openFileSelector: vi.fn() }),
}));

vi.mock('@/renderer/components/Markdown', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/renderer/utils/model/agentLogo', () => ({
  getAgentLogo: () => '/logo.png',
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockRefs.navigateMock,
}));

vi.mock('@icon-park/react', () => ({
  PauseOne: () => <span>pause</span>,
  Lightning: () => <span>lightning</span>,
}));

vi.mock('@arco-design/web-react', () => {
  return { Image: MockArcoImage };
});

import AgentTeamChat from '@/renderer/pages/conversation/platforms/agent-team/AgentTeamChat';

const createEntry = (): ICoordTimelineEntry => ({
  id: 'entry-1',
  ts: '2026-03-24T12:00:00+08:00',
  from: 'agent-1',
  role: 'agent',
  type: 'update',
  summary: 'summary',
  body: 'body',
  files: ['/tmp/note.md', '/tmp/log.txt'],
  images: ['/tmp/evidence.png'],
});

describe('AgentTeamChat recovery', () => {
  beforeEach(() => {
    mockRefs.scrollToMock.mockReset();
    mockRefs.navigateMock.mockReset();
    mockRefs.sendMessageMock.mockReset();
    mockRefs.abortMock.mockReset();
    mockRefs.getTimelineMock.mockResolvedValue({
      success: true,
      data: {
        entries: [createEntry()],
      },
    });
    mockRefs.timelineStreamOnMock.mockReturnValue(() => {});
    mockRefs.getConversationMock.mockResolvedValue({
      id: 'team-1',
      type: 'agent-team',
      extra: {
        members: [
          {
            memberId: 'agent-1',
            conversationId: 'conversation-1',
            name: 'Claude Code',
            type: 'acp',
            backend: 'claude',
          },
        ],
      },
    });
    mockRefs.readFileMock.mockResolvedValue('# attached markdown');
    mockRefs.getImageBase64Mock.mockResolvedValue('data:image/png;base64,abc');
    mockRefs.sendMessageMock.mockResolvedValue({
      success: true,
      data: {
        entry: createEntry(),
      },
    });
    Element.prototype.scrollTo = mockRefs.scrollToMock;
  });

  afterEach(() => {
    cleanup();
  });

  it('scrolls timeline to bottom on initial load', async () => {
    render(<AgentTeamChat conversation_id='team-1' />);

    await waitFor(() => {
      expect(mockRefs.scrollToMock).toHaveBeenCalledWith(
        expect.objectContaining({
          behavior: 'auto',
        })
      );
    });
  });

  it('renders inline markdown attachments and image attachments', async () => {
    render(<AgentTeamChat conversation_id='team-1' />);

    await waitFor(() => {
      expect(screen.getByText('# attached markdown')).toBeInTheDocument();
    });

    expect(screen.getByAltText('evidence.png')).toBeInTheDocument();
    expect(screen.getByTestId('file-preview')).toHaveTextContent('/tmp/log.txt');
  });

  it('shows Show more button immediately when markdown body height expands asynchronously', async () => {
    // Mock scrollHeight to trigger overflow after initial render
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      configurable: true,
      get() {
        return this.textContent?.includes('very long content') ? 400 : 100;
      },
    });

    // Mock a fake timeline entry with a very long body
    mockRefs.getTimelineMock.mockResolvedValueOnce({
      success: true,
      data: {
        entries: [
          {
            id: 'msg-long',
            ts: '2026-03-24T12:00:00Z',
            from: 'agent-1',
            role: 'agent',
            type: 'update',
            summary: 'Long update',
            body: 'very long content',
          },
        ],
      },
    });

    render(<AgentTeamChat conversation_id='team-1' />);

    // Fast-forward or wait for the observers/intervals to catch the height
    await waitFor(
      () => {
        expect(screen.getByText('Show more')).toBeInTheDocument();
      },
      { timeout: 1000 }
    );
  });

  it('unescapes literal newlines in body before passing to MarkdownView', async () => {
    mockRefs.getTimelineMock.mockResolvedValueOnce({
      success: true,
      data: {
        entries: [
          {
            id: 'msg-newline',
            ts: '2026-03-24T12:00:00Z',
            from: 'agent-1',
            role: 'agent',
            type: 'update',
            summary: 'newline test',
            body: 'line1\\nline2', // literal backslash-n
          },
        ],
      },
    });

    render(<AgentTeamChat conversation_id='team-1' />);

    await waitFor(() => {
      expect(
        screen.getAllByText((_content, node) => {
          return node?.textContent === 'line1\nline2';
        }).length
      ).toBeGreaterThan(0);
    });
  });

  it('sends interrupt=true with mentioned targets when interrupt mode is enabled, then auto-resets on success', async () => {
    render(<AgentTeamChat conversation_id='team-1' />);

    const input = await screen.findByTestId('sendbox-input');
    fireEvent.change(input, { target: { value: '@Claude Code 紧急处理' } });
    fireEvent.click(screen.getByText('lightning').closest('button')!);
    fireEvent.click(screen.getByText('send'));

    await waitFor(() => {
      expect(mockRefs.sendMessageMock).toHaveBeenCalledWith(
        expect.objectContaining({
          conversation_id: 'team-1',
          input: '@Claude Code 紧急处理',
          targets: ['agent-1'],
          interrupt: true,
        })
      );
    });

    fireEvent.change(input, { target: { value: '后续普通消息' } });
    fireEvent.click(screen.getByText('send'));

    await waitFor(() => {
      expect(mockRefs.sendMessageMock).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          conversation_id: 'team-1',
          input: '后续普通消息',
          targets: undefined,
          interrupt: undefined,
        })
      );
    });
  });

  it('resets interrupt mode even when send fails, avoiding accidental repeated interrupts', async () => {
    mockRefs.sendMessageMock.mockRejectedValueOnce(new Error('boom'));
    mockRefs.sendMessageMock.mockResolvedValueOnce({
      success: true,
      data: {
        entry: createEntry(),
      },
    });

    render(<AgentTeamChat conversation_id='team-1' />);

    fireEvent.click(screen.getByText('lightning').closest('button')!);
    fireEvent.change(screen.getByTestId('sendbox-input'), { target: { value: '救火消息' } });
    fireEvent.click(screen.getByText('send'));

    await waitFor(() => {
      expect(mockRefs.sendMessageMock).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          input: '救火消息',
          interrupt: true,
        })
      );
    });

    fireEvent.click(screen.getByText('send'));

    await waitFor(() => {
      expect(mockRefs.sendMessageMock).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          input: '救火消息',
          interrupt: undefined,
        })
      );
    });
  });
});
