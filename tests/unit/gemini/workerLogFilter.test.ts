/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { installBenignGeminiIgnoreConsoleFilter, shouldSuppressBenignGeminiIgnoreLog } from '@/worker/utils';

describe('gemini worker log filter', () => {
  it('suppresses the optional .geminiignore missing message', () => {
    expect(
      shouldSuppressBenignGeminiIgnoreLog(['Ignore file not found: /tmp/project/.geminiignore, continue without it.'])
    ).toBe(true);
  });

  it('keeps unrelated file-not-found messages visible', () => {
    expect(
      shouldSuppressBenignGeminiIgnoreLog(['Ignore file not found: /tmp/project/package.json, stopping startup.'])
    ).toBe(false);
  });

  it('filters only the benign gemini ignore message after installation', () => {
    const originalLog = vi.fn();
    const originalWarn = vi.fn();
    const originalError = vi.fn();
    const fakeConsole = {
      log: originalLog,
      warn: originalWarn,
      error: originalError,
    };

    installBenignGeminiIgnoreConsoleFilter(fakeConsole);

    fakeConsole.log('Ignore file not found: /tmp/project/.geminiignore, continue without it.');
    fakeConsole.warn('Different warning');
    fakeConsole.error('Different error');

    expect(originalLog).not.toHaveBeenCalled();
    expect(originalWarn).toHaveBeenCalledWith('Different warning');
    expect(originalError).toHaveBeenCalledWith('Different error');
  });
});
