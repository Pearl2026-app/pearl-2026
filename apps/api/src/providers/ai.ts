import type { AiRanker, RankCandidate, RankedResult } from './types';

/** Fallback: keeps the filtered order and gives a plain reason built from the facts. */
export class NoopRanker implements AiRanker {
  readonly name = 'none';
  readonly enabled = false;
  async rank(answers: Record<string, unknown>, candidates: RankCandidate[]): Promise<RankedResult[]> {
    return candidates.map((c) => ({ id: c.id, reason: plainReason(answers, c) }));
  }
}

export function plainReason(answers: Record<string, unknown>, c: RankCandidate): string {
  const bits: string[] = [];
  if (c.colour && answers.colour && String(answers.colour).toLowerCase() === c.colour.toLowerCase()) bits.push(`${c.colour.toLowerCase()} pearl as you asked`);
  else if (c.colour) bits.push(`${c.colour.toLowerCase()} pearl`);
  if (c.shape) bits.push(`${c.shape.toLowerCase()} shape`);
  if (c.metal) bits.push(`set in ${c.metal}`);
  if (c.farm) bits.push(`from ${c.farm}`);
  const s = bits.join(', ');
  return s ? s.charAt(0).toUpperCase() + s.slice(1) + '.' : 'Matches your choices.';
}

/**
 * Any OpenAI-compatible chat completions endpoint (most LLM providers offer one).
 * Only product facts and the visitor's ring-finder answers are sent — never customer data (rule 9).
 */
export class HttpLlmRanker implements AiRanker {
  readonly name = 'openai-compatible';
  readonly enabled = true;
  constructor(
    private readonly url: string,
    private readonly apiKey: string,
    private readonly model: string,
    private readonly timeoutMs: number,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async rank(answers: Record<string, unknown>, candidates: RankCandidate[]): Promise<RankedResult[]> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await this.fetchFn(this.url, {
        method: 'POST',
        signal: ctrl.signal,
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content:
                'You help a pearl jewellery shop recommend rings. Rank ONLY the given candidate ids, best first, and give one short, factual reason (max 20 words) for each. Never invent products or facts. Reply as JSON: {"results":[{"id":"...","reason":"..."}]}',
            },
            { role: 'user', content: JSON.stringify({ answers, candidates }) },
          ],
        }),
      });
      if (!res.ok) throw new Error(`AI HTTP ${res.status}`);
      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? '{}') as { results?: RankedResult[] };
      const ids = new Set(candidates.map((c) => c.id));
      const seen = new Set<string>();
      const results = (parsed.results ?? []).filter((r) => ids.has(r.id) && !seen.has(r.id) && seen.add(r.id));
      // Anything the model dropped is appended in filter order, so no real product is lost.
      for (const c of candidates) if (!seen.has(c.id)) results.push({ id: c.id, reason: plainReason(answers, c) });
      return results.map((r) => ({ id: r.id, reason: String(r.reason).slice(0, 160) }));
    } finally {
      clearTimeout(t);
    }
  }
}
