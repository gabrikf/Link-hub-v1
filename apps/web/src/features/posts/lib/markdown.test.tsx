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

  it("never lets user input emit a <br> — every break is one we injected", () => {
    // A user typing the literal characters `<br>` must get inert text. The only
    // live <br> elements in the output are the ones the soft-line-break rule
    // put there, so the count matches the number of single newlines, not the
    // number of `<br>` strings the user typed.
    const { container } = render(
      <Markdown>{"<br><br>a\n<br />b<br/>"}</Markdown>,
    );

    expect(container.querySelectorAll("br")).toHaveLength(1);
    expect(container.textContent).toContain("<br>");
    expect(container.textContent).toContain("<br />");
  });

  it("cannot be tricked into folding an injected <br /> into a link href", () => {
    // The break lands between the scheme and the rest of the URL. Because the
    // injected marker carries a space and the URL group rejects whitespace, the
    // link simply does not match — no href is produced at all.
    const html = markdownToHtml("[x](https://evil\n.example.com)");

    expect(html).not.toContain("href=");
    expect(html).not.toMatch(/<a\s/);
  });

  it("escapes a raw <br> inside a list item too", () => {
    const html = markdownToHtml("• <br>one");

    expect(html).toContain("<li>&lt;br&gt;one</li>");
  });
});

describe("markdownToHtml — line breaks", () => {
  it("turns a single newline inside a paragraph into a hard line break", () => {
    const html = markdownToHtml(
      "Led the payments team.\nShipped the new checkout.",
    );

    expect(html).toBe(
      "<p>Led the payments team.<br />Shipped the new checkout.</p>",
    );
  });

  it("does not glue the two lines together with a space", () => {
    const html = markdownToHtml("first\nsecond");

    expect(html).not.toContain("first second");
  });

  it("starts a new paragraph on a blank line", () => {
    const html = markdownToHtml("first\n\nsecond");

    expect(html).toBe("<p>first</p>\n<p>second</p>");
  });

  it("renders a multi-line description as one paragraph per blank-line block", () => {
    const { container } = render(
      <Markdown>{"Owned billing.\nOwned payouts.\n\nAlso on-call."}</Markdown>,
    );

    expect(container.querySelectorAll("p")).toHaveLength(2);
    expect(container.querySelectorAll("br")).toHaveLength(1);
  });

  it("keeps inline emphasis working across a soft line break", () => {
    const html = markdownToHtml("**bold\ntext**");

    expect(html).toContain("<strong>bold<br />text</strong>");
  });

  it("leaves fenced code blocks untouched by the line-break rule", () => {
    const html = markdownToHtml("```\nconst a = 1;\nconst b = 2;\n```");

    expect(html).not.toContain("<br />");
    expect(html).toContain("const a = 1;\nconst b = 2;");
  });
});

describe("markdownToHtml — resume bullet glyphs", () => {
  it("renders a • list as a real <ul>", () => {
    const html = markdownToHtml("• Led the payments team\n• Shipped checkout");

    expect(html).toMatch(/<ul[^>]*>/);
    expect(html).toContain("<li>Led the payments team</li>");
    expect(html).toContain("<li>Shipped checkout</li>");
    expect(html).not.toContain("•");
  });

  it("recognises ▪ ◦ ‣ ● ∙ as bullets too", () => {
    const html = markdownToHtml("▪ a\n◦ b\n‣ c\n● d\n∙ e");

    expect(html.match(/<li>/g)).toHaveLength(5);
    expect(html).toContain("<li>a</li>");
    expect(html).toContain("<li>e</li>");
  });

  it("recognises a middle dot or dash used as a bullet", () => {
    const html = markdownToHtml("· first\n– second\n— third");

    expect(html.match(/<li>/g)).toHaveLength(3);
    expect(html).toContain("<li>first</li>");
    expect(html).toContain("<li>third</li>");
  });

  it("accepts a glyph with no space after it, as PDFs often emit", () => {
    expect(markdownToHtml("•Shipped checkout")).toContain(
      "<li>Shipped checkout</li>",
    );
  });

  it("leaves a dash that starts prose alone", () => {
    const html = markdownToHtml("—she said, and left.");

    expect(html).not.toContain("<li>");
    expect(html).toContain("<p>");
  });

  it("mixes a lead-in paragraph with a bullet list", () => {
    const html = markdownToHtml("Payments lead.\n\n• Rebuilt the ledger\n• Halved chargebacks");

    expect(html).toContain("<p>Payments lead.</p>");
    expect(html).toMatch(/<ul[^>]*>/);
    expect(html.match(/<li>/g)).toHaveLength(2);
  });

  it("closes the list before the prose that follows it", () => {
    const html = markdownToHtml("• one\n\nclosing thought");

    expect(html).toContain("</ul>");
    expect(html.indexOf("</ul>")).toBeLessThan(
      html.indexOf("closing thought"),
    );
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
