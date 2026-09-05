/**
 * Reads `items[index mod items.length]`, wrapping negative indexes.
 *
 * The synthetic generators and the scoring fixture walk their blueprint and
 * quality tables cyclically, so the index is reduced into range before the read.
 * `noUncheckedIndexedAccess` still types that read as `T | undefined`, because
 * the compiler cannot see that `items` is non-empty at the call site.
 *
 * The guard is deliberate rather than a `!`: an empty table is the one way this
 * can miss, and it would otherwise produce an empty dataset or a fixture with no
 * mismatch cases — a silent, hard-to-attribute regression in the training data.
 * Failing loudly here names the cause.
 */
export function pickCyclic<T>(items: readonly T[], index: number): T {
  const item =
    items.length === 0
      ? undefined
      : items[((index % items.length) + items.length) % items.length];

  if (item === undefined) {
    throw new Error(
      `pickCyclic: index ${String(index)} resolved to nothing in a collection of ${String(items.length)}`,
    );
  }

  return item;
}
