// Unified LLM client supporting Google Gemini (free) and AbacusAI fallbacks

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionOptions {
  messages: ChatMessage[];
  jsonMode?: boolean;
  maxTokens?: number;
}

/**
 * Execute chat completion via Gemini 1.5 Flash (free tier)
 */
async function executeGemini(options: CompletionOptions, apiKey: string): Promise<string> {
  const systemMessage = options.messages.find(m => m.role === 'system');
  const userMessages = options.messages.filter(m => m.role !== 'system');

  const contents = userMessages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const body: any = {
    contents,
  };

  if (systemMessage) {
    body.systemInstruction = {
      parts: { text: systemMessage.content },
    };
  }

  if (options.jsonMode) {
    body.generationConfig = {
      responseMimeType: 'application/json',
    };
  }

  if (options.maxTokens) {
    body.generationConfig = {
      ...body.generationConfig,
      maxOutputTokens: options.maxTokens,
    };
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000), // 5-second timeout
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => 'Gemini API Error');
    throw new Error(`Gemini API returned status ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty response from Gemini API');

  return text;
}

/**
 * Execute chat completion via AbacusAI v1 API
 */
async function executeAbacusAI(options: CompletionOptions, apiKey: string): Promise<string> {
  const model = options.jsonMode ? 'gpt-4.1-mini' : 'gpt-5.4-mini';
  const body: any = {
    model,
    messages: options.messages,
  };

  if (options.jsonMode) {
    body.response_format = { type: 'json_object' };
  }
  if (options.maxTokens) {
    body.max_tokens = options.maxTokens;
  }

  const res = await fetch('https://apps.abacus.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000), // 5-second timeout
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => 'AbacusAI API Error');
    throw new Error(`AbacusAI API returned status ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('Empty response from AbacusAI API');

  return text;
}

/**
 * Route chat completion to the appropriate provider (prefers Gemini if key is provided)
 */
export async function getLLMCompletion(options: CompletionOptions): Promise<string> {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    try {
      return await executeGemini(options, geminiKey);
    } catch (err: any) {
      console.warn('Gemini execution failed, checking AbacusAI fallback:', err?.message);
    }
  }

  const abacusKey = process.env.ABACUSAI_API_KEY;
  if (abacusKey) {
    return await executeAbacusAI(options, abacusKey);
  }

  throw new Error('No LLM API configuration found. Configure GEMINI_API_KEY or ABACUSAI_API_KEY in your environment.');
}
