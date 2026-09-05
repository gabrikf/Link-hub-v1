/**
 * Narrows an optional value to its present form, throwing a named error when it
 * is absent.
 *
 * This exists so tests can index an array and go on using the element without a
 * `!`. A non-null assertion tells the compiler the read cannot be `undefined`
 * and then says nothing at runtime when it is — the failure surfaces later as
 * `Cannot read properties of undefined`, pointing at the wrong line. This checks
 * for real and names what was missing.
 */
export function expectDefined<T>(value: T | undefined | null, what: string): T {
  if (value === undefined || value === null) {
    throw new Error(`Expected ${what} to be defined, got ${String(value)}`);
  }

  return value;
}
