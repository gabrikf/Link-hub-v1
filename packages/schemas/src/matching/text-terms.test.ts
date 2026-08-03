import { describe, expect, it } from "vitest";
import { extractKnownTerms, tokenizeMatchText } from "./text-terms.js";

describe("tokenizeMatchText", () => {
  it("keeps the characters that make a technology name", () => {
    expect(tokenizeMatchText("We use C++, C# and Node.js")).toContain("c++");
    expect(tokenizeMatchText("We use C++, C# and Node.js")).toContain("c#");
    expect(tokenizeMatchText("We use C++, C# and Node.js")).toContain("node.js");
  });

  it("drops single characters", () => {
    expect(tokenizeMatchText("a b react")).toEqual(["react"]);
  });
});

describe("extractKnownTerms", () => {
  const catalog = [
    "React",
    "Node.js",
    "Machine Learning",
    "Tailwind CSS",
    "Go",
    "SQL",
  ];

  it("finds multi-word catalog entries that a word splitter can never produce", () => {
    // The old code filtered the vocabulary through a Set of single query words,
    // so "machine learning" was structurally unreachable and the skills bucket
    // was skipped for exactly the queries that named it.
    expect(
      extractKnownTerms("Senior machine learning engineer", catalog),
    ).toContain("Machine Learning");
    expect(
      extractKnownTerms("Frontend dev with tailwind css experience", catalog),
    ).toContain("Tailwind CSS");
  });

  it("still finds single-word entries", () => {
    const found = extractKnownTerms("react and node.js developer", catalog);
    expect(found).toContain("React");
    expect(found).toContain("Node.js");
  });

  it("does not invent terms that are only substrings of a word", () => {
    const found = extractKnownTerms("we use mongodb and postgresql", catalog);
    expect(found).not.toContain("Go");
    expect(found).not.toContain("SQL");
  });

  it("returns each catalog entry at most once", () => {
    const found = extractKnownTerms("react react React", catalog);
    expect(found.filter((entry) => entry === "React")).toHaveLength(1);
  });

  it("handles an empty query and an empty catalog", () => {
    expect(extractKnownTerms("", catalog)).toEqual([]);
    expect(extractKnownTerms("react", [])).toEqual([]);
  });
});
