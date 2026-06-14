/**
 * Engine B configuration. Model identifiers live here, not inline, and are
 * overridable from the environment. The API key is read from the environment by
 * the client and never hardcoded.
 *
 * Defaults: a capable model performs the character voice, and a cheaper, faster
 * model runs the leak verifier. See .env.example.
 */

export const PERFORMER_MODEL = process.env.ENGINE_B_PERFORMER_MODEL ?? "claude-opus-4-8";
export const VERIFIER_MODEL = process.env.ENGINE_B_VERIFIER_MODEL ?? "claude-haiku-4-5";

/** Max tokens for a single performed line (a believable spoken length). */
export const PERFORMER_MAX_TOKENS = 320;
/** Max tokens for a verifier verdict (small JSON). */
export const VERIFIER_MAX_TOKENS = 256;

/** How many times to regenerate a leaking line before falling back to the spine. */
export const MAX_GUARD_RETRIES = 2;

/** In-fiction setting passed to the performer persona. */
export const ERA = "1960s Los Angeles";
