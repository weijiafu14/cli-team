/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { detectScreenCaptureCommands, stripScreenCaptureCommands } from '@process/task/ScreenCaptureCommandDetector';

describe('ScreenCaptureCommandDetector', () => {
  describe('detectScreenCaptureCommands', () => {
    it('should detect start command with goal and interval', () => {
      const content = '[SCREEN_MONITOR_START: goal="AionUi Landing Page", interval=3]';
      const commands = detectScreenCaptureCommands(content);
      expect(commands).toHaveLength(1);
      expect(commands[0]).toEqual({
        kind: 'start',
        goal: 'AionUi Landing Page',
        intervalMinutes: 3,
      });
    });

    it('should detect start command with single quotes', () => {
      const content = "[SCREEN_MONITOR_START: goal='My Project', interval=10]";
      const commands = detectScreenCaptureCommands(content);
      expect(commands).toHaveLength(1);
      expect(commands[0]).toEqual({
        kind: 'start',
        goal: 'My Project',
        intervalMinutes: 10,
      });
    });

    it('should default interval to 5 when not specified', () => {
      const content = '[SCREEN_MONITOR_START: goal="Test"]';
      const commands = detectScreenCaptureCommands(content);
      expect(commands).toHaveLength(1);
      expect(commands[0]).toEqual({
        kind: 'start',
        goal: 'Test',
        intervalMinutes: 5,
      });
    });

    it('should detect stop command', () => {
      const content = 'Session is over. [SCREEN_MONITOR_STOP]';
      const commands = detectScreenCaptureCommands(content);
      expect(commands).toHaveLength(1);
      expect(commands[0]).toEqual({ kind: 'stop' });
    });

    it('should detect status command', () => {
      const content = 'Let me check: [SCREEN_MONITOR_STATUS]';
      const commands = detectScreenCaptureCommands(content);
      expect(commands).toHaveLength(1);
      expect(commands[0]).toEqual({ kind: 'status' });
    });

    it('should detect pause command', () => {
      const content = '[SCREEN_MONITOR_PAUSE]';
      const commands = detectScreenCaptureCommands(content);
      expect(commands).toHaveLength(1);
      expect(commands[0]).toEqual({ kind: 'pause' });
    });

    it('should detect resume command', () => {
      const content = '[SCREEN_MONITOR_RESUME]';
      const commands = detectScreenCaptureCommands(content);
      expect(commands).toHaveLength(1);
      expect(commands[0]).toEqual({ kind: 'resume' });
    });

    it('should detect multiple commands in one message', () => {
      const content = '[SCREEN_MONITOR_START: goal="Test", interval=2] some text [SCREEN_MONITOR_STATUS]';
      const commands = detectScreenCaptureCommands(content);
      expect(commands).toHaveLength(2);
      expect(commands[0].kind).toBe('start');
      expect(commands[1].kind).toBe('status');
    });

    it('should be case insensitive', () => {
      const content = '[screen_monitor_stop]';
      const commands = detectScreenCaptureCommands(content);
      expect(commands).toHaveLength(1);
      expect(commands[0]).toEqual({ kind: 'stop' });
    });

    it('should ignore commands inside code blocks', () => {
      const content = '```\n[SCREEN_MONITOR_STOP]\n```';
      const commands = detectScreenCaptureCommands(content);
      expect(commands).toHaveLength(0);
    });

    it('should return empty array for content without commands', () => {
      const content = 'This is just a regular message about screen monitoring.';
      const commands = detectScreenCaptureCommands(content);
      expect(commands).toHaveLength(0);
    });

    it('should handle empty or null input', () => {
      expect(detectScreenCaptureCommands('')).toEqual([]);
      expect(detectScreenCaptureCommands(null as unknown as string)).toEqual([]);
      expect(detectScreenCaptureCommands(undefined as unknown as string)).toEqual([]);
    });

    it('should detect command after code block', () => {
      const content = '```\nsome code\n```\n[SCREEN_MONITOR_STOP]';
      const commands = detectScreenCaptureCommands(content);
      expect(commands).toHaveLength(1);
      expect(commands[0]).toEqual({ kind: 'stop' });
    });

    it('should handle goal with Chinese characters', () => {
      const content = '[SCREEN_MONITOR_START: goal="宣传 AionUi 多 Agent 协作", interval=5]';
      const commands = detectScreenCaptureCommands(content);
      expect(commands).toHaveLength(1);
      expect(commands[0]).toEqual({
        kind: 'start',
        goal: '宣传 AionUi 多 Agent 协作',
        intervalMinutes: 5,
      });
    });

    it('should detect summary command with count', () => {
      const content = '[SCREEN_MONITOR_SUMMARY: count=8]';
      const commands = detectScreenCaptureCommands(content);
      expect(commands).toHaveLength(1);
      expect(commands[0]).toEqual({ kind: 'summary', count: 8 });
    });

    it('should detect summary command without count (defaults to 5)', () => {
      const content = '[SCREEN_MONITOR_SUMMARY]';
      const commands = detectScreenCaptureCommands(content);
      expect(commands).toHaveLength(1);
      expect(commands[0]).toEqual({ kind: 'summary', count: 5 });
    });

    it('should detect stop followed by summary in sequence', () => {
      const content = '[SCREEN_MONITOR_STOP] Now let me get the summary [SCREEN_MONITOR_SUMMARY: count=10]';
      const commands = detectScreenCaptureCommands(content);
      expect(commands).toHaveLength(2);
      expect(commands[0]).toEqual({ kind: 'stop' });
      expect(commands[1]).toEqual({ kind: 'summary', count: 10 });
    });
  });

  describe('stripScreenCaptureCommands', () => {
    it('should remove start command from content', () => {
      const content = 'Starting now [SCREEN_MONITOR_START: goal="Test", interval=5] ok';
      const stripped = stripScreenCaptureCommands(content);
      expect(stripped).toBe('Starting now  ok');
    });

    it('should remove stop command from content', () => {
      const content = 'Session done [SCREEN_MONITOR_STOP] goodbye';
      const stripped = stripScreenCaptureCommands(content);
      expect(stripped).toBe('Session done  goodbye');
    });

    it('should remove all commands from content', () => {
      const content = '[SCREEN_MONITOR_STATUS] checking [SCREEN_MONITOR_PAUSE] and [SCREEN_MONITOR_RESUME]';
      const stripped = stripScreenCaptureCommands(content);
      expect(stripped).toBe('checking  and');
    });

    it('should handle content with no commands', () => {
      const content = 'Just regular text';
      const stripped = stripScreenCaptureCommands(content);
      expect(stripped).toBe('Just regular text');
    });

    it('should handle empty or null input', () => {
      expect(stripScreenCaptureCommands('')).toBe('');
      expect(stripScreenCaptureCommands(null as unknown as string)).toBe(null);
      expect(stripScreenCaptureCommands(undefined as unknown as string)).toBe(undefined);
    });

    it('should be case insensitive when stripping', () => {
      const content = 'test [screen_monitor_stop] end';
      const stripped = stripScreenCaptureCommands(content);
      expect(stripped).toBe('test  end');
    });

    it('should remove summary command from content', () => {
      const content = 'Here are the results [SCREEN_MONITOR_SUMMARY: count=5] done';
      const stripped = stripScreenCaptureCommands(content);
      expect(stripped).toBe('Here are the results  done');
    });

    it('should remove summary command without count', () => {
      const content = 'Getting summary [SCREEN_MONITOR_SUMMARY] now';
      const stripped = stripScreenCaptureCommands(content);
      expect(stripped).toBe('Getting summary  now');
    });
  });
});
