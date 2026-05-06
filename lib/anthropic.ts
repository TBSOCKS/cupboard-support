import Anthropic from '@anthropic-ai/sdk';

let _client: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('Missing ANTHROPIC_API_KEY env var');
  }
  _client = new Anthropic({ apiKey });
  return _client;
}

// Models we use across the system. Triage is a fast classifier (Haiku).
// Specialists handle conversation + tool use (Sonnet).
export const MODELS = {
  triage: 'claude-haiku-4-5',
  specialist: 'claude-sonnet-4-6',
} as const;
