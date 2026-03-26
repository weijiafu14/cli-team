/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Pipe } from './fork/pipe';
import pipe from './fork/pipe';

type ConsoleMethod = 'log' | 'warn' | 'error';
type ConsoleLike = Pick<Console, ConsoleMethod>;

const BENIGN_GEMINI_IGNORE_PATTERNS = ['Ignore file not found:', '.geminiignore', 'continue without it'];
const BENIGN_GEMINI_IGNORE_FILTER_FLAG = Symbol.for('aionui.worker.benignGeminiIgnoreFilterInstalled');

function normalizeConsoleArg(arg: unknown): string {
  if (typeof arg === 'string') {
    return arg;
  }

  if (arg instanceof Error) {
    return `${arg.name}: ${arg.message}`;
  }

  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

export const forkTask = (task: (data?: any, pipe?: Pipe) => Promise<any>) => {
  pipe.on('start', (data: any, deferred) => {
    deferred.with(task(data, pipe));
  });
};

export function shouldSuppressBenignGeminiIgnoreLog(args: readonly unknown[]): boolean {
  const message = args.map(normalizeConsoleArg).join(' ');
  return BENIGN_GEMINI_IGNORE_PATTERNS.every((pattern) => message.includes(pattern));
}

export function installBenignGeminiIgnoreConsoleFilter(target: ConsoleLike = console): void {
  const targetWithFlag = target as ConsoleLike & {
    [BENIGN_GEMINI_IGNORE_FILTER_FLAG]?: boolean;
  };

  if (targetWithFlag[BENIGN_GEMINI_IGNORE_FILTER_FLAG]) {
    return;
  }

  for (const method of ['log', 'warn', 'error'] as const) {
    const original = target[method].bind(target) as (...data: unknown[]) => void;
    target[method] = ((...data: unknown[]) => {
      if (shouldSuppressBenignGeminiIgnoreLog(data)) {
        return;
      }

      original(...data);
    }) as ConsoleLike[typeof method];
  }

  targetWithFlag[BENIGN_GEMINI_IGNORE_FILTER_FLAG] = true;
}
