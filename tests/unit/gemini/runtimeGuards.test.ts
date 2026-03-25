/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_GEMINI_SHELL_INACTIVITY_TIMEOUT_SECONDS,
  runWithAbsoluteTimeout,
  resolveShellToolInactivityTimeoutSeconds,
} from '@/agent/gemini/runtimeGuards';

describe('gemini runtime guards', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses configured shell inactivity timeout when provided', () => {
    expect(
      resolveShellToolInactivityTimeoutSeconds({
        tools: {
          shell: {
            inactivityTimeout: 42,
          },
        },
      })
    ).toBe(42);
  });

  it('falls back to desktop default shell inactivity timeout', () => {
    expect(resolveShellToolInactivityTimeoutSeconds({})).toBe(DEFAULT_GEMINI_SHELL_INACTIVITY_TIMEOUT_SECONDS);
  });

  it('rejects when work exceeds absolute timeout and runs timeout callback', async () => {
    vi.useFakeTimers();

    const onTimeout = vi.fn();
    const work = new Promise<string>(() => undefined);
    const resultPromise = runWithAbsoluteTimeout(work, 1000, onTimeout, () => new Error('timed out'));
    const capturedRejection = resultPromise.catch((error: unknown) => error);

    await vi.advanceTimersByTimeAsync(1000);

    const error = await capturedRejection;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('timed out');
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });
});
