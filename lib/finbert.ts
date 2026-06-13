// FinBERT Financial Sentiment Analysis
// Uses Hugging Face free Inference API for ProsusAI/finbert model
// Falls back to Abacus LLM API with financial sentiment prompt if HF is unavailable

export interface SentimentResult {
  text: string;
  label: 'positive' | 'negative' | 'neutral';
  score: number;
  scores: { positive: number; negative: number; neutral: number };
}

const HF_API_URL = 'https://api-inference.huggingface.co/models/ProsusAI/finbert';

// Analyze sentiment using FinBERT via Hugging Face free inference
export async function analyzeFinBERTSentiment(texts: string[]): Promise<SentimentResult[]> {
  if (!texts?.length) return [];
  
  try {
    // Try Hugging Face free inference API first
    const results = await callHuggingFace(texts);
    if (results?.length) return results;
  } catch {
    // Fall through to LLM fallback
  }

  // Fallback: Use Abacus LLM with FinBERT-style financial sentiment prompt
  try {
    return await llmFinancialSentiment(texts);
  } catch {
    return texts.map(t => ({
      text: t,
      label: 'neutral' as const,
      score: 0.5,
      scores: { positive: 0.33, negative: 0.33, neutral: 0.34 },
    }));
  }
}

async function callHuggingFace(texts: string[]): Promise<SentimentResult[]> {
  const response = await fetch(HF_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inputs: texts, parameters: { top_k: 3 } }),
    signal: AbortSignal.timeout(3000), // 3-second timeout
  });

  if (!response?.ok) {
    throw new Error(`HF API error: ${response?.status}`);
  }

  const data = await response.json();
  
  // HF returns array of arrays: [[{label, score}, ...], ...]
  if (!Array.isArray(data)) throw new Error('Invalid HF response');

  return data.map((sentiments: any[], idx: number) => {
    if (!Array.isArray(sentiments)) {
      return { text: texts[idx] ?? '', label: 'neutral' as const, score: 0.5, scores: { positive: 0.33, negative: 0.33, neutral: 0.34 } };
    }
    const scores = { positive: 0, negative: 0, neutral: 0 };
    let topLabel: 'positive' | 'negative' | 'neutral' = 'neutral';
    let topScore = 0;

    for (const s of sentiments) {
      const label = (s?.label ?? '').toLowerCase() as 'positive' | 'negative' | 'neutral';
      const score = s?.score ?? 0;
      if (label in scores) scores[label] = score;
      if (score > topScore) { topLabel = label; topScore = score; }
    }

    return { text: texts[idx] ?? '', label: topLabel, score: topScore, scores };
  });
}

async function llmFinancialSentiment(texts: string[]): Promise<SentimentResult[]> {
  const { getLLMCompletion } = await import('./llm');
  const content = await getLLMCompletion({
    messages: [
      {
        role: 'system',
        content: `You are FinBERT, a financial sentiment analysis model. For each headline, classify sentiment as positive, negative, or neutral with confidence scores (0-1). Return JSON array only:\n[{"label": "positive", "score": 0.92, "scores": {"positive": 0.92, "negative": 0.03, "neutral": 0.05}}]\nFinancial context matters: "revenue fell 5%" = negative, "beat estimates" = positive, "maintained guidance" = neutral.\nReturn raw JSON array, no markdown.`,
      },
      { role: 'user', content: texts.map((t, i) => `${i + 1}. ${t}`).join('\n') },
    ],
    maxTokens: 800,
    jsonMode: true,
  });
  let parsed: any;
  try { parsed = JSON.parse(content); } catch { throw new Error('Parse error'); }
  
  const items = Array.isArray(parsed) ? parsed : parsed?.results ?? parsed?.sentiments ?? [];
  
  return texts.map((text, i) => {
    const item = items[i] ?? {};
    return {
      text,
      label: (['positive', 'negative', 'neutral'].includes(item?.label) ? item.label : 'neutral') as 'positive' | 'negative' | 'neutral',
      score: item?.score ?? 0.5,
      scores: {
        positive: item?.scores?.positive ?? 0.33,
        negative: item?.scores?.negative ?? 0.33,
        neutral: item?.scores?.neutral ?? 0.34,
      },
    };
  });
}

// Aggregate sentiment scores for trading decision
export function aggregateSentiment(results: SentimentResult[]): {
  overallSentiment: 'bullish' | 'bearish' | 'neutral';
  bullishScore: number;
  bearishScore: number;
  confidence: number;
  summary: string;
} {
  if (!results?.length) {
    return { overallSentiment: 'neutral', bullishScore: 0, bearishScore: 0, confidence: 0, summary: 'No data' };
  }

  let totalPositive = 0, totalNegative = 0, totalNeutral = 0;
  for (const r of results) {
    totalPositive += r.scores.positive;
    totalNegative += r.scores.negative;
    totalNeutral += r.scores.neutral;
  }

  const count = results.length;
  const avgPositive = totalPositive / count;
  const avgNegative = totalNegative / count;
  const avgNeutral = totalNeutral / count;

  const bullishScore = Math.round(avgPositive * 100);
  const bearishScore = Math.round(avgNegative * 100);

  let overallSentiment: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  if (avgPositive > avgNegative && avgPositive > avgNeutral) overallSentiment = 'bullish';
  else if (avgNegative > avgPositive && avgNegative > avgNeutral) overallSentiment = 'bearish';

  const confidence = Math.round(Math.max(avgPositive, avgNegative, avgNeutral) * 100);
  const posCount = results.filter(r => r.label === 'positive').length;
  const negCount = results.filter(r => r.label === 'negative').length;

  return {
    overallSentiment,
    bullishScore,
    bearishScore,
    confidence,
    summary: `FinBERT: ${posCount} bullish, ${negCount} bearish out of ${count} headlines (${confidence}% confidence)`,
  };
}
