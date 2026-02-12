import { bench, describe } from 'vitest';
import { leakProbes } from './memory.probes';

describe('FRP memory / leak checks', () => {
  leakProbes.forEach((probe) => {
    bench(probe.name, async () => {
      const result = await probe.run();
      return result.score;
    });
  });
});
