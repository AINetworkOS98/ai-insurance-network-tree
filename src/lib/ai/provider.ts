// src/lib/ai/provider.ts — Provider Adapter Pattern (MASTER PROMPT #27)
// Frontend ห้ามรู้ API Key — ทุกอย่าง Server Side เท่านั้น
export interface AIProvider {
  chat(messages: {role:'system'|'user'|'assistant'; content:string}[], opts?: {model?: string; temperature?: number; maxTokens?: number}): Promise<string>;
  analyze(text: string, instruction: string): Promise<string>;
  embed?(texts: string[]): Promise<number[][]>;
}

export interface AIProviderConfig {
  provider: string;  // hermes | deepseek | openai | gemini | openrouter
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}
