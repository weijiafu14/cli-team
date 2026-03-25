import type {
  CompactionProvider,
  CompactionThresholds,
  CompactionUsageReport,
  ContextBudgetState,
  ProviderActions,
} from './types';
import { COMPACT_DEBOUNCE_MS, DEFAULT_THRESHOLDS } from './types';

/** Patterns that indicate a permanently poisoned session (not recoverable by retry) */
const SESSION_POISON_PATTERNS = [
  /exceeds the dimension limit/i,
  /many-image/i,
  /context window.*overflow/i,
  /No capacity available/i,
  /model_capacity_exhausted/i,
];

/** Number of consecutive errors before a session is considered poisoned */
const POISON_THRESHOLD = 2;

/** Per-conversation error tracking for session health */
type SessionHealthState = {
  consecutiveErrors: number;
  lastErrorAt: number;
  lastErrorMessage: string;
  poisoned: boolean;
};

/**
 * AutoCompactionOrchestrator — unified context budget management for all agent types.
 *
 * Responsibilities:
 * 1. Monitor context usage reports from ACP, Codex, and Gemini agents
 * 2. Evaluate usage against configurable thresholds (warn / compact / rollover)
 * 3. Dispatch provider-specific compact or rollover actions when thresholds are exceeded
 *
 * Actions are registered per-conversation (not per-provider) because each conversation
 * has its own agent instance with its own closure/reference.
 */
export class AutoCompactionOrchestrator {
  private states = new Map<string, ContextBudgetState>();
  private conversationActions = new Map<string, ProviderActions>();
  private sessionHealth = new Map<string, SessionHealthState>();
  private thresholds: CompactionThresholds;

  constructor(thresholds: CompactionThresholds = DEFAULT_THRESHOLDS) {
    this.thresholds = thresholds;
  }

  /**
   * Register compact and rollover actions for a specific conversation.
   * Each conversation has its own agent instance, so actions must be per-conversation.
   */
  registerConversationActions(conversationId: string, actions: ProviderActions): void {
    this.conversationActions.set(conversationId, actions);
  }

  /**
   * @deprecated Use registerConversationActions instead.
   * Kept for backward compatibility with tests — maps to a no-op.
   */
  registerProvider(_provider: CompactionProvider, _actions: ProviderActions): void {
    // No-op: use registerConversationActions for per-conversation binding
  }

  /**
   * Report context usage from an agent.
   * Called by agent managers whenever they receive token/usage data.
   *
   * @returns The current threshold level after evaluation
   */
  reportUsage(report: CompactionUsageReport): ContextBudgetState['level'] {
    const { conversationId, provider, used, limit } = report;

    if (limit <= 0) {
      return 'normal';
    }

    const ratio = used / limit;
    const existing = this.states.get(conversationId);

    const state: ContextBudgetState = {
      conversationId,
      provider,
      used,
      limit,
      ratio,
      lastCompactAt: existing?.lastCompactAt ?? 0,
      compactInProgress: existing?.compactInProgress ?? false,
      compactAttempts: existing?.compactAttempts ?? 0,
      level: this.evaluateLevel(ratio),
    };

    this.states.set(conversationId, state);

    // Trigger actions based on threshold level
    void this.handleThreshold(state);

    return state.level;
  }

  /**
   * Get the current budget state for a conversation.
   */
  getState(conversationId: string): ContextBudgetState | undefined {
    return this.states.get(conversationId);
  }

  /**
   * Check if conversation actions are registered.
   */
  hasActions(conversationId: string): boolean {
    return this.conversationActions.has(conversationId);
  }

  /**
   * Remove tracking state for a conversation (e.g., when conversation is closed).
   */
  removeState(conversationId: string): void {
    this.states.delete(conversationId);
    this.conversationActions.delete(conversationId);
  }

  /**
   * Clear all tracked states.
   */
  reset(): void {
    this.states.clear();
    this.conversationActions.clear();
    this.sessionHealth.clear();
  }

  /**
   * Report an error from an agent session.
   * Tracks consecutive errors and detects "poisoned" sessions that need reset.
   *
   * @returns true if the session is now considered poisoned and needs a fresh start
   */
  reportError(conversationId: string, errorMessage: string): boolean {
    const existing = this.sessionHealth.get(conversationId);
    const isPoisonPattern = SESSION_POISON_PATTERNS.some((p) => p.test(errorMessage));

    const state: SessionHealthState = {
      consecutiveErrors: (existing?.consecutiveErrors ?? 0) + 1,
      lastErrorAt: Date.now(),
      lastErrorMessage: errorMessage,
      poisoned: isPoisonPattern || (existing?.consecutiveErrors ?? 0) + 1 >= POISON_THRESHOLD,
    };

    this.sessionHealth.set(conversationId, state);

    if (state.poisoned) {
      console.warn(
        `[AutoCompaction] Session POISONED: ${conversationId} ` +
          `(${state.consecutiveErrors} consecutive errors, pattern=${isPoisonPattern}): ${errorMessage}`
      );
    }

    return state.poisoned;
  }

  /**
   * Report a successful interaction, clearing error tracking for the conversation.
   */
  reportSuccess(conversationId: string): void {
    this.sessionHealth.delete(conversationId);
  }

  /**
   * Check if a session is poisoned (needs fresh start before next message).
   */
  isSessionPoisoned(conversationId: string): boolean {
    return this.sessionHealth.get(conversationId)?.poisoned ?? false;
  }

  /**
   * Clear the poisoned state after a session has been reset.
   */
  clearPoisonedState(conversationId: string): void {
    this.sessionHealth.delete(conversationId);
  }

  private evaluateLevel(ratio: number): ContextBudgetState['level'] {
    if (ratio >= this.thresholds.rollover) return 'rollover';
    if (ratio >= this.thresholds.compact) return 'compact';
    if (ratio >= this.thresholds.warn) return 'warn';
    return 'normal';
  }

  private async handleThreshold(state: ContextBudgetState): Promise<void> {
    if (state.level === 'normal' || state.level === 'warn') {
      if (state.level === 'warn') {
        console.log(
          `[AutoCompaction] WARN: ${state.conversationId} at ${(state.ratio * 100).toFixed(1)}% ` +
            `(${state.used}/${state.limit} tokens)`
        );
      }
      return;
    }

    // Debounce: skip if a compact was attempted recently
    const now = Date.now();
    if (state.compactInProgress || now - state.lastCompactAt < COMPACT_DEBOUNCE_MS) {
      return;
    }

    const actions = this.conversationActions.get(state.conversationId);
    if (!actions) {
      console.warn(`[AutoCompaction] No actions registered for conversation "${state.conversationId}"`);
      return;
    }

    state.compactInProgress = true;
    state.lastCompactAt = now;
    state.compactAttempts++;

    try {
      if (state.level === 'rollover') {
        console.log(`[AutoCompaction] ROLLOVER: ${state.conversationId} at ${(state.ratio * 100).toFixed(1)}%`);
        await actions.rollover(state.conversationId);
      } else if (state.level === 'compact') {
        console.log(`[AutoCompaction] COMPACT: ${state.conversationId} at ${(state.ratio * 100).toFixed(1)}%`);
        await actions.compact(state.conversationId);
      }
    } catch (err) {
      console.error(`[AutoCompaction] Action failed for ${state.conversationId}:`, err);
    } finally {
      state.compactInProgress = false;
    }
  }
}
