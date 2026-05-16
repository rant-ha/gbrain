import type { Operation } from '../core/operations.ts';

export interface McpToolDef {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
}

export interface BuildToolDefsOptions {
  /** When true, array params are serialized as string inputs for HTTP clients. */
  arrayParamsAsString?: boolean;
}

export function buildToolDefs(ops: Operation[], options: BuildToolDefsOptions = {}): McpToolDef[] {
  return ops.map(op => ({
    name: op.name,
    description: op.description,
    inputSchema: {
      type: 'object' as const,
      properties: Object.fromEntries(
        Object.entries(op.params).map(([k, v]) => [k, {
          type: v.type === 'array' && options.arrayParamsAsString ? 'string' : v.type === 'array' ? 'array' : v.type,
          ...(v.description ? { description: v.description } : {}),
          ...(v.enum ? { enum: v.enum } : {}),
          ...(v.items && !(v.type === 'array' && options.arrayParamsAsString) ? { items: { type: v.items.type } } : {}),
        }]),
      ),
      required: Object.entries(op.params)
        .filter(([, v]) => v.required)
        .map(([k]) => k),
    },
  }));
}
