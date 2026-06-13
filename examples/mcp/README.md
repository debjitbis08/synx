# MCP demo: sign-up form

A worked example of driving a Synx component through the `@synx/mcp` server — the
flow an AI agent (e.g. Claude Code) uses to test a component interactively.

The component, [`signup-form.debug.ts`](./signup-form.debug.ts), is a sign-up
form whose graph **branches and re-joins**: two inputs validate independently,
then combine into a single form-validity node.

```
emailInput ──▶ email ──▶ emailValid ──┐
                                       ├─▶ formValid ──▶ status
passwordInput ▶ password ▶ passwordValid ┘
```

Every node is labeled (`label` / `labelSource`) and the form is instantiated at
the top level, so loading the module populates the debug registry.

## Running the server

`.mcp.json` in this folder registers the server with an MCP client:

```jsonc
{
  "mcpServers": {
    "synx": { "command": "npx", "args": ["synx-mcp", "--project", "."] }
  }
}
```

The server uses the project's TypeScript runtime to execute the component file,
so `@synx/*` must resolve consistently for both the server and the loaded
component. In a normal installed project that is automatic (everything resolves
through `node_modules`). **Inside this monorepo**, build the packages first so
they resolve to `dist`:

```sh
pnpm build
```

## Walkthrough

Each step is a tool call (`tool { arguments }`) followed by its result.

### 1. Load the component

```
synx_load { "file": "examples/mcp/signup-form.debug.ts" }
```
```
Loaded examples/mcp/signup-form.debug.ts

Nodes (8):
  emailInput     [source]
  passwordInput  [source]
  email          [stepper]  <- emailInput
  password       [stepper]  <- passwordInput
  emailValid     [map]  <- email
  passwordValid  [map]  <- password
  formValid      [ap]  <- passwordValid, emailValid
  status         [map]  <- formValid

Edges: emailInput->email, passwordInput->password, email->emailValid,
       password->passwordValid, passwordValid->formValid,
       emailValid->formValid, formValid->status
```

### 2. Enter a valid email — the form is still incomplete

```
synx_inject { "node": "emailInput", "value": "a@b.com" }
```
```
inject: emailInput = "a@b.com"
  emailInput  emitted   "a@b.com"
    email       updated   "" -> "a@b.com"  [stepper]
      emailValid  updated   false -> true  [map]
        formValid   updated   false -> false  [ap]
          status      updated   "fill in the form" -> "fill in the form"  [map]
```

The trace is indented by propagation depth and tagged with each node's operator.
`formValid` stays `false` because the password is still empty:

```
synx_assert { "node": "formValid", "expected": false }
```
```
PASS  formValid
```

### 3. Enter a valid password — the form becomes valid

```
synx_inject { "node": "passwordInput", "value": "secret12" }
```
```
inject: passwordInput = "secret12"
  passwordInput  emitted   "secret12"
    password       updated   "" -> "secret12"  [stepper]
      passwordValid  updated   false -> true  [map]
        formValid      updated   false -> true  [ap]
          status         updated   "fill in the form" -> "ready to submit"  [map]
```
```
synx_assert { "node": "status", "expected": "ready to submit" }
```
```
PASS  status
```

### 4. Inspect history and reset

```
synx_history { "node": "formValid" }   ->  { "history": [false, true], "count": 2 }
synx_trace   {}                        ->  the full trace for both injections
synx_reset   {}                        ->  "Session reset"  (clears the trace, keeps the graph)
```

## Worked example: finding a bug

This is how an agent (e.g. Claude Code) uses the tools to *localize* a fault —
without reading the source first. Suppose a teammate reports:

> "The submit button enables even when the user has only filled in the email."

Imagine the component shipped with a typo in the join — `e || p` instead of
`e && p`:

```ts
const formValid = R.ap(passwordValid, R.map(emailValid, (e) => (p) => e || p));
```

### 1. Orient

`synx_load` returns the graph above. The reported symptom ("valid with only the
email") points at the join — `formValid [ap] <- passwordValid, emailValid` — so
that node is the prime suspect before any code is read.

### 2. Reproduce — inject one input and watch it propagate

```
synx_inject { "node": "emailInput", "value": "a@b.com" }
```
```
inject: emailInput = "a@b.com"
  emailInput  emitted   "a@b.com"
    email       updated   "" -> "a@b.com"  [stepper]
      emailValid  updated   false -> true  [map]
        formValid   updated   false -> true  [ap]      <- BUG: should still be false
          status      updated   "fill in the form" -> "ready to submit"  [map]
```

The depth-indented trace shows the causal chain: one email keystroke flowed all
the way to `formValid` flipping `true` while `passwordValid` is still `false`. An
`[ap]` joining two booleans that goes true when only one input is true is an
**OR where it should be AND**. The operator tag (`[ap]`) names the suspect
function directly.

```
synx_assert { "node": "formValid", "expected": false }   ->  FAIL  formValid
```

### 3. Fix and verify

Change `e || p` to `e && p`, then re-run the same probes:

```
synx_inject { "node": "emailInput", "value": "a@b.com" }
        formValid   updated   false -> false  [ap]      <- stays false now

synx_assert { "node": "formValid", "expected": false }     ->  PASS  formValid

synx_inject { "node": "passwordInput", "value": "secret12" }
        formValid      updated   false -> true  [ap]       <- true once both are valid

synx_assert { "node": "status", "expected": "ready to submit" }   ->  PASS  status
synx_history { "node": "formValid" }   ->  { "history": [false, true], "count": 2 }
```

The same `synx_assert` calls map one-to-one onto `@synx/debug/vitest` matchers,
so they drop straight into a `*.test.ts` to lock the fix in:

```ts
import "@synx/debug/vitest";
expect(session).toHaveLastEmitted("status", "ready to submit");
```

## Tools

| Tool | Arguments | Result |
|------|-----------|--------|
| `synx_load` | `{ file }` | Execute the component; return the graph |
| `synx_graph` | `{}` | Current graph as text |
| `synx_inject` | `{ node, value }` | Inject into a source node; return the trace |
| `synx_assert` | `{ node, expected }` | `PASS`/`FAIL` with emission history |
| `synx_history` | `{ node }` | `{ history, count }` |
| `synx_trace` | `{}` | Full accumulated trace |
| `synx_reset` | `{}` | Clear the trace (keeps the graph) |
