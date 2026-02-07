/**
 * Example: Using fix() to handle circular dependency in TodoApp
 *
 * This demonstrates how to break the circular dependency where:
 * - Input element needs a reactive value for its 'value' prop
 * - The reactive value is created from events on that same input
 */

import { fix } from './fix';
import * as E from './event';

// Simulated usage (won't actually run, just for illustration)
export function todoAppExample() {
  // Before fix(): Circular dependency problem
  // ❌ const newTodoInput = input({ value: inputValue });  // inputValue doesn't exist yet
  // ❌ const keydown = on(newTodoInput, "keydown");
  // ❌ const inputValue = E.stepper(clearEvent, "");  // clearEvent depends on keydown

  // After fix(): Using the fixpoint combinator
  // ✅ Break the cycle by creating the reactive loop point first
  const [clearEvent, emitClear] = E.create<void>();

  const inputValue = fix("", (_reactive) => {
    // _reactive is the forward reference to inputValue
    // We don't need to use it directly - just return the event that updates it
    return E.map(clearEvent, () => "");
  });

  // Now we can use inputValue to create the input
  // const newTodoInput = input({ value: inputValue });
  // const keydown = on(newTodoInput, "keydown");
  // Wire up validation and call emitClear() when todo is added

  return { inputValue, emitClear };
}
