import { describe, expect, it } from "vitest";
import { ArgError, flag, parseArgs, value, values } from "./args.js";

describe("the hand-rolled argument parser", () => {
  it("collects repeatable options in order", () => {
    const args = parseArgs(["-a", "a@x.test", "--author", "b@x.test", "--author=c@x.test"]);
    expect(values(args, "author")).toEqual(["a@x.test", "b@x.test", "c@x.test"]);
    expect(value(args, "author")).toBe("c@x.test");
  });

  it("separates the command from the positionals", () => {
    const args = parseArgs(["upload", "payload.json", "--connection", "abc"]);
    expect(args.command).toBe("upload");
    expect(args.positionals).toEqual(["upload", "payload.json"]);
    expect(value(args, "connection")).toBe("abc");
  });

  it("understands short aliases and bare flags", () => {
    const args = parseArgs(["-y", "-o", "out.json", "--help"]);
    expect(flag(args, "yes")).toBe(true);
    expect(flag(args, "help")).toBe(true);
    expect(value(args, "out")).toBe("out.json");
  });

  it("treats everything after -- as a positional", () => {
    const args = parseArgs(["extract", "--", "--not-a-flag"]);
    expect(args.positionals).toEqual(["extract", "--not-a-flag"]);
  });

  it("names the flag when it is used wrongly", () => {
    // Silently accepting a malformed flag would mean doing something other than
    // what the user asked, which on a privacy tool is the wrong failure mode.
    expect(() => parseArgs(["--since"])).toThrow(ArgError);
    expect(() => parseArgs(["--since"])).toThrow(/--since/);
    expect(() => parseArgs(["--yes=please"])).toThrow(/--yes/);
  });

  it("accepts a path that begins with a dash after an =", () => {
    expect(value(parseArgs(["--out=-weird.json"]), "out")).toBe("-weird.json");
  });
});
