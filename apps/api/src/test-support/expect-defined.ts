/**
 * Narrows an optional value to its present form, throwing a named error when it
 * is absent.
 *
 * Tests reach for this after indexing an array — `const [stored] = repo.items`
 * — so the element can be used without a `!`. A non-null assertion tells the
 * compiler the read cannot be `undefined` and then says nothing at runtime when
 * it is: the test fails several lines later as `Cannot read properties of
 * undefined`, blaming the wrong assertion. This checks for real and names what
 * was missing.
 *
 * Deliberately free of any `vitest` import, so it stays importable from
 * `src/core/**` without breaking the layer rule and costs nothing if it is ever
 * pulled into a build.
 */
export function expectDefined<T>(value: T | undefined | null, what: string): T {
  if (value === undefined || value === null) {
    throw new Error(`Expected ${what} to be defined, got ${String(value)}`);
  }

  return value;
}
