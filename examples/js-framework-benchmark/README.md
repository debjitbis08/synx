# Synx + JS Framework Benchmark (local)

This folder contains a local implementation of the benchmark UI contract used by [`krausest/js-framework-benchmark`](https://github.com/krausest/js-framework-benchmark).

## Run locally

```bash
pnpm examples:js-framework-benchmark
```

This lets you quickly validate behavior for:

- `#run`
- `#runlots`
- `#add`
- `#update`
- `#clear`
- `#swaprows`
- row selection (`a.lbl`)
- row removal (`a.remove`)

## Run against official benchmark harness (without upstreaming)

1. Clone the benchmark repo next to this repository:
   `git clone https://github.com/krausest/js-framework-benchmark.git`
2. In that clone, add a framework directory, for example:
   `frameworks/keyed/synx`
3. Copy this implementation into that directory (at minimum: `index.html`, `main.ts`, and package/build config expected by the benchmark repo).
4. In the benchmark repo root, run:
   `npm install`
5. Start benchmark app server:
   `cd frameworks/keyed/synx && npm run start`
6. In another terminal, run benchmark checks from `webdriver-ts`:
   - `cd webdriver-ts`
   - `npm run bench keyed/synx -- --headless`
   - `npm run isKeyed keyed/synx -- --headless`

## Notes

- Keep the benchmark DOM contract unchanged when moving into `js-framework-benchmark` (button IDs, row classes, and table structure).
- This local folder is intentionally isolated so Synx can iterate before any upstream PR.
