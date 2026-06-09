import OpenAI from "openai";
import { config } from "../config.js";

const client = new OpenAI({
  apiKey: config.deepseekApiKey,
  baseURL: "https://api.deepseek.com",
  timeout: 90000,
});

const MODEL = "deepseek-chat";

interface Msg {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Full chat with JSON response format */
export async function chatJSON(msgs: Msg[], maxTokens = 16384): Promise<string> {
  const resp = await client.chat.completions.create({
    model: MODEL,
    messages: msgs as any,
    temperature: 0.7,
    max_tokens: maxTokens,
    response_format: { type: "json_object" },
  });
  const content = resp.choices[0]?.message?.content;
  if (!content) throw new Error("DeepSeek returned empty response");
  return content;
}

/** Fast chat without JSON format (for intent analysis) */
export async function chatQuick(msgs: Msg[], maxTokens = 200): Promise<string> {
  const resp = await client.chat.completions.create({
    model: MODEL,
    messages: msgs as any,
    temperature: 0.7,
    max_tokens: maxTokens,
  });
  return resp.choices[0]?.message?.content || "";
}

/** Parse JSON from LLM response, handling markdown fences */
export function parseLLMJson(content: string): any {
  try {
    return JSON.parse(content);
  } catch {
    const cleaned = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    return JSON.parse(cleaned);
  }
}
