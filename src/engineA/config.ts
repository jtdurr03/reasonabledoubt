/**
 * Engine A configuration. The model that fills the case-bible prose is set here,
 * overridable from the environment. Per project direction, the bible build uses
 * Opus 4.8 (the dialogue performances use Engine B's own Sonnet default).
 */

export const FILL_MODEL = process.env.ENGINE_A_FILL_MODEL ?? "claude-opus-4-8";

/** Default reject-and-retry cap for a single case generation. */
export const DEFAULT_MAX_ATTEMPTS = 8;
