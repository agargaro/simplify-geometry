# Code style

What ESLint cannot check about code in `src/`. Size and complexity limits are reported as warnings by `npm run lint:style` ([eslint.style.config.js](../eslint.style.config.js)).

## Functions

- One task per function, at one level of abstraction. An orchestrating function calls named steps instead of inlining them.
- Guard clauses first: early `return`, `continue` or `throw` instead of `else` and nested `if`.
- Errors are full sentences naming the parameter: `throw new RangeError('"ratio" must be between 0 and 1.')`.
- Give a non-trivial condition a name with a local `const` before the `if`.
- Never nest a call or a ternary inside an argument list when it makes the line hard to read: use intermediate locals.
- A function signature stays on one line, whatever its length: never wrap the parameters. Long signatures are exempt from the `max-len` limit.

## Paragraphs

A function body is a sequence of paragraphs separated by one blank line, in this order:

1. Guards.
2. Local declarations, grouped without blank lines.
3. The main logic or loop.
4. Writing the result and returning.

```ts
function countDegenerateTriangles(index: Uint32Array): number {
  if (index.length % 3 !== 0) throw new RangeError('"index" length must be a multiple of 3.');

  let count = 0;

  for (let i = 0, l = index.length; i < l; i += 3) {
    const a = index[i];
    const b = index[i + 1];
    const c = index[i + 2];

    if (a === b || b === c || c === a) count++;
  }

  return count;
}
```

## Files

- File order: imports, module-level constants, exported functions, module-level helpers.
- An import stays on one line, whatever its length: never wrap the imported names. Long imports are exempt from the `max-len` limit.
- Module-level mutable state is only for hot-path scratch values, and must stay correct under concurrent async calls.

## Hot paths

Per-vertex and per-index loops may exceed the `lint:style` limits when splitting would cost performance. A measurement decides, and the exception is explicit and justified:

```ts
// eslint-disable-next-line max-lines-per-function -- hot path: one pass over the index buffer
```

## Adoption

New or changed code adds no `lint:style` warnings; existing ones are fixed only in dedicated refactors. When `src/` is clean, the rules move into `eslint.config.js` as errors.
