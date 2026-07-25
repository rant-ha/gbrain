/**
 * Pins `maxOutputTokensFor` — the per-model output-token budget `runThink`
 * passes to `client.create`. Non-Anthropic models get 64000: thinking-style
 * models (Gemini flash thinking, GPT reasoning tiers via LiteLLM) burn output
 * budget on internal reasoning, and the old 4000 cap truncated the synthesis
 * JSON. Anthropic models cap at 32000 — the Messages API constrains large
 * max_tokens on non-streaming requests; 32000 matches the gateway subagent
 * loop's production value.
 */
import { describe, test, expect } from 'bun:test';
import { maxOutputTokensFor } from '../src/core/think/index.ts';

describe('maxOutputTokensFor — per-provider output budget', () => {
  test('Anthropic models cap at 32000 (non-streaming Messages API constraint)', () => {
    expect(maxOutputTokensFor('anthropic:claude-sonnet-5')).toBe(32000);
    expect(maxOutputTokensFor('anthropic:claude-opus-5')).toBe(32000);
    expect(maxOutputTokensFor('anthropic:claude-fable-5')).toBe(32000);
    expect(maxOutputTokensFor('anthropic:claude-opus-4-8')).toBe(32000);
    expect(maxOutputTokensFor('anthropic:claude-haiku-4-5')).toBe(32000);
    expect(maxOutputTokensFor('anthropic/claude-sonnet-5')).toBe(32000); // slash form
  });

  test('everything else gets 64000', () => {
    expect(maxOutputTokensFor('openai:gpt-4o')).toBe(64000);
    expect(maxOutputTokensFor('google:gemini-3.5-flash-lite')).toBe(64000);
    expect(maxOutputTokensFor('litellm:gpt-5.6-luna')).toBe(64000);
    expect(maxOutputTokensFor('litellm:deepinfra/deepseek-ai/DeepSeek-V4-Flash')).toBe(64000);
    expect(maxOutputTokensFor('deepseek:deepseek-reasoner')).toBe(64000);
  });
});
