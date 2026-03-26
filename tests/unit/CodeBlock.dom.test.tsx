/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      (
        ({
          'common.close': 'Close',
          'common.copySuccess': 'Copied',
          'common.copyFailed': 'Failed to copy',
          'messages.mermaid.expand': 'Open large view',
          'messages.mermaid.previewTitle': 'Mermaid Diagram',
          'messages.mermaid.zoomIn': 'Zoom in',
          'messages.mermaid.zoomOut': 'Zoom out',
          'messages.mermaid.resetZoom': 'Reset zoom',
          'messages.mermaid.rendering': 'Rendering diagram...',
          'messages.mermaid.syntaxErrorTitle': 'Mermaid Syntax Error:',
        }) as Record<string, string>
      )[key] || key,
  }),
}));

// Mock mermaid explicitly so we can test the async rendering loop
vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn().mockImplementation((id: string, chart: string) => {
      if (chart.includes('error')) {
        return Promise.reject(new Error('Syntax Error'));
      }
      return Promise.resolve({ svg: '<svg data-testid="mermaid-svg"></svg>' });
    }),
  },
}));

import CodeBlock from '@/renderer/components/Markdown/CodeBlock';

// We have to mock ResizeObserver for CodeBlock rendering
global.ResizeObserver = class {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
} as unknown as typeof ResizeObserver;
global.MutationObserver = class {
  observe = vi.fn();
  disconnect = vi.fn();
  takeRecords = vi.fn(() => []);
} as unknown as typeof MutationObserver;

describe('CodeBlock mermaid support', () => {
  it('renders a mermaid block natively via mermaid library', async () => {
    render(<CodeBlock className='language-mermaid'>graph TD; A--&gt;B;</CodeBlock>);

    // Wait for the async effect to resolve the mermaid svg
    await waitFor(() => {
      expect(screen.getByTestId('mermaid-svg')).toBeInTheDocument();
    });
  });

  it('opens the fullscreen mermaid preview and supports zoom controls', async () => {
    render(<CodeBlock className='language-mermaid'>graph TD; A--&gt;B;</CodeBlock>);

    await waitFor(() => {
      expect(screen.getByTestId('mermaid-expand-button')).toBeEnabled();
    });

    fireEvent.click(screen.getByTestId('mermaid-expand-button'));

    expect(screen.getByTestId('mermaid-fullscreen-overlay')).toBeInTheDocument();
    expect(screen.getByTestId('mermaid-zoom-level')).toHaveTextContent('175%');

    fireEvent.click(screen.getByTestId('mermaid-zoom-in-button'));
    expect(screen.getByTestId('mermaid-zoom-level')).toHaveTextContent('200%');

    fireEvent.click(screen.getByTestId('mermaid-close-button'));

    await waitFor(() => {
      expect(screen.queryByTestId('mermaid-fullscreen-overlay')).not.toBeInTheDocument();
    });
  });

  it('renders an elegant error boundary for malformed mermaid syntax', async () => {
    render(<CodeBlock className='language-mermaid'>graph error;</CodeBlock>);

    await waitFor(() => {
      expect(screen.getByText('Mermaid Syntax Error:')).toBeInTheDocument();
      expect(screen.getByText('Syntax Error')).toBeInTheDocument();
    });
  });
});
