/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export const DEFAULT_GEMINI_SHELL_INACTIVITY_TIMEOUT_SECONDS = 180;
export const DEFAULT_GEMINI_TOOL_SCHEDULE_TIMEOUT_MS = 10 * 60 * 1000;

type ShellSettings = {
  tools?: {
    shell?: {
      inactivityTimeout?: number;
    };
  };
};

export function resolveShellToolInactivityTimeoutSeconds(settings: unknown): number {
  const normalized = (settings as ShellSettings | undefined) ?? {};
  const configured = normalized.tools?.shell?.inactivityTimeout;
  if (typeof configured === 'number' && configured >= 0) {
    return configured;
  }
  return DEFAULT_GEMINI_SHELL_INACTIVITY_TIMEOUT_SECONDS;
}

export async function runWithAbsoluteTimeout<T>(
  work: Promise<T>,
  timeoutMs: number,
  onTimeout: () => void,
  errorFactory: () => Error
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      onTimeout();
      reject(errorFactory());
    }, timeoutMs);
  });

  try {
    return await Promise.race([work, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}
