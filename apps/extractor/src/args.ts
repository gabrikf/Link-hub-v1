/**
 * A ~60-line argument parser, hand-rolled.
 *
 * `apps/mcp` ships no CLI-parsing dependency, so this package adds none either.
 * The surface it has to cover is small and fixed: a subcommand, some
 * positionals, repeatable `--author` / `--repo`, and a handful of flags.
 *
 * Node's own `util.parseArgs` would do, but it throws on unknown options in
 * strict mode and silently accepts them otherwise; a wrong flag on a
 * privacy-sensitive tool should produce an error naming the flag, not a
 * different behaviour than the user intended.
 */

export interface ParsedArgs {
  /** First non-flag token, when it is not a path. */
  readonly command: string | undefined;
  readonly positionals: readonly string[];
  /** Every occurrence, in order, keyed by long name without the dashes. */
  readonly options: ReadonlyMap<string, readonly string[]>;
  readonly booleans: ReadonlySet<string>;
}

/** Options that take a value; everything else is treated as a boolean flag. */
export const VALUE_OPTIONS = new Set([
  "author",
  "repo",
  "since",
  "until",
  "out",
  "config",
  "connection",
  "max-commits",
]);

const SHORT_ALIASES: Readonly<Record<string, string>> = {
  y: "yes",
  o: "out",
  h: "help",
  a: "author",
  r: "repo",
  c: "config",
};

export class ArgError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArgError";
  }
}

export function parseArgs(argv: readonly string[]): ParsedArgs {
  const positionals: string[] = [];
  const options = new Map<string, string[]>();
  const booleans = new Set<string>();

  const push = (key: string, value: string): void => {
    const existing = options.get(key);
    if (existing) existing.push(value);
    else options.set(key, [value]);
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === undefined) continue;

    if (token === "--") {
      positionals.push(...argv.slice(i + 1));
      break;
    }

    if (!token.startsWith("-") || token === "-") {
      positionals.push(token);
      continue;
    }

    const raw = token.replace(/^--?/, "");
    const [namePart, inlineValue] = splitOnce(raw, "=");
    const name = SHORT_ALIASES[namePart] ?? namePart;

    if (VALUE_OPTIONS.has(name)) {
      if (inlineValue !== undefined) {
        push(name, inlineValue);
        continue;
      }
      const next = argv[i + 1];
      if (next === undefined || (next.startsWith("-") && next !== "-")) {
        throw new ArgError(`--${name} needs a value.`);
      }
      push(name, next);
      i += 1;
      continue;
    }

    if (inlineValue !== undefined) {
      throw new ArgError(`--${name} is a flag and does not take a value.`);
    }
    booleans.add(name);
  }

  return {
    command: positionals[0],
    positionals,
    options,
    booleans,
  };
}

function splitOnce(value: string, separator: string): [string, string?] {
  const index = value.indexOf(separator);
  if (index === -1) return [value, undefined];
  return [value.slice(0, index), value.slice(index + 1)];
}

/** All values given for a repeatable option. */
export function values(args: ParsedArgs, name: string): string[] {
  return [...(args.options.get(name) ?? [])];
}

/** The last value given for an option, or undefined. */
export function value(args: ParsedArgs, name: string): string | undefined {
  const all = args.options.get(name);
  return all && all.length > 0 ? all[all.length - 1] : undefined;
}

export function flag(args: ParsedArgs, name: string): boolean {
  return args.booleans.has(name);
}
