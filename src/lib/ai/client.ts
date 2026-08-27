import OpenAI from "openai";

export const openai = new OpenAI();

// gpt-5.6-sol por defecto (modelo insignia); configurable a gpt-5.6-terra o
// gpt-5.6-luna para reducir costo/latencia en escaneos masivos (Nivel 3/4).
export const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-5.6-sol";
