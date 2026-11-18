/** Local search helpers. Works for Latin and Ge'ez text; no network. */
export function normalize(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/\p{M}+/gu, '').replace(/\s+/g, ' ').trim();
}

/** Every word of the query must start a word, or appear inside the text. Lower score = better. */
export function matchScore(query: string, text: string): number | null {
  const q = normalize(query);
  if (!q) return 0;
  const t = normalize(text);
  const words = q.split(' ');
  let score = 0;
  for (const w of words) {
    const idx = t.indexOf(w);
    if (idx < 0) return null;
    const atWordStart = idx === 0 || t[idx - 1] === ' ';
    score += (atWordStart ? 0 : 5) + idx / 100;
  }
  return score;
}

export function filterBy<T>(items: readonly T[], query: string, textOf: (item: T) => string, limit = 100): T[] {
  if (!normalize(query)) return items.slice(0, limit);
  return items
    .map((item) => ({ item, score: matchScore(query, textOf(item)) }))
    .filter((x): x is { item: T; score: number } => x.score !== null)
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map((x) => x.item);
}
