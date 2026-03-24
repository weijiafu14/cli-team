/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { ICoordTimelineEntry } from '@/common/ipcBridge';

const mockRefs = vi.hoisted(() => ({
  scrollToMock: vi.fn(),
  navigateMock: vi.fn(),
  getTimelineMock: vi.fn(),
  timelineStreamOnMock: vi.fn(),
  getConversationMock: vi.fn(),
  readFileMock: vi.fn(),
  getImageBase64Mock: vi.fn(),
}));

function MockArcoImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  return <img src={src} alt={alt} className={className} data-testid='agent-team-image' />;
}

MockArcoImage.PreviewGroup = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;

vi.mock('@/common/ipcBridge', () => ({
  agentTeam: {
    getTimeline: { invoke: mockRefs.getTimelineMock },
    timelineStream: { on: mockRefs.timelineStreamOnMock },
    abort: { invoke: vi.fn() },
    sendMessage: { invoke: vi.fn() },
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

vi.mock('@/renderer/hooks/context/ConversationContext', () => ({
  ConversationProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/renderer/components/chat/sendbox', () => ({
  default: ({ tools }: { tools?: React.ReactNode }) => <div data-testid='sendbox'>{tools}</div>,
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
            name: 'Gemini CLI',
            type: 'gemini',
            backend: 'gemini',
          },
        ],
      },
    });
    mockRefs.readFileMock.mockResolvedValue('# attached markdown');
    mockRefs.getImageBase64Mock.mockResolvedValue('data:image/png;base64,abc');
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
});
