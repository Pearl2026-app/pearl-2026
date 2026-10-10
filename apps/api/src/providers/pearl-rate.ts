import type { PearlRateFeed, PearlRateFeedRow } from './types';

export class NoPearlRateFeed implements PearlRateFeed {
  readonly name = 'none';
  readonly configured = false;
  async fetch(): Promise<PearlRateFeedRow[]> {
    return [];
  }
}

/** Generic JSON feed: GET returns [{grade, farmSlug, sizeMinMm, sizeMaxMm, ratePerCaratPaise}]. */
export class HttpPearlRateFeed implements PearlRateFeed {
  readonly name = 'http';
  readonly configured = true;
  constructor(
    private readonly url: string,
    private readonly apiKey?: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}
  async fetch(): Promise<PearlRateFeedRow[]> {
    const res = await this.fetchFn(this.url, { headers: this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {} });
    if (!res.ok) throw new Error(`Pearl rate feed HTTP ${res.status}`);
    const rows = (await res.json()) as PearlRateFeedRow[];
    if (!Array.isArray(rows)) throw new Error('Pearl rate feed returned an unexpected shape');
    return rows.filter(
      (r) => typeof r.grade === 'string' && Number.isInteger(r.ratePerCaratPaise) && r.ratePerCaratPaise > 0 && r.sizeMaxMm >= r.sizeMinMm,
    );
  }
}
