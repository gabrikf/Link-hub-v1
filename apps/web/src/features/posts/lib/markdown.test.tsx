import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Markdown, markdownExcerpt, markdownToHtml } from "./markdown";

describe("markdownToHtml — XSS safety", () => {
  it("escapes a raw <script> tag so no live element is emitted", () => {
    const html = markdownToHtml("<script>alert(1)</script>");
    expect(html).not.toContain("<script");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes an <img onerror> payload (no live <img> tag)", () => {
    const html = markdownToHtml('<img src=x onerror="alert(1)">');
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
    // The dangerous attribute never reaches a live tag.
    expect(html).not.toMatch(/<[^>]*onerror/i);
  });

  it("does not turn a javascript: link into an href (rendered inert)", () => {
    const html = markdownToHtml("[label](javascript:alert(1))");
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("href=");
    expect(html).not.toContain('href="javascript');
    // The label text is still present, just not linkified.
    expect(html).toContain("label");
  });

  it("renders a real https link as a safe anchor", () => {
    const html = markdownToHtml("[x](https://ok.com)");
    expect(html).toContain('href="https://ok.com"');
    expect(html).toContain('rel="noreferrer"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain(">x</a>");
  });

  it("does not execute or emit a script element when rendered via <Markdown>", () => {
    const { container } = render(
      <Markdown>{"<script>window.__pwned = true</script>"}</Markdown>,
    );
    expect(container.querySelector("script")).toBeNull();
    // The escaped source is shown as visible text.
    expect(container.textContent).toContain("<script>");
  });
});

describe("markdownToHtml — formatting", () => {
  it("renders **bold** as <strong>", () => {
    expect(markdownToHtml("**bold**")).toContain("<strong>bold</strong>");
  });

  it("renders a level-1 heading", () => {
    const html = markdownToHtml("# Heading");
    expect(html).toMatch(/<h1[^>]*>Heading<\/h1>/);
  });

  it("renders an unordered list", () => {
    const html = markdownToHtml("- one\n- two");
    expect(html).toMatch(/<ul[^>]*>/);
    expect(html).toContain("<li>one</li>");
    expect(html).toContain("<li>two</li>");
  });

  it("renders an ordered list", () => {
    const html = markdownToHtml("1. first\n2. second");
    expect(html).toMatch(/<ol[^>]*>/);
    expect(html).toContain("<li>first</li>");
    expect(html).toContain("<li>second</li>");
  });

  it("renders inline `code` spans", () => {
    const html = markdownToHtml("run `npm test` now");
    expect(html).toMatch(/<code[^>]*>npm test<\/code>/);
  });

  it("renders fenced code blocks", () => {
    const html = markdownToHtml("```\nconst x = 1;\n```");
    expect(html).toContain("<pre");
    expect(html).toContain("const x = 1;");
  });
});

describe("markdownExcerpt", () => {
  it("strips markdown syntax to plain text", () => {
    expect(markdownExcerpt("# Hello **world**")).toBe("Hello world");
  });

  it("keeps link labels but drops the url", () => {
    expect(markdownExcerpt("See [my site](https://ok.com) now")).toBe(
      "See my site now",
    );
  });

  it("keeps hyphens and underscores that are part of the prose", () => {
    const body =
      "Rebuilt the front-end of our e-commerce checkout between 2023-2024 and renamed every snake_case config key.";
    expect(markdownExcerpt(body)).toBe(body);
  });

  it("strips leading bullets and quote markers without eating in-word hyphens", () => {
    expect(markdownExcerpt("- blue-green deploys\n> ship it")).toBe(
      "blue-green deploys ship it",
    );
  });

  it("unwraps _emphasis_ but leaves an identifier's underscores alone", () => {
    expect(markdownExcerpt("_Shipped_ the user_id migration")).toBe(
      "Shipped the user_id migration",
    );
  });

  it("truncates with an ellipsis past the max length", () => {
    const excerpt = markdownExcerpt("word ".repeat(60), 20);
    expect(excerpt.endsWith("…")).toBe(true);
    expect(excerpt.length).toBeLessThanOrEqual(21);
  });
});
