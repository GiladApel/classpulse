import { createHash } from 'node:crypto';

export type TextKind = 'code' | 'prose';

/** Keywords of the languages students submit; kept as-is so structure survives identifier normalisation. */
const KEYWORDS = new Set(
  (
    'abstract and as assert async await boolean break case catch char class const continue def default del do double elif else enum except export extends ' +
    'false final finally float for from func function global if implements import in instanceof int interface is lambda let long new nil none not null ' +
    'or package pass private protected public raise return self short static struct super switch this throw throws true try type typeof var void while with yield'
  ).split(' '),
);

/** Shingle length in tokens (code) or words (prose); long enough that common idioms alone don't match. */
const K = { code: 6, prose: 5 } as const;
/** MinHash bottom-k sketch size: bounds storage while estimating Jaccard within a few points. */
const SKETCH = 256;

/**
 * Copy detection by fingerprints, not embeddings. Field test T9 (docs/01-tools-report.md): embeddings scored
 * a renamed copy 0.93 and two independent correct solutions 0.94; normalised code shingles scored the copy 1.00 and
 * every honest pair ≤ 0.33. Code is normalised so renaming identifiers does not hide a copy.
 */
export class Fingerprinter {
  static tokens(text: string, kind: TextKind): string[] {
    if (kind === 'prose') return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
    const raw = text
      .replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|#[^\n]*/g, ' ') // comments
      .match(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[A-Za-z_]\w*|\d+(?:\.\d+)?|[^\s\w]/g);
    return (raw ?? []).map((t) => (/^["']/.test(t) ? 'S' : /^\d/.test(t) ? 'N' : /^[A-Za-z_]/.test(t) ? (KEYWORDS.has(t.toLowerCase()) ? t.toLowerCase() : 'I') : t));
  }

  /** Sorted bottom-k of 32-bit shingle hashes. */
  static sketch(text: string, kind: TextKind): number[] {
    const t = Fingerprinter.tokens(text, kind);
    const k = K[kind];
    const hashes = new Set<number>();
    for (let i = 0; i + k <= t.length; i++) hashes.add(createHash('sha1').update(t.slice(i, i + k).join('\u0001')).digest().readUInt32BE(0));
    return [...hashes].sort((a, b) => a - b).slice(0, SKETCH);
  }

  /** Bottom-k Jaccard estimate: among the k smallest hashes of the union, the share present in both. */
  static similarity(a: number[], b: number[]): number {
    if (a.length === 0 || b.length === 0) return 0;
    const setA = new Set(a);
    const setB = new Set(b);
    const union = [...new Set([...a, ...b])].sort((x, y) => x - y).slice(0, SKETCH);
    return union.filter((h) => setA.has(h) && setB.has(h)).length / union.length;
  }
}
