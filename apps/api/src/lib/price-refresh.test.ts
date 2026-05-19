/**
 * Unit tests for the OpenRouter → catalog normalizer.
 *
 * The cron's I/O paths (fetch, D1.batch) are integration territory; here we
 * lock down the pure transforms — id normalization, family extraction,
 * per-token → per-MTok price conversion.
 */

import { describe, expect, it } from "vitest";
import { normalizeId, normalizeOpenRouterModel } from "./price-refresh.js";

describe("normalizeId", () => {
  it("splits provider/bareId on the first slash", () => {
    expect(normalizeId("anthropic/claude-opus-4-5")).toEqual({
      provider: "anthropic",
      bareId: "claude-opus-4-5",
    });
  });

  it("replaces dots with hyphens in the bare id to align with session model strings", () => {
    expect(normalizeId("anthropic/claude-opus-4.5")).toEqual({
      provider: "anthropic",
      bareId: "claude-opus-4-5",
    });
  });

  it("returns null for shapes without a slash", () => {
    expect(normalizeId("claude-opus-4-5")).toBeNull();
  });

  it("returns null for slash-suffixed shapes (no bare id)", () => {
    expect(normalizeId("anthropic/")).toBeNull();
  });
});

describe("normalizeOpenRouterModel", () => {
  it("produces catalog + snapshot rows from a fully-priced OpenRouter entry", () => {
    const out = normalizeOpenRouterModel({
      id: "openai/gpt-4o-mini",
      name: "OpenAI: GPT-4o mini",
      context_length: 128_000,
      architecture: { modality: "text+image->text", input_modalities: ["text", "image"] },
      pricing: { prompt: "0.00000015", completion: "0.0000006" },
    });

    expect(out).not.toBeNull();
    // family extraction only strips a trailing numeric segment — `-mini` is
    // alphabetic so the family stays equal to the bare id.
    expect(out?.catalog).toEqual({
      id: "gpt-4o-mini",
      provider: "openai",
      family: "gpt-4o-mini",
      display_name: "OpenAI: GPT-4o mini",
      modality: "multimodal",
      context_window: 128_000,
      source_id: "openai/gpt-4o-mini",
    });
    expect(out?.snapshot.model_id).toBe("gpt-4o-mini");
    expect(out?.snapshot.input_per_mtok).toBeCloseTo(0.15, 10);
    expect(out?.snapshot.output_per_mtok).toBeCloseTo(0.6, 10);
  });

  it("returns null when the entry has no input price (free / unlisted models)", () => {
    expect(
      normalizeOpenRouterModel({
        id: "huggingface/some-free-model",
        pricing: { prompt: undefined, completion: "0.000001" },
      }),
    ).toBeNull();
  });

  it("accepts null output price (embedding-style models have no completion rate)", () => {
    const out = normalizeOpenRouterModel({
      id: "openai/text-embedding-3-small",
      name: "OpenAI Embedding 3 small",
      pricing: { prompt: "0.00000002", completion: undefined },
      architecture: { modality: "text->vec" },
    });
    expect(out).not.toBeNull();
    expect(out?.snapshot.output_per_mtok).toBeNull();
    expect(out?.catalog.modality).toBe("text"); // no image/audio markers in modality
  });

  it("derives the family by stripping the trailing -N segment", () => {
    const opus = normalizeOpenRouterModel({
      id: "anthropic/claude-opus-4.7",
      pricing: { prompt: "0.000015", completion: "0.000075" },
    });
    expect(opus?.catalog.family).toBe("claude-opus");

    const haiku = normalizeOpenRouterModel({
      id: "anthropic/claude-haiku-4-5",
      pricing: { prompt: "0.0000008", completion: "0.000004" },
    });
    expect(haiku?.catalog.family).toBe("claude-haiku");
  });

  it("rejects rows whose id has no slash", () => {
    expect(
      normalizeOpenRouterModel({
        id: "weird-shape-no-slash",
        pricing: { prompt: "0.001", completion: "0.002" },
      }),
    ).toBeNull();
  });
});
