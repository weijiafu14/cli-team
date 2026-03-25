/**
 * Auto-compaction types for unified context budget management.
 *
 * Supports three agent backends with different compact mechanisms:
 * - ACP (Claude): `/compact` command + image downscale
 * - Codex: native auto-compact / session rollover
 * - Gemini: `/compress` command + existing tool-response compaction
 */

/** Agent provider types that support compaction */
export type CompactionProvider = 'acp' | 'codex' | 'gemini';

/** Threshold ratios (used / limit) that trigger different actions */
export type CompactionThresholds = {
  /** Emit warning to UI (default: 0.8) */
  warn: number;
  /** Trigger compact command (default: 0.9) */
  compact: number;
  /** Force session rollover (default: 0.96) */
  rollover: number;
};

/** Per-conversation context budget tracking state */
export type ContextBudgetState = {
  conversationId: string;
  provider: CompactionProvider;
  /** Total tokens used */
  used: number;
  /** Context window limit */
  limit: number;
  /** Current usage ratio (used / limit), 0-1 */
  ratio: number;
  /** Timestamp of last compact attempt */
  lastCompactAt: number;
  /** Whether a compact is currently in progress */
  compactInProgress: boolean;
  /** Number of compact attempts in this session */
  compactAttempts: number;
  /** Current threshold level */
  level: 'normal' | 'warn' | 'compact' | 'rollover';
};

/** Usage report from any agent provider */
export type CompactionUsageReport = {
  conversationId: string;
  provider: CompactionProvider;
  used: number;
  limit: number;
};

/** Callback to trigger compact on a specific conversation */
export type CompactAction = (conversationId: string) => Promise<boolean>;

/** Callback to trigger session rollover on a specific conversation */
export type RolloverAction = (conversationId: string) => Promise<boolean>;

/** Provider-specific action handlers registered with the orchestrator */
export type ProviderActions = {
  compact: CompactAction;
  rollover: RolloverAction;
};

/** Image downscale configuration */
export type ImageDownscaleOptions = {
  /** Maximum dimension (width or height) in pixels. Default: 1920 */
  maxDimension: number;
  /** JPEG quality for downscaled images. Default: 85 */
  quality: number;
};

/** Minimum interval between compact attempts in milliseconds */
export const COMPACT_DEBOUNCE_MS = 60_000;

/** Default thresholds */
export const DEFAULT_THRESHOLDS: CompactionThresholds = {
  warn: 0.8,
  compact: 0.9,
  rollover: 0.96,
};

/** Default image downscale max dimension (under 2000px API limit) */
export const DEFAULT_MAX_IMAGE_DIMENSION = 1920;
