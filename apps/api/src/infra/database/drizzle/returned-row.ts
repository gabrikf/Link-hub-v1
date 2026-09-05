/**
 * Takes the single row a Drizzle `.returning()` is expected to produce, and
 * fails with a statement-shaped message when there is none.
 *
 * `.returning()` is typed as an array, so under `noUncheckedIndexedAccess` its
 * first element is `Row | undefined`. For an INSERT that is close to a
 * formality — the driver rejects before it hands back an empty array. For an
 * UPDATE or a DELETE it is not: a WHERE clause that matches nothing returns
 * `[]`, and the caller then reads a column off `undefined`.
 *
 * A `!` would compile and leave that as a bare `TypeError: Cannot read
 * properties of undefined (reading 'id')` from inside a mapper, with nothing
 * naming the statement that came back empty. This names it.
 */
export function requireReturnedRow<T>(
  rows: readonly T[],
  statement: string,
): T {
  const [row] = rows;

  if (row === undefined) {
    throw new Error(`${statement} returned no row`);
  }

  return row;
}
