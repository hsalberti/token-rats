import { z } from "zod";

const count = z.number().int().nonnegative().default(0);
const ChatUsage = z.object({
  model: z.string().optional(),
  usage: z.object({
    prompt_tokens: z.number().int().nonnegative(),
    completion_tokens: z.number().int().nonnegative(),
    prompt_tokens_details: z.object({ cached_tokens: count, cache_write_tokens: count }).nullish(),
    completion_tokens_details: z.object({ reasoning_tokens: count }).nullish(),
  }),
});
export interface ChatCounts {
  model: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  reasoning: number;
}
export function readChatUsage(value: unknown, model: string): ChatCounts | null {
  const parsed = ChatUsage.safeParse(value);
  if (!parsed.success) return null;
  const { usage } = parsed.data;
  const cacheRead = usage.prompt_tokens_details?.cached_tokens ?? 0;
  const cacheWrite = usage.prompt_tokens_details?.cache_write_tokens ?? 0;
  return {
    model: parsed.data.model ?? model,
    input: Math.max(0, usage.prompt_tokens - cacheRead - cacheWrite),
    output: usage.completion_tokens,
    cacheRead,
    cacheWrite,
    reasoning: usage.completion_tokens_details?.reasoning_tokens ?? 0,
  };
}
