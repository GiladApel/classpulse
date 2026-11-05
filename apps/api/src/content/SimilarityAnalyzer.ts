import { Fingerprinter } from './Fingerprinter.js';
import type { SimilarPair } from './types.js';

export class SimilarityAnalyzer {
  /** Each unordered pair at most once, most similar first. O(n²) is fine for a class (n ≈ 100 → ~5k pairs). */
  static pairsAbove(sketches: Map<string, number[]>, threshold: number): SimilarPair[] {
    const entries = [...sketches.entries()];
    const pairs: SimilarPair[] = [];
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const similarity = Fingerprinter.similarity(entries[i][1], entries[j][1]);
        if (similarity >= threshold) pairs.push({ a: entries[i][0], b: entries[j][0], similarity: Math.round(similarity * 1000) / 1000 });
      }
    }
    return pairs.sort((x, y) => y.similarity - x.similarity);
  }
}
