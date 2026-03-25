/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

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
  }
}));

import CodeBlock from '@/renderer/components/Markdown/CodeBlock';

// We have to mock ResizeObserver for CodeBlock rendering
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));
global.MutationObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  disconnect: vi.fn(),
}));

describe('CodeBlock mermaid support', () => {
  it('renders a mermaid block natively via mermaid library', async () => {
    render(<CodeBlock className="language-mermaid">graph TD;
A--&gt;B;</CodeBlock>);

    // Wait for the async effect to resolve the mermaid svg
    await waitFor(() => {
      expect(screen.getByTestId('mermaid-svg')).toBeInTheDocument();
    });
  });

  it('renders an elegant error boundary for malformed mermaid syntax', async () => {
    render(<CodeBlock className="language-mermaid">graph error;</CodeBlock>);

    await waitFor(() => {
      expect(screen.getByText('Mermaid Syntax Error:')).toBeInTheDocument();
      expect(screen.getByText('Syntax Error')).toBeInTheDocument();
    });
  });
});
