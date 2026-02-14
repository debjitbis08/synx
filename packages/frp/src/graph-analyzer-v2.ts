/**
 * Static Analysis Tool for FRP Graph Visualization (V2)
 *
 * Shows operators as boxes with inputs and outputs
 */

import ts from "typescript";

// ============================================================================
// Types
// ============================================================================

interface OperatorNode {
  id: string;
  operation: string;
  type: "event" | "reactive" | "unknown";
  variableName?: string; // The variable this is assigned to
  config?: string; // Operator configuration (function params, etc.)
  location: {
    file: string;
    line: number;
    column: number;
  };
  rawCode?: string;
}

interface DataEdge {
  from: string; // Variable name or operator ID
  to: string;   // Operator ID or DOM sink
  label?: string; // Optional label for the edge
}

interface DOMSink {
  id: string;
  type: "dom-element" | "dom-binding" | "storage" | "effect" | "output";
  target: string; // e.g., "span.theme-readout__value", "data-theme", "localStorage", "side-effect", "component-output"
  operation?: string; // e.g., "bind", "bindLocalStorage", "effect", "output"
}

interface EventSource {
  id: string;
  type: "dom-event" | "media-query";
  target: string; // e.g., "triggerRef.outputs.click", "windowRef.outputs.keydown"
  eventName?: string; // e.g., "click", "keydown"
}

interface PropInput {
  id: string;
  type: "prop" | "initial";
  target: string; // e.g., "value", "initial.value", "initial.labelClass"
  propName?: string; // e.g., "value" for Prop variables
}

interface OperatorGraph {
  operators: OperatorNode[];
  domSinks: DOMSink[];
  eventSources: EventSource[];
  propInputs: PropInput[];
  edges: DataEdge[];
  sourceFile: string;
}

// ============================================================================
// FRP Operation Patterns
// ============================================================================

const DOM_TAGS = new Set([
  "div", "span", "p", "button", "input", "label", "form",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li", "a", "img", "section", "article", "header", "footer",
  "nav", "main", "aside",
]);

const BINDING_OPERATIONS = new Set([
  "bind",
  "bindLocalStorage",
]);

const EVENT_OPERATIONS = new Set([
  "create",
  "of",
  "never",
  "map",
  "filter",
  "mergeAll",
  "mergeWith",
  "fold",
  "stepper",
  "zip",
  "switchE",
  "switchR",
  "snapshot",
  "sample",
  "tag",
  "debounce",
  "throttle",
  "when",
  "whenR",
  "apply",
  "effect",
]);

const REACTIVE_OPERATIONS = new Set([
  "of",
  "create",
  "map",
  "chain",
  "ap",
  "effect",
  "sample",
]);

// ============================================================================
// AST Analysis
// ============================================================================

function isFRPCall(node: ts.Node): node is ts.CallExpression {
  if (!ts.isCallExpression(node)) {
    return false;
  }

  const expr = node.expression;

  if (ts.isPropertyAccessExpression(expr)) {
    const obj = expr.expression;
    if (!expr.name) {
      return false;
    }
    const method = expr.name.text;

    // STRICT: Only match E.* or R.* namespace calls
    if (ts.isIdentifier(obj) && obj.text) {
      const objName = obj.text;
      if (objName === "E" && EVENT_OPERATIONS.has(method)) {
        return true;
      }
      if (objName === "R" && REACTIVE_OPERATIONS.has(method)) {
        return true;
      }
    }

    // Don't match arbitrary object.method() calls
    // This prevents Array.map(), Ref.outputs.click, etc. from being matched
  }

  // Helper functions - must be direct calls (not methods)
  if (ts.isIdentifier(node.expression) && node.expression.text) {
    const name = node.expression.text;
    if (
      name === "map2" ||
      name === "mapMerge" ||
      name === "mediaQueryMatches" ||
      name === "bindLocalStorage" ||
      name === "targetValue" ||
      name === "not"
    ) {
      return true;
    }
  }

  return false;
}

function getOperationName(node: ts.CallExpression): string {
  const expr = node.expression;

  if (ts.isPropertyAccessExpression(expr)) {
    return expr.name?.text || "unknown";
  }

  if (ts.isIdentifier(expr) && expr.text) {
    return expr.text;
  }

  return "unknown";
}

function getNodeType(operation: string, expr: ts.Expression): "event" | "reactive" | "unknown" {
  if (ts.isPropertyAccessExpression(expr)) {
    const obj = expr.expression;
    if (ts.isIdentifier(obj) && obj.text) {
      if (obj.text === "E") return "event";
      if (obj.text === "R") return "reactive";
    }
  }

  if (operation === "stepper" || operation === "fold") {
    return "reactive";
  }

  if (
    ["map", "filter", "mergeAll", "zip", "debounce", "throttle"].includes(
      operation,
    )
  ) {
    return "unknown";
  }

  return "unknown";
}

/**
 * Extract operator configuration for display
 * Returns a human-readable string showing the operator's parameters
 */
function extractOperatorConfig(callNode: ts.CallExpression, sourceFile: ts.SourceFile): string | undefined {
  const operation = getOperationName(callNode);
  const args = callNode.arguments;

  if (args.length === 0) {
    return undefined;
  }

  const configs: string[] = [];

  // Special handling for mapMerge: [[event, value], ...], defaultValue
  if (operation === "mapMerge" && args.length > 0) {
    const firstArg = args[0];
    if (ts.isArrayLiteralExpression(firstArg)) {
      const mappings: string[] = [];
      for (const element of firstArg.elements) {
        if (ts.isArrayLiteralExpression(element) && element.elements.length === 2) {
          const event = element.elements[0].getText(sourceFile);
          const value = element.elements[1].getText(sourceFile);
          mappings.push(`${event}=>${value}`);
        }
      }
      if (mappings.length > 0) {
        return `[${mappings.join(", ")}]`;
      }
    }
  }

  // Extract function parameters for common patterns
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    // Arrow function or function expression
    if (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)) {
      const params = arg.parameters.map(p => p.name.getText(sourceFile)).join(", ");

      // Get function body - simplified
      let body = "";
      if (ts.isBlock(arg.body)) {
        body = "{ ... }";
      } else {
        // Expression body
        const bodyText = arg.body.getText(sourceFile);
        if (bodyText.length > 40) {
          body = bodyText.substring(0, 37) + "...";
        } else {
          body = bodyText;
        }
      }

      configs.push(`${params} => ${body}`);
    }
    // Literal values (numbers, strings, booleans)
    else if (ts.isNumericLiteral(arg) || ts.isStringLiteral(arg) ||
             arg.kind === ts.SyntaxKind.TrueKeyword ||
             arg.kind === ts.SyntaxKind.FalseKeyword) {
      configs.push(arg.getText(sourceFile));
    }
    // Short identifiers or simple expressions
    else {
      const text = arg.getText(sourceFile);
      if (text.length <= 20 && !text.includes('\n')) {
        // Skip if it looks like a variable reference (first arg for map/filter)
        if (i === 0 && (operation === "map" || operation === "filter" || operation === "fold")) {
          continue; // This is the source, not config
        }
        configs.push(text);
      }
    }
  }

  return configs.length > 0 ? configs.join(", ") : undefined;
}

/**
 * Check if an expression is a DOM event source (ref.outputs.eventName)
 */
function isDOMEventSource(expr: ts.Expression): { refName: string; eventName: string } | null {
  // Match: ref.outputs.eventName
  if (ts.isPropertyAccessExpression(expr)) {
    const eventName = expr.name?.text;
    if (!eventName) return null;

    const outerExpr = expr.expression;
    if (ts.isPropertyAccessExpression(outerExpr)) {
      const middleName = outerExpr.name?.text;
      if (middleName !== "outputs") return null;

      const innerExpr = outerExpr.expression;
      if (ts.isIdentifier(innerExpr) && innerExpr.text) {
        return {
          refName: innerExpr.text,
          eventName: eventName,
        };
      }
    }
  }

  return null;
}

/**
 * Extract variable names referenced in the first argument level
 * (immediate inputs to the operator)
 */
function extractImmediateInputs(callNode: ts.CallExpression): string[] {
  const inputs: string[] = [];

  // Get the first argument if it's an identifier or simple expression
  if (callNode.arguments.length > 0) {
    const firstArg = callNode.arguments[0];

    // Direct identifier: E.map(source, ...)
    if (ts.isIdentifier(firstArg) && firstArg.text) {
      inputs.push(firstArg.text);
    }

    // Property access: E.map(foo.bar, ...)
    else if (ts.isPropertyAccessExpression(firstArg)) {
      const root = getRootIdentifier(firstArg);
      if (root) {
        inputs.push(root);
      }
    }

    // Array of inputs: E.mergeAll([a, b, c])
    else if (ts.isArrayLiteralExpression(firstArg)) {
      for (const element of firstArg.elements) {
        if (ts.isIdentifier(element) && element.text) {
          inputs.push(element.text);
        } else if (ts.isPropertyAccessExpression(element)) {
          const root = getRootIdentifier(element);
          if (root) {
            inputs.push(root);
          }
        } else if (ts.isCallExpression(element)) {
          // Nested call - extract its inputs
          const nestedInputs = extractImmediateInputs(element);
          inputs.push(...nestedInputs);
        }
      }
    }

    // Nested call: E.map(E.filter(...), ...)
    else if (ts.isCallExpression(firstArg)) {
      const nestedInputs = extractImmediateInputs(firstArg);
      inputs.push(...nestedInputs);
    }
  }

  // For some operations, check additional arguments
  // e.g., map2(reactive1, reactive2, fn)
  if (callNode.arguments.length > 1) {
    const operationName = getOperationName(callNode);

    if (operationName === "map2" || operationName === "fold" || operationName === "stepper") {
      for (let i = 1; i < callNode.arguments.length; i++) {
        const arg = callNode.arguments[i];

        // Skip function arguments
        if (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)) {
          continue;
        }

        if (ts.isIdentifier(arg) && arg.text) {
          inputs.push(arg.text);
        } else if (ts.isPropertyAccessExpression(arg)) {
          const root = getRootIdentifier(arg);
          if (root) {
            inputs.push(root);
          }
        }
      }
    }
  }

  return [...new Set(inputs)]; // Deduplicate
}

/**
 * Get the root identifier from a property access expression
 * e.g., foo.bar.baz -> "foo"
 */
function getRootIdentifier(node: ts.PropertyAccessExpression): string | null {
  let current: ts.Expression = node;

  while (ts.isPropertyAccessExpression(current)) {
    current = current.expression;
  }

  if (ts.isIdentifier(current) && current.text) {
    return current.text;
  }

  return null;
}

/**
 * Analyze a TypeScript source file
 */
export function analyzeSourceFile(sourceFile: ts.SourceFile): OperatorGraph {
  const operators: OperatorNode[] = [];
  const domSinks: DOMSink[] = [];
  const eventSources: EventSource[] = [];
  const propInputs: PropInput[] = [];
  const edges: DataEdge[] = [];
  let operatorIdCounter = 0;
  let sinkIdCounter = 0;
  let sourceIdCounter = 0;
  let propIdCounter = 0;

  // Track all FRP variables
  const frpVariables = new Set<string>();

  // Track function parameters (component props)
  const componentPropsParams = new Set<string>();

  // Track prop inputs by their path to avoid duplicates
  const propInputsByPath = new Map<string, string>();

  /**
   * Process nested FRP operators recursively
   * Returns the operator ID or variable name for the result
   */
  function processNestedOperator(expr: ts.Expression, parentOperatorId?: string): string | null {
    // Check for DOM event source
    const eventSource = isDOMEventSource(expr);
    if (eventSource) {
      const sourceId = `src_${++sourceIdCounter}`;
      const target = `${eventSource.refName}.outputs.${eventSource.eventName}`;

      eventSources.push({
        id: sourceId,
        type: "dom-event",
        target: target,
        eventName: eventSource.eventName,
      });

      return sourceId;
    }

    // Check if it's an FRP call
    if (ts.isCallExpression(expr) && isFRPCall(expr)) {
      const operation = getOperationName(expr);
      const type = getNodeType(operation, expr.expression);
      const config = extractOperatorConfig(expr, sourceFile);

      let line = 0, character = 0;
      try {
        const pos = sourceFile.getLineAndCharacterOfPosition(expr.getStart(sourceFile));
        line = pos.line;
        character = pos.character;
      } catch (e) {
        line = 0;
        character = 0;
      }

      const operatorId = `op_${++operatorIdCounter}`;

      const operatorNode: OperatorNode = {
        id: operatorId,
        operation,
        type,
        variableName: undefined, // Nested operators are anonymous
        config,
        location: {
          file: sourceFile.fileName,
          line: line + 1,
          column: character + 1,
        },
        rawCode: expr.getText(sourceFile).substring(0, 100), // Limit to 100 chars
      };

      operators.push(operatorNode);

      // Process arguments recursively
      if (expr.arguments.length > 0) {
        const firstArg = expr.arguments[0];

        // Handle array of expressions: E.mergeAll([...])
        if (ts.isArrayLiteralExpression(firstArg)) {
          for (const element of firstArg.elements) {
            const inputId = processNestedOperator(element, operatorId);
            if (inputId) {
              edges.push({
                from: inputId,
                to: operatorId,
              });
            }
          }
        }
        // Handle single nested expression
        else {
          const inputId = processNestedOperator(firstArg, operatorId);
          if (inputId) {
            edges.push({
              from: inputId,
              to: operatorId,
            });
          }
        }

        // Handle additional arguments (e.g., map2, fold)
        if (expr.arguments.length > 1) {
          for (let i = 1; i < expr.arguments.length; i++) {
            const arg = expr.arguments[i];

            // Skip function arguments
            if (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)) {
              continue;
            }

            const inputId = processNestedOperator(arg, operatorId);
            if (inputId) {
              edges.push({
                from: inputId,
                to: operatorId,
              });
            }
          }
        }
      }

      return operatorId;
    }

    // Handle non-FRP call expressions that might contain nested FRP operations or helper functions
    // e.g., optionButtonRefs.map((ref) => E.map(ref.outputs.click, ...))
    // or helper functions like not(isCanceling), targetValue(editInput_)
    if (ts.isCallExpression(expr)) {
      // Check if this is a helper function call (not, targetValue, etc.)
      const isHelperFunction = ts.isIdentifier(expr.expression) &&
                               expr.expression.text &&
                               (expr.expression.text === "not" ||
                                expr.expression.text === "targetValue");

      if (isHelperFunction) {
        // For helper functions, extract variables from their arguments
        // e.g., not(isCanceling) -> extract isCanceling
        if (expr.arguments.length > 0) {
          const firstArg = expr.arguments[0];
          return processNestedOperator(firstArg, parentOperatorId);
        }
      }

      // Traverse into call arguments looking for FRP operations or event sources
      for (const arg of expr.arguments) {
        // Check arrow functions and function expressions for FRP calls
        if (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)) {
          if (arg.body) {
            // If body is an expression, process it
            if (!ts.isBlock(arg.body)) {
              const nestedId = processNestedOperator(arg.body, parentOperatorId);
              if (nestedId && parentOperatorId) {
                // Connect the nested operator to the parent
                edges.push({
                  from: nestedId,
                  to: parentOperatorId,
                });
              }
            }
          }
        }
      }
      // Don't return anything - we've already created the edges
      return null;
    }

    // Handle array literals (e.g., [event, value] tuples in mapMerge)
    if (ts.isArrayLiteralExpression(expr)) {
      // For tuple arrays like [event, value], extract the first element
      if (expr.elements.length > 0) {
        const firstElement = expr.elements[0];
        return processNestedOperator(firstElement, parentOperatorId);
      }
      return null;
    }

    // Handle identifiers (variable references)
    if (ts.isIdentifier(expr) && expr.text) {
      return expr.text;
    }

    // Handle property access (e.g., rootRef.ref, initial.value)
    if (ts.isPropertyAccessExpression(expr)) {
      const root = getRootIdentifier(expr);

      // Check if this is accessing a component props parameter
      if (root && componentPropsParams.has(root)) {
        const propPath = expr.getText(sourceFile);

        // Check if we've already created a prop input for this path
        if (propInputsByPath.has(propPath)) {
          return propInputsByPath.get(propPath)!;
        }

        const propId = `prop_${++propIdCounter}`;

        propInputs.push({
          id: propId,
          type: "prop",
          target: propPath,
          propName: propPath,
        });

        propInputsByPath.set(propPath, propId);
        return propId;
      }

      return root || null;
    }

    return null;
  }

  function visit(node: ts.Node) {
    try {
      // Detect function declarations to track their parameters as component props
      if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)) {
        for (const param of node.parameters) {
          if (ts.isIdentifier(param.name)) {
            componentPropsParams.add(param.name.text);
          }
        }
      }

      // Look for: const varName = E.map(...)
      if (ts.isVariableDeclaration(node)) {
        const name = node.name;

        if (ts.isIdentifier(name) && node.initializer) {
          const varName = name.text;
          const initializer = node.initializer;

          if (isFRPCall(initializer)) {
            const operation = getOperationName(initializer);
            const type = getNodeType(operation, initializer.expression);
            const config = extractOperatorConfig(initializer, sourceFile);

            let line = 0, character = 0;
            try {
              const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
              line = pos.line;
              character = pos.character;
            } catch (e) {
              line = 0;
              character = 0;
            }

            const operatorId = `op_${++operatorIdCounter}`;

            const operatorNode: OperatorNode = {
              id: operatorId,
              operation,
              type,
              variableName: varName,
              config,
              location: {
                file: sourceFile.fileName,
                line: line + 1,
                column: character + 1,
              },
              rawCode: node.getText(sourceFile),
            };

            operators.push(operatorNode);

            // Track this as an FRP variable
            if (varName) {
              frpVariables.add(varName);
            }

            // Process arguments recursively to handle nested operators
            if (initializer.arguments.length > 0) {
              const firstArg = initializer.arguments[0];

              // Handle array of expressions: E.mergeAll([...])
              if (ts.isArrayLiteralExpression(firstArg)) {
                for (const element of firstArg.elements) {
                  const inputId = processNestedOperator(element, operatorId);
                  if (inputId) {
                    edges.push({
                      from: inputId,
                      to: operatorId,
                    });
                  }
                }
              }
              // Handle single expression
              else {
                const inputId = processNestedOperator(firstArg, operatorId);
                if (inputId) {
                  edges.push({
                    from: inputId,
                    to: operatorId,
                  });
                }
              }

              // Handle additional arguments (e.g., map2, fold)
              if (initializer.arguments.length > 1) {
                for (let i = 1; i < initializer.arguments.length; i++) {
                  const arg = initializer.arguments[i];

                  // Skip function arguments
                  if (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)) {
                    continue;
                  }

                  const inputId = processNestedOperator(arg, operatorId);
                  if (inputId) {
                    edges.push({
                      from: inputId,
                      to: operatorId,
                    });
                  }
                }
              }
            }
          }
          // Check for Prop() calls: const value = Prop(initial.value)
          else if (ts.isCallExpression(initializer) &&
                   ts.isIdentifier(initializer.expression) &&
                   initializer.expression.text === "Prop") {
            // Track this variable as an FRP variable (it's a reactive)
            frpVariables.add(varName);

            // Process the argument to connect prop inputs
            if (initializer.arguments.length > 0) {
              const firstArg = initializer.arguments[0];
              const inputId = processNestedOperator(firstArg);
              if (inputId) {
                edges.push({
                  from: inputId,
                  to: varName,
                  label: "prop",
                });
              }
            }
          }
          // Check for DOM event sources: const triggerClicked = triggerRef.outputs.click
          else {
            const eventSource = isDOMEventSource(initializer);
            if (eventSource) {
              const sourceId = `src_${++sourceIdCounter}`;
              const target = `${eventSource.refName}.outputs.${eventSource.eventName}`;

              eventSources.push({
                id: sourceId,
                type: "dom-event",
                target: target,
                eventName: eventSource.eventName,
              });

              // Track this variable as an FRP variable (it's an event)
              frpVariables.add(varName);

              // Create edge from event source to variable
              edges.push({
                from: sourceId,
                to: varName,
                label: "event",
              });
            }
          }
        }
      }

      // Detect DOM sinks: bind() and bindLocalStorage() calls
      if (ts.isCallExpression(node)) {
        const expr = node.expression;

        if (ts.isIdentifier(expr) && expr.text) {
          const funcName = expr.text;

          // bind(element, "attr", reactive)
          if (funcName === "bind" && node.arguments.length >= 3) {
            const targetArg = node.arguments[1];
            const valueArg = node.arguments[2];

            // Get attribute name (could be string literal, identifier, or type assertion)
            let attr: string | undefined;
            let attrArgResolved = targetArg;
            if (ts.isAsExpression(targetArg)) {
              attrArgResolved = targetArg.expression;
            }
            if (ts.isStringLiteral(attrArgResolved)) {
              attr = attrArgResolved.text;
            } else if (ts.isIdentifier(attrArgResolved)) {
              attr = attrArgResolved.text;
            }

            // Get reactive value (could be identifier, property access, or type assertion)
            let reactive: string | undefined;
            let valueArgResolved = valueArg;
            if (ts.isAsExpression(valueArg)) {
              valueArgResolved = valueArg.expression;
            }
            if (ts.isIdentifier(valueArgResolved)) {
              reactive = valueArgResolved.text;
            }

            if (attr && reactive && frpVariables.has(reactive)) {
              const sinkId = `sink_${++sinkIdCounter}`;
              domSinks.push({
                id: sinkId,
                type: "dom-binding",
                target: attr,
                operation: "bind",
              });
              edges.push({
                from: reactive,
                to: sinkId,
                label: "bind",
              });
            }
          }

          // bindLocalStorage(key, reactive, config)
          else if (funcName === "bindLocalStorage" && node.arguments.length >= 2) {
            const keyArg = node.arguments[0];
            const valueArg = node.arguments[1];

            // Get key name (could be string literal or identifier)
            let key: string | undefined;
            if (ts.isStringLiteral(keyArg)) {
              key = keyArg.text;
            } else if (ts.isIdentifier(keyArg)) {
              key = keyArg.text;
            }

            // Get reactive value
            let reactive: string | undefined;
            if (ts.isIdentifier(valueArg)) {
              reactive = valueArg.text;
            }

            if (key && reactive && frpVariables.has(reactive)) {
              const sinkId = `sink_${++sinkIdCounter}`;
              domSinks.push({
                id: sinkId,
                type: "storage",
                target: key,
                operation: "bindLocalStorage",
              });
              edges.push({
                from: reactive,
                to: sinkId,
                label: "storage",
              });
            }
          }
        }

        // E.effect(event, callback) - side effects
        if (ts.isPropertyAccessExpression(expr)) {
          const obj = expr.expression;
          const method = expr.name?.text;

          if (ts.isIdentifier(obj) && obj.text === "E" && method === "effect" && node.arguments.length >= 2) {
            const eventArg = node.arguments[0];

            // Get the event source (could be identifier or nested expression)
            const eventId = processNestedOperator(eventArg);

            if (eventId) {
              const sinkId = `sink_${++sinkIdCounter}`;

              // Try to extract a meaningful description from the callback
              let effectDescription = "side-effect";
              const callbackArg = node.arguments[1];
              if (ts.isArrowFunction(callbackArg) || ts.isFunctionExpression(callbackArg)) {
                // Get first few chars of callback body as description
                const callbackText = callbackArg.getText(sourceFile);
                if (callbackText.length > 50) {
                  effectDescription = callbackText.substring(0, 47) + "...";
                } else {
                  effectDescription = callbackText;
                }
              }

              domSinks.push({
                id: sinkId,
                type: "effect",
                target: effectDescription,
                operation: "effect",
              });

              edges.push({
                from: eventId,
                to: sinkId,
                label: "effect",
              });
            }
          }
        }
      }

      // Detect DOM tag functions with reactive children
      // e.g., span({ class: "foo" }, readoutText) where readoutText is a reactive
      if (ts.isCallExpression(node)) {
        const expr = node.expression;

        if (ts.isIdentifier(expr) && expr.text && DOM_TAGS.has(expr.text)) {
          const tagName = expr.text;

          // Extract attributes from first argument (if it's an object literal)
          let selector = tagName;
          if (node.arguments.length > 0) {
            const attrsArg = node.arguments[0];
            if (ts.isObjectLiteralExpression(attrsArg)) {
              for (const prop of attrsArg.properties) {
                if (ts.isPropertyAssignment(prop)) {
                  const propName = prop.name;
                  const propValue = prop.initializer;

                  // Build selector from class and id
                  if (ts.isIdentifier(propName) && propName.text === "class" &&
                      ts.isStringLiteral(propValue)) {
                    selector += `.${propValue.text.replace(/\s+/g, ".")}`;
                  } else if (ts.isIdentifier(propName) && propName.text === "id" &&
                             ts.isStringLiteral(propValue)) {
                    selector += `#${propValue.text}`;
                  }

                  // Detect reactive attribute values
                  // e.g., { "aria-expanded": triggerExpanded, style: menuStyle }
                  if (ts.isIdentifier(propValue) && propValue.text && frpVariables.has(propValue.text)) {
                    const reactive = propValue.text;
                    const sinkId = `sink_${++sinkIdCounter}`;

                    // Get attribute name
                    let attrName = "";
                    if (ts.isIdentifier(propName)) {
                      attrName = propName.text;
                    } else if (ts.isStringLiteral(propName)) {
                      attrName = propName.text;
                    } else if (ts.isComputedPropertyName(propName)) {
                      attrName = propName.expression.getText(sourceFile);
                    }

                    if (attrName && attrName !== "class" && attrName !== "id" && attrName !== "ref") {
                      domSinks.push({
                        id: sinkId,
                        type: "dom-binding",
                        target: `${selector}[${attrName}]`,
                        operation: "reactive-attr",
                      });

                      edges.push({
                        from: reactive,
                        to: sinkId,
                        label: "bind",
                      });
                    }
                  }
                }
              }
            }
          }

          // Check arguments for reactive values (skip first arg which is attributes)
          for (let i = 1; i < node.arguments.length; i++) {
            const arg = node.arguments[i];

            if (ts.isIdentifier(arg) && arg.text && frpVariables.has(arg.text)) {
              const reactive = arg.text;
              const sinkId = `sink_${++sinkIdCounter}`;

              domSinks.push({
                id: sinkId,
                type: "dom-element",
                target: `${selector}.children`,
              });

              edges.push({
                from: reactive,
                to: sinkId,
                label: "render",
              });
            }
          }
        }
      }

      // Detect component outputs: return { el, props: {...}, outputs: { edited, isEditing } }
      if (ts.isReturnStatement(node) && node.expression) {
        const returnExpr = node.expression;

        // Check if return value is an object literal
        if (ts.isObjectLiteralExpression(returnExpr)) {
          // Look for the "outputs" property
          for (const prop of returnExpr.properties) {
            if (ts.isPropertyAssignment(prop)) {
              const propName = prop.name;

              // Check if property name is "outputs"
              if (ts.isIdentifier(propName) && propName.text === "outputs") {
                const outputsValue = prop.initializer;

                // The outputs value should be an object literal
                if (ts.isObjectLiteralExpression(outputsValue)) {
                  // Extract each output (shorthand or regular property)
                  for (const outputProp of outputsValue.properties) {
                    let outputName: string | undefined;

                    // Handle shorthand: { edited, isEditing }
                    if (ts.isShorthandPropertyAssignment(outputProp)) {
                      if (ts.isIdentifier(outputProp.name)) {
                        outputName = outputProp.name.text;
                      }
                    }
                    // Handle regular property: { edited: edited }
                    else if (ts.isPropertyAssignment(outputProp)) {
                      if (ts.isIdentifier(outputProp.name) && ts.isIdentifier(outputProp.initializer)) {
                        outputName = outputProp.initializer.text;
                      }
                    }

                    // If this output is a tracked FRP variable, create an output sink
                    if (outputName && frpVariables.has(outputName)) {
                      const sinkId = `sink_${++sinkIdCounter}`;

                      domSinks.push({
                        id: sinkId,
                        type: "output",
                        target: outputName,
                        operation: "output",
                      });

                      edges.push({
                        from: outputName,
                        to: sinkId,
                        label: "output",
                      });
                    }
                  }
                }
              }
            }
          }
        }
      }

      ts.forEachChild(node, visit);
    } catch (error) {
      // Silently skip errors
    }
  }

  visit(sourceFile);

  return {
    operators,
    domSinks,
    eventSources,
    propInputs,
    edges,
    sourceFile: sourceFile.fileName,
  };
}

/**
 * Analyze a TypeScript file by path
 */
export function analyzeFile(filePath: string): OperatorGraph {
  const program = ts.createProgram([filePath], {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  });

  const sourceFile = program.getSourceFile(filePath);
  if (!sourceFile) {
    throw new Error(`Could not load file: ${filePath}`);
  }

  return analyzeSourceFile(sourceFile);
}

// ============================================================================
// Graph Export Formats
// ============================================================================

/**
 * Export as Mermaid diagram (operators as boxes)
 */
export function exportMermaid(graph: OperatorGraph): string {
  const lines: string[] = ["graph TD"];

  // Create nodes for operators
  for (const op of graph.operators) {
    let label = op.operation;

    // Add config if present
    if (op.config) {
      // Escape HTML entities for Mermaid
      const escapedConfig = op.config
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
      label = `${op.operation}(${escapedConfig})`;
    }

    lines.push(`  ${op.id}["${label}"]:::${op.type}`);
  }

  // Add styles
  lines.push("");
  lines.push("  classDef event fill:#3b82f6,stroke:#2563eb,color:#fff");
  lines.push("  classDef reactive fill:#10b981,stroke:#059669,color:#fff");
  lines.push("  classDef unknown fill:#6b7280,stroke:#4b5563,color:#fff");
  lines.push("");

  // Create edges from inputs to operators
  for (const edge of graph.edges) {
    lines.push(`  ${edge.from} --> ${edge.to}`);
  }

  // Create edges from operators to outputs
  for (const op of graph.operators) {
    if (op.variableName) {
      lines.push(`  ${op.id} --> ${op.variableName}`);
    }
  }

  // Add event sources
  if (graph.eventSources.length > 0) {
    lines.push("");
    for (const source of graph.eventSources) {
      let sourceLabel = "";
      if (source.type === "dom-event") {
        sourceLabel = source.target;
      } else if (source.type === "media-query") {
        sourceLabel = source.target;
      }
      // Use stadium shape for event sources
      lines.push(`  ${source.id}([${sourceLabel}]):::source`);
    }
  }

  // Add prop inputs
  if (graph.propInputs.length > 0) {
    lines.push("");
    for (const prop of graph.propInputs) {
      const propLabel = `prop: ${prop.target}`;
      // Use double circle shape for prop inputs
      lines.push(`  ${prop.id}(((${propLabel}))):::prop`);
    }
  }

  // Add DOM sinks
  lines.push("");
  for (const sink of graph.domSinks) {
    let sinkLabel = "";
    let sinkShape = "";

    if (sink.type === "dom-element") {
      sinkLabel = `&lt;${sink.target}&gt;`;
      sinkShape = `{{${sinkLabel}}}`;
    } else if (sink.type === "dom-binding") {
      // Don't include brackets in label - the shape provides them
      sinkLabel = sink.target;
      sinkShape = `[/${sinkLabel}/]`;
    } else if (sink.type === "storage") {
      sinkLabel = `localStorage.${sink.target}`;
      sinkShape = `[(${sinkLabel})]`;
    } else if (sink.type === "effect") {
      // Escape and clean the description for Mermaid
      const cleanedTarget = sink.target
        .replace(/\n/g, " ")  // Replace newlines with spaces
        .replace(/\s+/g, " ")  // Collapse multiple spaces
        .replace(/[{}()\[\]]/g, "")  // Remove special Mermaid characters
        .trim();

      // Truncate if too long
      const truncated = cleanedTarget.length > 50
        ? cleanedTarget.substring(0, 47) + "..."
        : cleanedTarget;

      const escapedTarget = truncated
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

      sinkLabel = `effect: ${escapedTarget}`;
      sinkShape = `[\\${sinkLabel}\\]`;
    } else if (sink.type === "output") {
      sinkLabel = `output: ${sink.target}`;
      sinkShape = `{{${sinkLabel}}}`;
    }

    lines.push(`  ${sink.id}${sinkShape}:::sink`);
  }

  // Add styles for sinks, sources, and props
  lines.push("  classDef sink fill:#f97316,stroke:#ea580c,color:#fff");
  lines.push("  classDef source fill:#8b5cf6,stroke:#7c3aed,color:#fff");
  lines.push("  classDef prop fill:#ec4899,stroke:#db2777,color:#fff");

  return lines.join("\n");
}

/**
 * Export as Graphviz DOT
 */
export function exportDOT(graph: OperatorGraph): string {
  const lines: string[] = ["digraph FRP {"];
  lines.push("  rankdir=TD;");
  lines.push("  node [shape=box, style=rounded];");
  lines.push("");

  // Operators as boxes
  for (const op of graph.operators) {
    const label = op.variableName
      ? `${op.operation}\\n=> ${op.variableName}`
      : op.operation;

    const color =
      op.type === "event"
        ? "lightblue"
        : op.type === "reactive"
          ? "lightgreen"
          : "lightgray";

    lines.push(
      `  ${op.id} [label="${label}", fillcolor="${color}", style="rounded,filled"];`,
    );
  }

  lines.push("");

  // Input/output nodes (variables)
  const allVariables = new Set<string>();
  for (const edge of graph.edges) {
    allVariables.add(edge.from);
  }
  for (const op of graph.operators) {
    if (op.variableName) {
      allVariables.add(op.variableName);
    }
  }

  for (const varName of allVariables) {
    lines.push(`  ${varName} [shape=ellipse, style=filled, fillcolor=white];`);
  }

  lines.push("");

  // Edges from inputs to operators
  for (const edge of graph.edges) {
    lines.push(`  ${edge.from} -> ${edge.to};`);
  }

  // Edges from operators to outputs
  for (const op of graph.operators) {
    if (op.variableName) {
      lines.push(`  ${op.id} -> ${op.variableName};`);
    }
  }

  lines.push("}");
  return lines.join("\n");
}

/**
 * Export as D3.js JSON
 */
export function exportD3(graph: OperatorGraph): {
  nodes: any[];
  links: any[];
} {
  const nodes = [];
  const links = [];

  // Add operator nodes
  for (const op of graph.operators) {
    nodes.push({
      id: op.id,
      label: op.variableName ? `${op.operation} => ${op.variableName}` : op.operation,
      type: "operator",
      operatorType: op.type,
      operation: op.operation,
      variableName: op.variableName,
      group: 1,
    });
  }

  // Add variable nodes
  const allVariables = new Set<string>();
  for (const edge of graph.edges) {
    allVariables.add(edge.from);
  }
  for (const op of graph.operators) {
    if (op.variableName) {
      allVariables.add(op.variableName);
    }
  }

  for (const varName of allVariables) {
    nodes.push({
      id: varName,
      label: varName,
      type: "variable",
      group: 2,
    });
  }

  // Add edges from inputs to operators
  for (const edge of graph.edges) {
    links.push({
      source: edge.from,
      target: edge.to,
      type: "input",
    });
  }

  // Add edges from operators to outputs
  for (const op of graph.operators) {
    if (op.variableName) {
      links.push({
        source: op.id,
        target: op.variableName,
        type: "output",
      });
    }
  }

  return { nodes, links };
}

/**
 * Export as JSON
 */
export function exportJSON(graph: OperatorGraph): string {
  return JSON.stringify(graph, null, 2);
}

/**
 * Print graph summary to console
 */
export function printGraph(graph: OperatorGraph): void {
  console.log("=== FRP Operator Graph ===");
  console.log(`Source: ${graph.sourceFile}`);
  console.log(`Operators: ${graph.operators.length}`);
  console.log(`Edges: ${graph.edges.length}`);
  console.log("");

  console.log("Operators:");
  for (const op of graph.operators) {
    const location = `${op.location.file}:${op.location.line}`;
    const config = op.config ? `(${op.config})` : "";
    const output = op.variableName ? ` => ${op.variableName}` : "";
    console.log(`  ${op.id}: ${op.operation}${config}${output} (${op.type}) @ ${location}`);
  }

  console.log("");
  console.log("Data Flow:");
  for (const edge of graph.edges) {
    const toOp = graph.operators.find(o => o.id === edge.to);
    const opLabel = toOp ? `${toOp.operation}` : edge.to;
    console.log(`  ${edge.from} --> ${opLabel}`);
  }

  // Show outputs
  console.log("");
  console.log("Outputs:");
  for (const op of graph.operators) {
    if (op.variableName) {
      console.log(`  ${op.operation} => ${op.variableName}`);
    }
  }

  if (graph.eventSources.length > 0) {
    console.log("");
    console.log("Event Sources:");
    for (const source of graph.eventSources) {
      console.log(`  ${source.id}: ${source.target} (${source.type})`);
    }
  }

  if (graph.propInputs.length > 0) {
    console.log("");
    console.log("Prop Inputs:");
    for (const prop of graph.propInputs) {
      console.log(`  ${prop.id}: ${prop.propName} = Prop(${prop.target})`);
    }
  }

  if (graph.domSinks.length > 0) {
    console.log("");
    console.log("DOM Sinks:");
    for (const sink of graph.domSinks) {
      let description = "";
      if (sink.type === "dom-element") {
        description = `<${sink.target}> element`;
      } else if (sink.type === "dom-binding") {
        description = `[${sink.target}] attribute binding`;
      } else if (sink.type === "storage") {
        description = `localStorage.${sink.target}`;
      } else if (sink.type === "effect") {
        description = `effect: ${sink.target}`;
      } else if (sink.type === "output") {
        description = `output: ${sink.target}`;
      }
      console.log(`  ${sink.id}: ${description}`);
    }
  }
}
