import { AutoCompactionOrchestrator } from './AutoCompactionOrchestrator';

export { AutoCompactionOrchestrator } from './AutoCompactionOrchestrator';
export { downscaleImageIfNeeded } from './imageDownscaler';
export type {
  CompactionProvider,
  CompactionThresholds,
  CompactionUsageReport,
  ContextBudgetState,
  ProviderActions,
  ImageDownscaleOptions,
} from './types';
export { DEFAULT_THRESHOLDS, DEFAULT_MAX_IMAGE_DIMENSION, COMPACT_DEBOUNCE_MS } from './types';

/** Global singleton instance */
let _orchestrator: AutoCompactionOrchestrator | null = null;

/**
 * Get the global AutoCompactionOrchestrator singleton.
 * Created on first access.
 */
export function getAutoCompactionOrchestrator(): AutoCompactionOrchestrator {
  if (!_orchestrator) {
    _orchestrator = new AutoCompactionOrchestrator();
  }
  return _orchestrator;
}
