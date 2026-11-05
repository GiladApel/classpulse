import type { Box, Point, Verdict } from './types.js';

/** Pure geometry: matches each student's tap to a detected person box. */
export class SeatHitTester {
  constructor(private readonly padding = 0.03) {}

  classify(taps: Map<string, Point>, boxes: Box[]): Map<string, Verdict> {
    const boxOf = new Map<string, number>();
    const tapsPerBox = new Map<number, number>();

    for (const [student, tap] of taps) {
      const hit = this.nearestContaining(tap, boxes);
      if (hit === -1) continue;
      boxOf.set(student, hit);
      tapsPerBox.set(hit, (tapsPerBox.get(hit) ?? 0) + 1);
    }

    const verdicts = new Map<string, Verdict>();
    for (const student of taps.keys()) {
      const box = boxOf.get(student);
      verdicts.set(student, box === undefined ? 'empty_seat' : tapsPerBox.get(box)! > 1 ? 'collision' : 'ok');
    }
    return verdicts;
  }

  private nearestContaining(p: Point, boxes: Box[]): number {
    let best = -1;
    let bestDist = Infinity;
    boxes.forEach((b, i) => {
      const inside =
        p.x >= b.x - this.padding && p.x <= b.x + b.w + this.padding && p.y >= b.y - this.padding && p.y <= b.y + b.h + this.padding;
      if (!inside) return;
      const d = (p.x - (b.x + b.w / 2)) ** 2 + (p.y - (b.y + b.h / 2)) ** 2;
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    return best;
  }
}
