/**
 * The model client, behind a small interface so tests can inject a fake and run
 * the entire pipeline with no network and no token spend.
 *
 * The real implementation uses the official Anthropic SDK. The API key is read
 * from ANTHROPIC_API_KEY by the SDK; it is never hardcoded. Model identifiers
 * come from config.ts.
 */

import Anthropic from "@anthropic-ai/sdk";

export interface ModelRequest {
  model: string;
  system: string;
  user: string;
  maxTokens: number;
}

/** A single text-in, text-out completion. Easy to fake in tests. */
export interface ModelClient {
  complete(req: ModelRequest): Promise<string>;
}

/** Anthropic-backed client. Opus-family default: adaptive thinking off (omitted), no sampling params. */
export class AnthropicModelClient implements ModelClient {
  private readonly client: Anthropic;

  constructor() {
    // The SDK reads ANTHROPIC_API_KEY from the environment.
    this.client = new Anthropic();
  }

  async complete(req: ModelRequest): Promise<string> {
    const response = await this.client.messages.create({
      model: req.model,
      max_tokens: req.maxTokens,
      system: req.system,
      messages: [{ role: "user", content: req.user }],
    });
    return response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("")
      .trim();
  }
}

/** Construct the real client, failing clearly if the key is absent. */
export function createAnthropicClient(): ModelClient {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Engine B baking requires it. See .env.example.",
    );
  }
  return new AnthropicModelClient();
}
