import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AutoCompactionOrchestrator } from '@process/services/autoCompaction/AutoCompactionOrchestrator';
import type { ProviderActions } from '@process/services/autoCompaction/types';

describe('AutoCompactionOrchestrator', () => {
  let orchestrator: AutoCompactionOrchestrator;
  let mockAcpActions: ProviderActions;
  let mockCodexActions: ProviderActions;
  let mockGeminiActions: ProviderActions;

  beforeEach(() => {
    orchestrator = new AutoCompactionOrchestrator();
    mockAcpActions = {
      compact: vi.fn().mockResolvedValue(true),
      rollover: vi.fn().mockResolvedValue(true),
    };
    mockCodexActions = {
      compact: vi.fn().mockResolvedValue(true),
      rollover: vi.fn().mockResolvedValue(true),
    };
    mockGeminiActions = {
      compact: vi.fn().mockResolvedValue(true),
      rollover: vi.fn().mockResolvedValue(true),
    };
    orchestrator.registerConversationActions('conv-1', mockAcpActions);
    orchestrator.registerConversationActions('conv-2', mockCodexActions);
    orchestrator.registerConversationActions('conv-3', mockGeminiActions);
  });

  describe('threshold evaluation', () => {
    it('returns normal when usage is below 80%', () => {
      const level = orchestrator.reportUsage({
        conversationId: 'conv-1',
        provider: 'acp',
        used: 70000,
        limit: 200000,
      });
      expect(level).toBe('normal');
    });

    it('returns warn when usage is between 80% and 90%', () => {
      const level = orchestrator.reportUsage({
        conversationId: 'conv-1',
        provider: 'acp',
        used: 170000,
        limit: 200000,
      });
      expect(level).toBe('warn');
    });

    it('returns compact when usage is between 90% and 96%', () => {
      const level = orchestrator.reportUsage({
        conversationId: 'conv-1',
        provider: 'acp',
        used: 185000,
        limit: 200000,
      });
      expect(level).toBe('compact');
    });

    it('returns rollover when usage exceeds 96%', () => {
      const level = orchestrator.reportUsage({
        conversationId: 'conv-1',
        provider: 'codex',
        used: 920000,
        limit: 950000,
      });
      expect(level).toBe('rollover');
    });

    it('returns normal when limit is 0 or negative', () => {
      const level = orchestrator.reportUsage({
        conversationId: 'conv-1',
        provider: 'acp',
        used: 100000,
        limit: 0,
      });
      expect(level).toBe('normal');
    });
  });

  describe('compact action triggering', () => {
    it('triggers compact action when usage crosses 90%', async () => {
      orchestrator.reportUsage({
        conversationId: 'conv-1',
        provider: 'acp',
        used: 185000,
        limit: 200000,
      });

      // Wait for async handleThreshold
      await vi.waitFor(() => {
        expect(mockAcpActions.compact).toHaveBeenCalledWith('conv-1');
      });
    });

    it('triggers rollover action when usage crosses 96%', async () => {
      orchestrator.reportUsage({
        conversationId: 'conv-2',
        provider: 'codex',
        used: 920000,
        limit: 950000,
      });

      await vi.waitFor(() => {
        expect(mockCodexActions.rollover).toHaveBeenCalledWith('conv-2');
      });
    });

    it('does not trigger action when usage is below compact threshold', async () => {
      orchestrator.reportUsage({
        conversationId: 'conv-1',
        provider: 'acp',
        used: 150000,
        limit: 200000,
      });

      // Give time for any async action
      await new Promise((r) => setTimeout(r, 50));
      expect(mockAcpActions.compact).not.toHaveBeenCalled();
      expect(mockAcpActions.rollover).not.toHaveBeenCalled();
    });
  });

  describe('debounce', () => {
    it('does not trigger compact again within debounce window', async () => {
      orchestrator.reportUsage({
        conversationId: 'conv-1',
        provider: 'acp',
        used: 185000,
        limit: 200000,
      });

      await vi.waitFor(() => {
        expect(mockAcpActions.compact).toHaveBeenCalledTimes(1);
      });

      // Report again immediately — should be debounced
      orchestrator.reportUsage({
        conversationId: 'conv-1',
        provider: 'acp',
        used: 186000,
        limit: 200000,
      });

      await new Promise((r) => setTimeout(r, 50));
      expect(mockAcpActions.compact).toHaveBeenCalledTimes(1);
    });
  });

  describe('state management', () => {
    it('tracks state per conversation', () => {
      orchestrator.reportUsage({
        conversationId: 'conv-1',
        provider: 'acp',
        used: 100000,
        limit: 200000,
      });
      orchestrator.reportUsage({
        conversationId: 'conv-2',
        provider: 'codex',
        used: 800000,
        limit: 950000,
      });

      const state1 = orchestrator.getState('conv-1');
      const state2 = orchestrator.getState('conv-2');

      expect(state1?.provider).toBe('acp');
      expect(state1?.level).toBe('normal');
      expect(state2?.provider).toBe('codex');
      expect(state2?.level).toBe('warn');
    });

    it('removes state for a conversation', () => {
      orchestrator.reportUsage({
        conversationId: 'conv-1',
        provider: 'acp',
        used: 100000,
        limit: 200000,
      });
      orchestrator.removeState('conv-1');
      expect(orchestrator.getState('conv-1')).toBeUndefined();
    });

    it('resets all states', () => {
      orchestrator.reportUsage({
        conversationId: 'conv-1',
        provider: 'acp',
        used: 100000,
        limit: 200000,
      });
      orchestrator.reportUsage({
        conversationId: 'conv-2',
        provider: 'codex',
        used: 500000,
        limit: 950000,
      });
      orchestrator.reset();
      expect(orchestrator.getState('conv-1')).toBeUndefined();
      expect(orchestrator.getState('conv-2')).toBeUndefined();
    });
  });

  describe('custom thresholds', () => {
    it('respects custom threshold values', () => {
      const customOrchestrator = new AutoCompactionOrchestrator({
        warn: 0.5,
        compact: 0.7,
        rollover: 0.85,
      });

      const level = customOrchestrator.reportUsage({
        conversationId: 'conv-1',
        provider: 'acp',
        used: 55000,
        limit: 100000,
      });
      expect(level).toBe('warn');
    });
  });

  describe('unregistered provider', () => {
    it('handles usage report from unregistered provider gracefully', async () => {
      const bareOrchestrator = new AutoCompactionOrchestrator();
      // No providers registered
      const level = bareOrchestrator.reportUsage({
        conversationId: 'conv-1',
        provider: 'acp',
        used: 185000,
        limit: 200000,
      });
      expect(level).toBe('compact');

      // Should not throw
      await new Promise((r) => setTimeout(r, 50));
    });
  });

  describe('session health tracking', () => {
    it('marks session as poisoned after consecutive errors', () => {
      expect(orchestrator.isSessionPoisoned('conv-1')).toBe(false);

      orchestrator.reportError('conv-1', 'some transient error');
      expect(orchestrator.isSessionPoisoned('conv-1')).toBe(false);

      // Second consecutive error triggers poisoned state
      const isPoisoned = orchestrator.reportError('conv-1', 'another error');
      expect(isPoisoned).toBe(true);
      expect(orchestrator.isSessionPoisoned('conv-1')).toBe(true);
    });

    it('immediately poisons session on known poison patterns', () => {
      const isPoisoned = orchestrator.reportError(
        'conv-1',
        'An image in the conversation exceeds the dimension limit for many-image requests',
      );
      expect(isPoisoned).toBe(true);
      expect(orchestrator.isSessionPoisoned('conv-1')).toBe(true);
    });

    it('detects capacity exhaustion pattern', () => {
      const isPoisoned = orchestrator.reportError(
        'conv-1',
        'No capacity available for model gemini-3-flash-preview',
      );
      expect(isPoisoned).toBe(true);
    });

    it('detects context overflow pattern', () => {
      const isPoisoned = orchestrator.reportError(
        'conv-1',
        'Context window will overflow with this request',
      );
      expect(isPoisoned).toBe(true);
    });

    it('clears error tracking on success', () => {
      orchestrator.reportError('conv-1', 'error 1');
      orchestrator.reportSuccess('conv-1');
      expect(orchestrator.isSessionPoisoned('conv-1')).toBe(false);

      // After success, needs 2 more consecutive errors to poison again
      orchestrator.reportError('conv-1', 'error 2');
      expect(orchestrator.isSessionPoisoned('conv-1')).toBe(false);
    });

    it('clears poisoned state explicitly', () => {
      orchestrator.reportError('conv-1', 'exceeds the dimension limit');
      expect(orchestrator.isSessionPoisoned('conv-1')).toBe(true);

      orchestrator.clearPoisonedState('conv-1');
      expect(orchestrator.isSessionPoisoned('conv-1')).toBe(false);
    });

    it('reset clears session health state', () => {
      orchestrator.reportError('conv-1', 'exceeds the dimension limit');
      expect(orchestrator.isSessionPoisoned('conv-1')).toBe(true);

      orchestrator.reset();
      expect(orchestrator.isSessionPoisoned('conv-1')).toBe(false);
    });
  });
});
