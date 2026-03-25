/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

const mockRefs = vi.hoisted(() => ({
  setSendBoxHandler: vi.fn(),
  removeDomSnippet: vi.fn(),
  clearDomSnippets: vi.fn(),
  useLayoutContext: vi.fn(() => ({ isMobile: false })),
  useInputFocusRing: vi.fn(() => ({
    activeBorderColor: 'var(--color-primary-6)',
    inactiveBorderColor: 'var(--color-border-2)',
    activeShadow: 'none',
  })),
  useLatestRef: vi.fn((value: unknown) => ({ current: value })),
  measureText: vi.fn(() => ({ width: 16 })),
  getContext: vi.fn(),
  messageWarning: vi.fn(),
}));

vi.mock('@/renderer/hooks/chat/useInputFocusRing', () => ({
  useInputFocusRing: mockRefs.useInputFocusRing,
}));

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: mockRefs.useLayoutContext,
}));

vi.mock('@/renderer/hooks/context/ConversationContext', () => ({
  useConversationContextSafe: () => ({ conversationId: 'conversation-1' }),
}));

vi.mock('@/renderer/pages/conversation/Preview', () => ({
  usePreviewContext: () => ({
    setSendBoxHandler: mockRefs.setSendBoxHandler,
    domSnippets: [],
    removeDomSnippet: mockRefs.removeDomSnippet,
    clearDomSnippets: mockRefs.clearDomSnippets,
  }),
}));

vi.mock('@/renderer/utils/ui/focus', () => ({
  blurActiveElement: vi.fn(),
  shouldBlockMobileInputFocus: () => false,
}));

vi.mock('@/renderer/hooks/chat/useCompositionInput', () => ({
  useCompositionInput: () => ({
    compositionHandlers: {},
    createKeyDownHandler: () => vi.fn(),
  }),
}));

vi.mock('@renderer/hooks/file/useDragUpload', () => ({
  useDragUpload: () => ({
    isFileDragging: false,
    dragHandlers: {},
  }),
}));

vi.mock('@renderer/hooks/ui/useLatestRef', () => ({
  useLatestRef: mockRefs.useLatestRef,
}));

vi.mock('@renderer/hooks/file/usePasteService', () => ({
  usePasteService: () => ({
    onPaste: vi.fn(),
    onFocus: vi.fn(),
  }),
}));

vi.mock('@/renderer/hooks/chat/useSlashCommandController', () => ({
  useSlashCommandController: () => ({
    isOpen: false,
    filteredCommands: [],
    activeIndex: 0,
    setActiveIndex: vi.fn(),
    onSelectByIndex: vi.fn(),
    onKeyDown: vi.fn(),
  }),
}));

vi.mock('@/renderer/components/chat/SlashCommandMenu', () => ({
  default: () => null,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: { defaultValue?: string }) => fallback?.defaultValue ?? _key,
  }),
}));

vi.mock('@arco-design/web-react', async () => {
  const ReactLib = await import('react');
  return {
    Button: ({
      children,
      icon,
      onClick,
      disabled,
    }: {
      children?: React.ReactNode;
      icon?: React.ReactNode;
      onClick?: () => void;
      disabled?: boolean;
    }) => (
      <button type='button' disabled={disabled} onClick={onClick}>
        {icon}
        {children}
      </button>
    ),
    Input: {
      TextArea: ReactLib.forwardRef<
        HTMLTextAreaElement,
        React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
          value?: string;
          onChange?: (value: string) => void;
        }
      >(({ value, onChange, autoSize: _autoSize, ...props }, ref) => (
        <textarea ref={ref} {...props} value={value} onChange={(event) => onChange?.(event.target.value)} />
      )),
    },
    Message: {
      useMessage: () => [
        {
          warning: mockRefs.messageWarning,
        },
        <div key='message-context' />,
      ],
    },
    Tag: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  };
});

vi.mock('@icon-park/react', () => ({
  ArrowUp: () => <span>arrow-up</span>,
  CloseSmall: () => <span>close</span>,
}));

import SendBox from '@/renderer/components/chat/sendbox';

function ControlledSendBox({ lockMultiLine = false }: { lockMultiLine?: boolean }) {
  const [value, setValue] = React.useState('');
  return (
    <SendBox
      value={value}
      onChange={setValue}
      onSend={vi.fn().mockResolvedValue(undefined)}
      defaultMultiLine
      lockMultiLine={lockMultiLine}
    />
  );
}

describe('SendBox multiline locking', () => {
  beforeEach(() => {
    mockRefs.setSendBoxHandler.mockReset();
    mockRefs.removeDomSnippet.mockReset();
    mockRefs.clearDomSnippets.mockReset();
    mockRefs.messageWarning.mockReset();
    mockRefs.measureText.mockClear();
    mockRefs.getContext.mockReset();
    mockRefs.getContext.mockReturnValue({
      font: '',
      measureText: mockRefs.measureText,
    });
    HTMLCanvasElement.prototype.getContext = mockRefs.getContext;
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
      configurable: true,
      get() {
        return 320;
      },
    });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('measures input width when multiline mode is not locked', async () => {
    render(<ControlledSendBox />);

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 150));
    });

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'hello @gemini' } });

    await act(async () => {
      await Promise.resolve();
    });

    expect(textarea).toHaveStyle({ minHeight: '20px' });
    expect(mockRefs.measureText).toHaveBeenCalled();
  });

  it('skips width measurement when multiline mode is locked', async () => {
    render(<ControlledSendBox lockMultiLine />);

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 150));
    });

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'hello @codex' } });

    await act(async () => {
      await Promise.resolve();
    });

    expect(textarea).toHaveStyle({ minHeight: '80px' });
    expect(mockRefs.measureText).not.toHaveBeenCalled();
    expect(mockRefs.getContext).not.toHaveBeenCalled();
  });
});
