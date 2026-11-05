export class PercentileCalculator {
  /** Mid-rank percentile (0–100): share of the population below the value, counting ties as half. */
  static percentile(value: number, population: number[]): number {
    if (population.length === 0) return 0;
    const below = population.filter((p) => p < value).length;
    const equal = population.filter((p) => p === value).length;
    return Math.round(((below + equal / 2) / population.length) * 100);
  }
}
