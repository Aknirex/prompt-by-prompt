import { IAIProvider } from '../IAIProvider';
import { GeneratePromptResult } from '../AIGeneratorService';

type OpenAIResponse = { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };

async function callOpenAICompat(
  url: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string
): Promise<GeneratePromptResult> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
      max_tokens: 2000,
    }),
  });
  const data = await res.json() as OpenAIResponse;
  if (!res.ok) return { success: false, error: `API error: ${data.error?.message ?? res.status}` };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) return { success: false, error: 'Empty response' };
  return { success: true, rawText: text };
}

export const AnthropicProvider: IAIProvider = {
  id: 'anthropic',
  displayName: 'Anthropic Claude',
  async generate(prompt, systemPrompt, apiKey, model) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    type AnthResp = { content?: Array<{ text?: string }>; error?: { message?: string } };
    const data = await res.json() as AnthResp;
    if (!res.ok) throw new Error(`Anthropic error: ${data.error?.message ?? res.status}`);
    const text = data.content?.[0]?.text?.trim();
    if (!text) throw new Error('Empty response from Anthropic');
    return text;
  },
};

export const OpenAIProvider: IAIProvider = {
  id: 'openai',
  displayName: 'OpenAI',
  async generate(prompt, systemPrompt, apiKey, model) {
    const r = await callOpenAICompat('https://api.openai.com/v1/chat/completions', apiKey, model, systemPrompt, prompt);
    if (!r.success) throw new Error(r.error);
    return r.rawText!;
  },
};

export const DeepSeekProvider: IAIProvider = {
  id: 'deepseek',
  displayName: 'DeepSeek',
  async generate(prompt, systemPrompt, apiKey, model) {
    const r = await callOpenAICompat('https://api.deepseek.com/v1/chat/completions', apiKey, model, systemPrompt, prompt);
    if (!r.success) throw new Error(r.error);
    return r.rawText!;
  },
};

export const GroqProvider: IAIProvider = {
  id: 'groq',
  displayName: 'Groq',
  async generate(prompt, systemPrompt, apiKey, model) {
    const r = await callOpenAICompat('https://api.groq.com/openai/v1/chat/completions', apiKey, model, systemPrompt, prompt);
    if (!r.success) throw new Error(r.error);
    return r.rawText!;
  },
};

export const MistralProvider: IAIProvider = {
  id: 'mistral',
  displayName: 'Mistral',
  async generate(prompt, systemPrompt, apiKey, model) {
    const r = await callOpenAICompat('https://api.mistral.ai/v1/chat/completions', apiKey, model, systemPrompt, prompt);
    if (!r.success) throw new Error(r.error);
    return r.rawText!;
  },
};

export const OpenRouterProvider: IAIProvider = {
  id: 'openrouter',
  displayName: 'OpenRouter',
  async generate(prompt, systemPrompt, apiKey, model) {
    const r = await callOpenAICompat('https://openrouter.ai/api/v1/chat/completions', apiKey, model, systemPrompt, prompt);
    if (!r.success) throw new Error(r.error);
    return r.rawText!;
  },
};

export const XAIProvider: IAIProvider = {
  id: 'xai',
  displayName: 'xAI (Grok)',
  async generate(prompt, systemPrompt, apiKey, model) {
    const r = await callOpenAICompat('https://api.x.ai/v1/chat/completions', apiKey, model, systemPrompt, prompt);
    if (!r.success) throw new Error(r.error);
    return r.rawText!;
  },
};

export const GoogleProvider: IAIProvider = {
  id: 'google',
  displayName: 'Google Gemini',
  async generate(prompt, systemPrompt, apiKey, model) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: systemPrompt + '\n\n' + prompt }] }],
        generationConfig: { maxOutputTokens: 2000 },
      }),
    });
    type GResp = { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>; error?: { message?: string } };
    const data = await res.json() as GResp;
    if (!res.ok) throw new Error(`Google error: ${data.error?.message ?? res.status}`);
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) throw new Error('Empty response from Google');
    return text;
  },
};

export const OllamaProvider: IAIProvider = {
  id: 'ollama',
  displayName: 'Ollama (local)',
  async generate(prompt, systemPrompt, _apiKey, model) {
    const endpoint = 'http://localhost:11434';
    const res = await fetch(`${endpoint}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: prompt }],
        stream: false,
      }),
    });
    type OResp = { message?: { content?: string }; error?: string };
    const data = await res.json() as OResp;
    if (!res.ok) throw new Error(`Ollama error: ${data.error ?? res.status}`);
    const text = data.message?.content?.trim();
    if (!text) throw new Error('Empty response from Ollama');
    return text;
  },
};

export const AzureProvider: IAIProvider = {
  id: 'azure',
  displayName: 'Azure OpenAI',
  async generate(prompt, systemPrompt, apiKey, model) {
    // Azure endpoint encoded in model as 'endpoint|deploymentName'
    const [endpoint, deployment] = model.split('|');
    const url = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=2024-02-15-preview`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
      body: JSON.stringify({
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: prompt }],
        max_tokens: 2000,
      }),
    });
    type AzResp = { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };
    const data = await res.json() as AzResp;
    if (!res.ok) throw new Error(`Azure error: ${data.error?.message ?? res.status}`);
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error('Empty response from Azure');
    return text;
  },
};

export const CustomProvider: IAIProvider = {
  id: 'custom',
  displayName: 'Custom (OpenAI-compat)',
  async generate(prompt, systemPrompt, apiKey, model) {
    // model encodes 'endpoint|modelName'
    const [endpoint, modelName] = model.split('|');
    const r = await callOpenAICompat(endpoint, apiKey, modelName ?? model, systemPrompt, prompt);
    if (!r.success) throw new Error(r.error);
    return r.rawText!;
  },
};
