import { describe, expect, it } from 'vitest';
import { Fingerprinter } from './Fingerprinter.js';

// From the M6 field test: two independent correct solutions, and one solution copied with every identifier renamed.
const A = `interface DiscountStrategy { double apply(double price); }
class NoDiscount implements DiscountStrategy { public double apply(double p) { return p; } }
class Percent implements DiscountStrategy { private final double pct; Percent(double pct) { this.pct = pct; } public double apply(double p) { return p * (1 - pct / 100); } }
class Fixed implements DiscountStrategy { private final double a; Fixed(double a) { this.a = a; } public double apply(double p) { return Math.max(0, p - a); } }
class Checkout { private DiscountStrategy s; Checkout(DiscountStrategy s) { this.s = s; } double total(double p) { return s.apply(p); } }`;
const B = `interface DiscountStrategy { double apply(double price); }
class Percent implements DiscountStrategy { double pct; Percent(double pct) { this.pct = pct; } public double apply(double p) { return p - p * pct / 100; } }
class Fixed implements DiscountStrategy { double amount; Fixed(double a) { amount = a; } public double apply(double p) { return p - amount; } }
class Checkout { DiscountStrategy strategy; double total(double price) { return strategy.apply(price); } }`;
const B_RENAMED = `interface DiscountStrategy { double apply(double price); }
// my own work
class Pct implements DiscountStrategy { double rate; Pct(double rate) { this.rate = rate; } public double apply(double v) { return v - v * rate / 100; } }
class Flat implements DiscountStrategy { double sum; Flat(double s) { sum = s; } public double apply(double v) { return v - sum; } }
class Cart { DiscountStrategy discount; double total(double value) { return discount.apply(value); } }`;

const sim = (x: string, y: string, kind: 'code' | 'prose' = 'code') => Fingerprinter.similarity(Fingerprinter.sketch(x, kind), Fingerprinter.sketch(y, kind));

describe('Fingerprinter', () => {
  it('a copy with renamed identifiers and an added comment is still identical', () => {
    expect(sim(B, B_RENAMED)).toBe(1);
  });

  it('two independent solutions to the same task stay well below the 0.5 threshold', () => {
    expect(sim(A, B)).toBeLessThan(0.4);
    expect(sim(A, B_RENAMED)).toBeLessThan(0.4);
  });

  it('normalises identifiers, numbers and strings but keeps keywords and punctuation', () => {
    expect(Fingerprinter.tokens('if (count > 10) return "x";', 'code')).toEqual(['if', '(', 'I', '>', 'N', ')', 'return', 'S', ';']);
  });

  it('prose: copied paragraph detected, different text not; words are not normalised away', () => {
    const essay = 'The Strategy pattern lets the client choose an algorithm at runtime through a shared interface, which keeps the checkout open for extension and closed for modification.';
    const copied = `Introduction. ${essay} Conclusion.`;
    const other = 'State lets an object change its behaviour when its internal state changes; each state is its own class and the context delegates to the current one.';
    expect(sim(essay, copied, 'prose')).toBeGreaterThan(0.6);
    expect(sim(essay, other, 'prose')).toBeLessThan(0.1);
  });

  it('sketch is bounded and empty input never matches', () => {
    const long = Array.from({ length: 3000 }, (_, i) => `word${i}`).join(' ');
    expect(Fingerprinter.sketch(long, 'prose')).toHaveLength(256);
    expect(Fingerprinter.similarity([], [1, 2])).toBe(0);
  });
});
