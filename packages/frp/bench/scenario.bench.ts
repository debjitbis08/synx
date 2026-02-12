import { bench, describe } from 'vitest';
import * as E from '../src/event';
import * as R from '../src/reactive';
import type { Event } from '../src/event';
import type { Reactive } from '../src/reactive';

const BURST_SIZE = 10_000;
const MIXED_GRAPH_STEPS = 5_000;
const MIXED_MAP_DEPTH = 32;
const TODO_ACTIONS_COUNT = 2_000;
const SIGNATURE_MOD = 1_000_000_007;

const flushMicrotasks = () =>
  new Promise<void>((resolve) => {
    Promise.resolve().then(() => resolve());
  });

const runDerivedMapChain = (value: number) => {
  let current = value;
  for (let i = 0; i < MIXED_MAP_DEPTH; i++) {
    current = (current * 3 + 7) % 1_000_003;
  }
  return current;
};

interface MixedStats {
  sum: number;
  count: number;
  last: number;
}

interface TaggedValue {
  source: 'a' | 'b' | 'c';
  value: number;
}

interface Todo {
  id: number;
  done: boolean;
}

type TodoAction =
  | { type: 'add'; id: number }
  | { type: 'toggle'; id: number }
  | { type: 'remove'; id: number };

const reduceTodo = (todos: ReadonlyArray<Todo>, action: TodoAction): Todo[] => {
  if (action.type === 'add') {
    return [...todos, { id: action.id, done: false }];
  }

  if (action.type === 'toggle') {
    let changed = false;
    const next = todos.map((todo) => {
      if (todo.id !== action.id) return todo;
      changed = true;
      return { ...todo, done: !todo.done };
    });
    return changed ? next : [...todos];
  }

  let removed = false;
  const filtered = todos.filter((todo) => {
    if (todo.id === action.id) {
      removed = true;
      return false;
    }
    return true;
  });
  return removed ? filtered : [...todos];
};

const todoSignature = (todos: ReadonlyArray<Todo>) => {
  let signature = 0;
  for (let i = 0; i < todos.length; i++) {
    const todo = todos[i];
    const encoded = todo.id * 3 + (todo.done ? 1 : 0);
    signature = (signature * 33 + encoded) % SIGNATURE_MOD;
  }
  return signature;
};

const createTodoActions = (count: number): TodoAction[] => {
  const actions: TodoAction[] = [];
  const live: number[] = [];
  let nextId = 1;

  for (let i = 0; i < count; i++) {
    const phase = i % 4;

    if (phase === 0) {
      const id = nextId++;
      live.push(id);
      actions.push({ type: 'add', id });
      continue;
    }

    if (phase === 1) {
      if (live.length > 0) {
        const id = live[i % live.length];
        actions.push({ type: 'toggle', id });
      } else {
        const id = nextId++;
        live.push(id);
        actions.push({ type: 'add', id });
      }
      continue;
    }

    if (phase === 2) {
      const id = nextId++;
      live.push(id);
      actions.push({ type: 'add', id });
      continue;
    }

    if (live.length > 0) {
      const index = Math.floor(live.length / 2);
      const [id] = live.splice(index, 1);
      actions.push({ type: 'remove', id });
    } else {
      const id = nextId++;
      live.push(id);
      actions.push({ type: 'add', id });
    }
  }

  return actions;
};

const TODO_ACTIONS = createTodoActions(TODO_ACTIONS_COUNT);

describe('FRP scenarios / burst', () => {
  bench('emit 10k events in one tick (FRP)', async () => {
    const [event, emit] = E.create<number>();
    const counter = E.fold(event, 0, (acc) => acc + 1);

    for (let i = 0; i < BURST_SIZE; i++) {
      emit(i);
    }
    await flushMicrotasks();

    const total = R.get(counter);
    if (total !== BURST_SIZE) {
      throw new Error(`Expected ${BURST_SIZE}, got ${total}`);
    }

    R.cleanup(counter);
    E.cleanup(event);
    return total;
  });

  bench('emit 10k values in one tick (plain)', () => {
    let total = 0;
    for (let i = 0; i < BURST_SIZE; i++) {
      total += 1;
    }
    if (total !== BURST_SIZE) {
      throw new Error(`Expected ${BURST_SIZE}, got ${total}`);
    }
    return total;
  });
});

describe('FRP scenarios / mixed graph', () => {
  bench('merge + filter + fold + map chain (FRP)', async () => {
    const [a, emitA] = E.create<number>();
    const [b, emitB] = E.create<number>();
    const [c, emitC] = E.create<number>();

    const events: Event<unknown>[] = [a, b, c];
    const aTagged = E.map(a, (value) => ({ source: 'a' as const, value }));
    const bTagged = E.map(b, (value) => ({ source: 'b' as const, value }));
    const cTagged = E.map(c, (value) => ({ source: 'c' as const, value }));
    events.push(aTagged, bTagged, cTagged);

    const merged = E.mergeAll<TaggedValue>([aTagged, bTagged, cTagged]);
    const filtered = E.filter(
      merged,
      (item) => (item.value & 1) === 0 || item.source === 'c',
    );
    events.push(merged, filtered);

    const folded = E.fold<TaggedValue, MixedStats>(
      filtered,
      { sum: 0, count: 0, last: 0 },
      (acc, item) => ({
        sum: acc.sum + item.value,
        count: acc.count + 1,
        last: item.value,
      }),
    );

    const nodes: Reactive<number>[] = [];
    let derived = R.map(folded, (stats) => stats.sum - stats.count + stats.last);
    nodes.push(derived);
    for (let i = 0; i < MIXED_MAP_DEPTH; i++) {
      derived = R.map(derived, (value) => (value * 3 + 7) % 1_000_003);
      nodes.push(derived);
    }

    let expectedStats: MixedStats = { sum: 0, count: 0, last: 0 };
    for (let i = 0; i < MIXED_GRAPH_STEPS; i++) {
      if (i % 3 === 0) {
        emitA(i);
      } else if (i % 3 === 1) {
        emitB(i * 2);
      } else {
        emitC(i * 3);
      }

      const source = i % 3 === 0 ? 'a' : i % 3 === 1 ? 'b' : 'c';
      const value = source === 'a' ? i : source === 'b' ? i * 2 : i * 3;
      if ((value & 1) === 0 || source === 'c') {
        expectedStats = {
          sum: expectedStats.sum + value,
          count: expectedStats.count + 1,
          last: value,
        };
      }
    }

    await flushMicrotasks();

    const expected = runDerivedMapChain(
      expectedStats.sum - expectedStats.count + expectedStats.last,
    );
    const actual = R.get(derived);
    if (actual !== expected) {
      throw new Error(`Expected ${expected}, got ${actual}`);
    }

    for (const node of nodes) {
      R.cleanup(node);
    }
    R.cleanup(folded);
    for (const event of events) {
      E.cleanup(event as Event<unknown>);
    }

    return actual;
  });

  bench('merge + filter + fold + map chain (plain)', () => {
    let stats: MixedStats = { sum: 0, count: 0, last: 0 };

    for (let i = 0; i < MIXED_GRAPH_STEPS; i++) {
      const source = i % 3 === 0 ? 'a' : i % 3 === 1 ? 'b' : 'c';
      const value = source === 'a' ? i : source === 'b' ? i * 2 : i * 3;
      if ((value & 1) === 0 || source === 'c') {
        stats = {
          sum: stats.sum + value,
          count: stats.count + 1,
          last: value,
        };
      }
    }

    return runDerivedMapChain(stats.sum - stats.count + stats.last);
  });
});

describe('FRP scenarios / todo workload', () => {
  bench('add/remove/toggle workload over time (FRP)', async () => {
    const [actionEvent, emitAction] = E.create<TodoAction>();
    const todos = E.fold(actionEvent, [] as Todo[], (state, action) =>
      reduceTodo(state, action),
    );

    const activeCount = R.map(
      todos,
      (list) => list.length - list.filter((todo) => todo.done).length,
    );
    const signature = R.map(todos, (list) => todoSignature(list));
    const combined = R.ap(
      activeCount,
      R.map(signature, (sig) => (active: number) => (sig + active * 17) % SIGNATURE_MOD),
    );

    let expectedTodos: Todo[] = [];
    for (let i = 0; i < TODO_ACTIONS.length; i++) {
      const action = TODO_ACTIONS[i];
      emitAction(action);
      expectedTodos = reduceTodo(expectedTodos, action);
    }

    await flushMicrotasks();

    const expectedActive = expectedTodos.length - expectedTodos.filter((todo) => todo.done).length;
    const expectedSignature = todoSignature(expectedTodos);
    const expected = (expectedSignature + expectedActive * 17) % SIGNATURE_MOD;
    const actual = R.get(combined);
    if (actual !== expected) {
      throw new Error(`Expected ${expected}, got ${actual}`);
    }

    R.cleanup(combined);
    R.cleanup(signature);
    R.cleanup(activeCount);
    R.cleanup(todos);
    E.cleanup(actionEvent);
    return actual;
  });

  bench('add/remove/toggle workload over time (plain)', () => {
    let todos: Todo[] = [];
    for (let i = 0; i < TODO_ACTIONS.length; i++) {
      todos = reduceTodo(todos, TODO_ACTIONS[i]);
    }

    const active = todos.length - todos.filter((todo) => todo.done).length;
    const signature = todoSignature(todos);
    return (signature + active * 17) % SIGNATURE_MOD;
  });
});
