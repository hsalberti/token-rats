/** Prefer the model publisher over an intermediary such as Cursor or OpenRouter. */
export function modelProvider(model: string, recordedProvider: string): string {
  const id = model.toLowerCase();
  const name = id.split("/").at(-1) ?? id;
  if (id.startsWith("openai/") || /^(gpt-|chatgpt-|o[1-9](?:-|$)|codex)/.test(name))
    return "OpenAI";
  if (id.startsWith("anthropic/") || name.startsWith("claude-")) return "Anthropic";
  if (id.startsWith("google/") || name.startsWith("gemini-")) return "Google";
  if (id.startsWith("x-ai/") || name.startsWith("grok-")) return "xAI";
  if (id.startsWith("deepseek/") || name.startsWith("deepseek-")) return "DeepSeek";
  const labels: Record<string, string> = {
    openai: "OpenAI",
    anthropic: "Anthropic",
    google: "Google",
    openrouter: "OpenRouter",
    cursor: "Cursor",
    ollama: "Ollama",
    unknown: "Unknown provider",
  };
  return labels[recordedProvider.toLowerCase()] ?? recordedProvider;
}
