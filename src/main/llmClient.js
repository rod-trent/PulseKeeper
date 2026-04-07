'use strict';

// Mirror of AgentPlatform's grokClient.js — universal LLM client via OpenAI SDK
const { OpenAI } = require('openai');

const PROVIDERS = {
  xai: {
    label: 'xAI (Grok)',
    baseURL: 'https://api.x.ai/v1',
    models: ['grok-3', 'grok-3-fast', 'grok-3-mini']
  },
  openai: {
    label: 'OpenAI',
    baseURL: 'https://api.openai.com/v1',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o3-mini']
  },
  anthropic: {
    label: 'Anthropic (Claude)',
    baseURL: 'https://api.anthropic.com/v1',
    models: ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001']
  },
  ollama: {
    label: 'Ollama (Local)',
    baseURL: 'http://localhost:11434/v1',
    models: ['llama3.2', 'llama3.1', 'mistral', 'phi3', 'gemma2', 'qwen2.5']
  }
};

function getProviders() {
  return Object.entries(PROVIDERS).map(([id, p]) => ({ id, ...p }));
}

async function generateDigest(llmConfig, contentItems) {
  const { provider, model, apiKey, baseURL, digestPrompt } = llmConfig;

  const providerDef = PROVIDERS[provider] || { baseURL: baseURL || '' };
  const effectiveBase = provider === 'custom' ? baseURL : providerDef.baseURL;

  const client = new OpenAI({
    apiKey: apiKey || 'no-key',
    baseURL: effectiveBase,
    defaultHeaders: provider === 'anthropic'
      ? { 'anthropic-version': '2023-06-01', 'x-api-key': apiKey }
      : undefined
  });

  // Format content items for the prompt
  const contentText = contentItems.slice(0, 50).map((item, i) =>
    `[${i + 1}] ${item.source} — ${item.title}\n${item.description || ''}\nURL: ${item.url}\nDate: ${item.publishedAt}`
  ).join('\n\n---\n\n');

  const systemPrompt = 'You are a personal content curator. Generate clear, concise digests with relevant highlights and links. Format your response in Markdown.';
  const userPrompt = `${digestPrompt || 'Summarize the following content into a daily digest:'}\n\n${contentText}`;

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.5,
    max_tokens: 2000
  });

  return response.choices[0]?.message?.content || '';
}

module.exports = { generateDigest, getProviders, PROVIDERS };
