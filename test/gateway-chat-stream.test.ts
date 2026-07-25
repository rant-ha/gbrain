/**
 * Pins the chat() streaming path (ChatOpts.stream === true) — the v0.42.65.4
 * fix that lets a long think synthesis survive proxies/routers with a
 * response-start timeout (Heroku's non-configurable 30s router cut returned
 * `context canceled` → 503 on every complex think while short questions
 * passed). stream=true runs streamText and aggregates the finished stream
 * into the same ChatResult the generateText path produces:
 *
 *   - stream:true routes through the streamText seam, NOT generateText
 *   - the aggregated ChatResult carries text/blocks/usage/stopReason
 *   - default (no stream) keeps using generateText — no behavior change
 *   - stream + tools falls back to generateText (tool-call stream
 *     aggregation is not implemented)
 *   - a mid-stream failure is normalized like any generateText failure
 */
import { describe, test, expect, afterEach } from 'bun:test';
import {
  configureGateway,
  resetGateway,
  chat,
  __setGenerateTextTransportForTests,
  __setStreamTextTransportForTests,
} from '../src/core/ai/gateway.ts';
import { AITransientError } from '../src/core/ai/errors.ts';

function configure(): void {
  configureGateway({
    embedding_model: 'openai:text-embedding-3-large',
    embedding_dimensions: 1536,
    env: { OPENAI_API_KEY: 'sk-fake' },
  });
}

/** streamText-shaped stub: promise-valued fields, no await at call time. */
function streamStub(overrides: Partial<Record<'text' | 'usage' | 'finishReason' | 'providerMetadata', Promise<any>>> = {}) {
  return {
    text: Promise.resolve('streamed answer'),
    usage: Promise.resolve({ inputTokens: 11, outputTokens: 7 }),
    finishReason: Promise.resolve('stop'),
    providerMetadata: Promise.resolve(undefined),
    ...overrides,
  };
}

afterEach(() => {
  resetGateway();
  __setGenerateTextTransportForTests(null);
  __setStreamTextTransportForTests(null);
});

describe('chat() — stream:true aggregated streaming', () => {
  test('routes through streamText, not generateText, and aggregates the ChatResult', async () => {
    configure();
    let generateCalls = 0;
    let streamCalls = 0;
    let capturedArgs: any;
    __setGenerateTextTransportForTests((async () => {
      generateCalls++;
      throw new Error('generateText must not run on the stream path');
    }) as any);
    __setStreamTextTransportForTests(((args: any) => {
      streamCalls++;
      capturedArgs = args;
      return streamStub();
    }) as any);

    const res = await chat({
      model: 'litellm:test-model',
      system: 'sys',
      messages: [{ role: 'user', content: 'hello' }],
      maxTokens: 1234,
      stream: true,
    });

    expect(streamCalls).toBe(1);
    expect(generateCalls).toBe(0);
    // Same call params the generateText path would send.
    expect(capturedArgs.system).toBe('sys');
    expect(capturedArgs.maxOutputTokens).toBe(1234);
    // Aggregated result matches the non-streaming ChatResult shape.
    expect(res.text).toBe('streamed answer');
    expect(res.blocks).toEqual([{ type: 'text', text: 'streamed answer' }]);
    expect(res.usage.input_tokens).toBe(11);
    expect(res.usage.output_tokens).toBe(7);
    expect(res.stopReason).toBe('end');
    expect(res.model).toBe('litellm:test-model');
  });

  test('default (no stream) keeps the generateText path untouched', async () => {
    configure();
    let streamCalls = 0;
    __setStreamTextTransportForTests((() => {
      streamCalls++;
      return streamStub();
    }) as any);
    __setGenerateTextTransportForTests((async () => ({
      content: [{ type: 'text', text: 'non-streamed' }],
      finishReason: 'stop',
      usage: { inputTokens: 1, outputTokens: 1 },
    })) as any);

    const res = await chat({
      model: 'litellm:test-model',
      messages: [{ role: 'user', content: 'hello' }],
    });

    expect(streamCalls).toBe(0);
    expect(res.text).toBe('non-streamed');
  });

  test('stream + tools falls back to generateText (no tool-stream aggregation)', async () => {
    configure();
    let streamCalls = 0;
    __setStreamTextTransportForTests((() => {
      streamCalls++;
      return streamStub();
    }) as any);
    __setGenerateTextTransportForTests((async () => ({
      content: [{ type: 'text', text: 'tools path' }],
      finishReason: 'stop',
      usage: { inputTokens: 1, outputTokens: 1 },
    })) as any);

    const res = await chat({
      model: 'litellm:test-model',
      messages: [{ role: 'user', content: 'hello' }],
      tools: [{ name: 'search', description: 'search the brain', inputSchema: { type: 'object' } }],
      stream: true,
    });

    expect(streamCalls).toBe(0);
    expect(res.text).toBe('tools path');
  });

  test('mid-stream failure is normalized like a generateText failure', async () => {
    configure();
    const boom = Object.assign(new Error('Service Unavailable'), { statusCode: 503 });
    __setStreamTextTransportForTests((() => streamStub({
      text: Promise.reject(boom),
      usage: Promise.reject(boom),
      finishReason: Promise.reject(boom),
      providerMetadata: Promise.reject(boom),
    })) as any);

    let caught: unknown;
    try {
      await chat({
        model: 'litellm:test-model',
        messages: [{ role: 'user', content: 'hello' }],
        stream: true,
      });
    } catch (e) {
      caught = e;
    }
    // 503 → transient (retryable) with the chat(provider:model) context prefix.
    expect(caught).toBeInstanceOf(AITransientError);
    expect((caught as Error).message).toContain('chat(litellm:test-model)');
    expect((caught as Error).message).toContain('Service Unavailable');
  });
});
