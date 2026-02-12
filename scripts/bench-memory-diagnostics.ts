import { leakProbes } from '../packages/frp/bench/memory.probes';

const formatBytes = (value: number) => `${Math.round(value).toLocaleString()} B`;

async function run() {
  const rows: Array<Record<string, string | number>> = [];
  let hasLeakFlag = false;

  for (const probe of leakProbes) {
    const result = await probe.run();
    hasLeakFlag = hasLeakFlag || result.leakFlag;

    rows.push({
      probe: probe.name,
      elapsed_ms: result.elapsedMs,
      heap_drift: formatBytes(result.heapDriftBytes),
      drift_limit: formatBytes(result.heapDriftLimitBytes),
      heap_ok: result.heapExceeded ? 'no' : 'yes',
      outstanding_events: result.outstandingEvents,
      outstanding_reactives: result.outstandingReactives,
      outstanding_ok: result.outstandingExceeded ? 'no' : 'yes',
      leak_flag: result.leakFlag ? 'yes' : 'no',
    });
  }

  console.log('\nFRP memory diagnostics\n');
  console.table(rows);

  if (hasLeakFlag) {
    console.error('Leak diagnostics flagged one or more probes.');
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
