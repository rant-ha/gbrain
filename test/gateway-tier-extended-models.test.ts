/**
 * reconfigureGatewayWithEngine — tier-resolved models join the extended set.
 *
 * assertTouchpoint's extended-models contract (model-resolver.ts) says models
 * the user opted into via config — `models.default` and `models.tier.*`
 * included — bypass the native recipe allowlist. Pre-fix, only chat/expansion/
 * embedding/reranker were registered, so a model reachable ONLY through a tier
 * (e.g. `models.tier.deep` set to an Opus newer than the recipe list) failed
 * `probeChatModel` and silently degraded think/auto_think to the gather-only
 * stub — mislabeled NO_ANTHROPIC_API_KEY.
 *
 * Uses a deliberately fictional model id so the test stays valid no matter how
 * current the recipe list is.
 */
import { describe, test, expect, afterEach } from 'bun:test';
import {
  configureGateway,
  reconfigureGatewayWithEngine,
  resetGateway,
  validateModelId,
} from '../src/core/ai/gateway.ts';
import type { BrainEngine } from '../src/core/engine.ts';

function stubEngine(config: Record<string, string>): BrainEngine {
  return {
    getConfig: async (k: string) => config[k] ?? null,
    listConfigKeys: async (prefix: string) =>
      Object.keys(config).filter(k => k.startsWith(prefix)),
  } as unknown as BrainEngine;
}

/** Engine without listConfigKeys — the pre-migration / legacy shape. */
function stubEngineNoList(config: Record<string, string>): BrainEngine {
  return { getConfig: async (k: string) => config[k] ?? null } as unknown as BrainEngine;
}

afterEach(() => {
  resetGateway();
});

describe('reconfigureGatewayWithEngine — tier models extend the allowlist', () => {
  test('a models.tier.deep model unknown to the recipe validates after reconfigure', async () => {
    configureGateway({
      embedding_model: 'openai:text-embedding-3-large',
      embedding_dimensions: 1536,
      env: { ANTHROPIC_API_KEY: 'sk-fake', OPENAI_API_KEY: 'sk-fake' },
    });
    // Pre-reconfigure: an id absent from the recipe allowlist is rejected.
    expect(validateModelId('anthropic:claude-hypothetical-9').ok).toBe(false);

    await reconfigureGatewayWithEngine(
      stubEngine({ 'models.tier.deep': 'anthropic:claude-hypothetical-9' }),
    );

    // Post-reconfigure: the tier-configured model is in the extended set.
    expect(validateModelId('anthropic:claude-hypothetical-9').ok).toBe(true);
    // An id configured NOWHERE stays rejected — the allowlist still bites.
    expect(validateModelId('anthropic:claude-never-configured-1').ok).toBe(false);
  });

  test('models.default reaches the extended set through tier resolution', async () => {
    configureGateway({
      embedding_model: 'openai:text-embedding-3-large',
      embedding_dimensions: 1536,
      env: { ANTHROPIC_API_KEY: 'sk-fake', OPENAI_API_KEY: 'sk-fake' },
    });
    await reconfigureGatewayWithEngine(
      stubEngine({ 'models.default': 'anthropic:claude-hypothetical-10' }),
    );
    expect(validateModelId('anthropic:claude-hypothetical-10').ok).toBe(true);
  });

  test('per-op keys (models.think, facts.extraction_model) extend the allowlist', async () => {
    configureGateway({
      embedding_model: 'openai:text-embedding-3-large',
      embedding_dimensions: 1536,
      env: { ANTHROPIC_API_KEY: 'sk-fake', OPENAI_API_KEY: 'sk-fake' },
    });
    // Pre-reconfigure: ids absent from the recipe allowlist are rejected.
    expect(validateModelId('google:gemini-hypothetical-11').ok).toBe(false);

    await reconfigureGatewayWithEngine(
      stubEngine({
        'models.think': 'google:gemini-hypothetical-11',
        'models.dream.synthesize': 'anthropic:claude-hypothetical-12',
        'facts.extraction_model': 'anthropic:claude-hypothetical-13',
        // Alias TARGETS register too (resolveModel hands the probe the
        // alias-resolved full id, so the target is what must validate).
        'models.aliases.luna': 'google:gemini-hypothetical-14',
      }),
    );

    expect(validateModelId('google:gemini-hypothetical-11').ok).toBe(true);
    expect(validateModelId('anthropic:claude-hypothetical-12').ok).toBe(true);
    expect(validateModelId('anthropic:claude-hypothetical-13').ok).toBe(true);
    expect(validateModelId('google:gemini-hypothetical-14').ok).toBe(true);
    // An id configured NOWHERE stays rejected — the allowlist still bites.
    expect(validateModelId('google:gemini-never-configured-2').ok).toBe(false);
  });

  test('engine without listConfigKeys falls back to tier registration (no throw)', async () => {
    configureGateway({
      embedding_model: 'openai:text-embedding-3-large',
      embedding_dimensions: 1536,
      env: { ANTHROPIC_API_KEY: 'sk-fake', OPENAI_API_KEY: 'sk-fake' },
    });
    await reconfigureGatewayWithEngine(
      stubEngineNoList({
        'models.tier.deep': 'anthropic:claude-hypothetical-15',
        'models.think': 'google:gemini-hypothetical-16',
      }),
    );
    // Tier registration still lands; per-op sweep is skipped gracefully.
    expect(validateModelId('anthropic:claude-hypothetical-15').ok).toBe(true);
    expect(validateModelId('google:gemini-hypothetical-16').ok).toBe(false);
  });
});
