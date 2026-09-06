/**
 * Narrow a possibly-absent value inside a test without a non-null assertion.
 *
 * `noUncheckedIndexedAccess` types every `array[i]` and every index-signature
 * read as possibly `undefined`. The tempting reaction in a test is `!`, which
 * asserts the possibility away and hides it. This does the opposite: it fails
 * the test loudly, naming what was missing, and narrows the type honestly for
 * the assertions that follow.
 *
 * Prefer plain optional chaining inside `expect(...)` where that already fails
 * loudly (`expect(rows[0]?.id).toBe("a")` cannot pass with `rows` empty). Reach
 * for this only when the value is used in arithmetic, passed as an argument, or
 * read several times.
 */
export function assertDefined<T>(
  value: T | null | undefined,
  what: string,
): asserts value is T {
  if (value === null || value === undefined) {
    const seen = value === null ? "null" : "undefined";
    throw new Error(`Expected ${what} to be defined, but it was ${seen}.`);
  }
}
