import Anthropic from "@anthropic-ai/sdk";

export const anthropic = new Anthropic();

// claude-opus-5 por defecto (mejor calidad); configurable a claude-sonnet-5
// para reducir costo/latencia en escaneos masivos (Nivel 3/4).
export const CLAUDE_MODEL = process.env.CLAUDE_MODEL ?? "claude-opus-5";
