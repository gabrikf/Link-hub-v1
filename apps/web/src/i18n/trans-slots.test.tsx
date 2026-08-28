import { render, screen } from "@testing-library/react";
import { Trans } from "react-i18next";
import { describe, expect, it } from "vitest";
import i18n from "./index";
import { SUPPORTED_LANGUAGES } from "../lib/language";

/**
 * Four catalogue entries carry markup: a sentence with a link, a bolded post
 * title, a bolded lead sentence, and the token-scope paragraph with two inline
 * `<code>` spans and a plural. Their slots are NAMED (`<link>`, `<strong>`,
 * `<title>`, `<token>`, `<scopes>`) rather than numbered, which is a contract
 * between the locale value and the `components` object at the call site.
 *
 * Nothing else catches a break here. A renamed slot, or a slot that survived in
 * en-US and was dropped from pt-BR, does not render a raw key — it renders the
 * literal text `<link>` to a user, or silently swallows the clause. The visual
 * scenario's raw-key regex would pass either way.
 */

/** Every key that uses a named slot, with the tags its value must contain. */
const MARKUP_KEYS = [
  { key: "wizard.source.workInherits", slots: ["policyLink"] },
  { key: "wizard.verify.postDetected", slots: ["title"] },
  { key: "wizard.token.shownOnce", slots: ["strong"] },
  { key: "wizard.token.scopeRequirement_one", slots: ["token", "scopes"] },
  { key: "wizard.token.scopeRequirement_other", slots: ["token", "scopes"] },
  { key: "layout.editingViewport", slots: ["strong"] },
  { key: "settings.connect.replacePlaceholder", slots: ["code"] },
  { key: "settings.connect.houseStyle", slots: ["uri"] },
  { key: "settings.connect.tokenNotice", slots: ["strong"] },
  { key: "settings.connect.profileReadScope", slots: ["code"] },
  { key: "settings.createToken.useAsEnvVar", slots: ["code"] },
  { key: "settings.how.badCommitsBody", slots: ["code"] },
  { key: "settings.setup.secretShownOnce", slots: ["strong"] },
  { key: "wizard.schedule.claudeCodeHint", slots: ["cmd"] },
] as const;

const localeResource = (locale: string) =>
  i18n.getResourceBundle(locale, "translation") as Record<string, unknown>;

const readKey = (locale: string, key: string): string => {
  const value = key
    .split(".")
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === "object"
          ? (node as Record<string, unknown>)[part]
          : undefined,
      localeResource(locale),
    );
  expect(typeof value, `${locale} is missing ${key}`).toBe("string");
  return value as string;
};

describe("Trans markup slots", () => {
  it.each(SUPPORTED_LANGUAGES)(
    "%s declares every named slot on every markup key",
    (locale) => {
      for (const { key, slots } of MARKUP_KEYS) {
        const value = readKey(locale, key);
        for (const slot of slots) {
          expect(value, `${locale} / ${key} lost the <${slot}> slot`).toContain(
            `<${slot}>`,
          );
          expect(value, `${locale} / ${key} lost the </${slot}> slot`).toContain(
            `</${slot}>`,
          );
        }
      }
    },
  );

  it.each(SUPPORTED_LANGUAGES)(
    "%s renders a named slot as the mapped element, not as literal text",
    async (locale) => {
      await i18n.changeLanguage(locale);

      render(
        <Trans
          i18nKey="wizard.source.workInherits"
          components={{ policyLink: <a href="#disclosure" /> }}
        />,
      );

      // The anchor exists and carries the sentence's own words...
      const link = screen.getByRole("link");
      expect(link).toHaveAttribute("href", "#disclosure");
      expect(link.textContent?.trim().length).toBeGreaterThan(0);
      // ...and the tag itself never reaches the user as text.
      expect(document.body.textContent).not.toContain("<policyLink>");
    },
  );

  it.each(SUPPORTED_LANGUAGES)(
    "%s keeps the post title verbatim inside its emphasis slot",
    async (locale) => {
      await i18n.changeLanguage(locale);

      // A real title, in the user's own words — it must survive untranslated.
      const postTitle = "Shipped the layout editor";
      render(
        <Trans
          i18nKey="wizard.verify.postDetected"
          values={{ postTitle }}
          components={{ title: <strong /> }}
        />,
      );

      expect(screen.getByText(postTitle).tagName).toBe("STRONG");
      expect(document.body.textContent).not.toContain("<title>");
    },
  );

  it.each(SUPPORTED_LANGUAGES)(
    "%s picks the singular scope wording for one scope and the plural for two",
    async (locale) => {
      await i18n.changeLanguage(locale);

      const one = render(
        <Trans
          i18nKey="wizard.token.scopeRequirement"
          count={1}
          values={{ scopes: "posts:write" }}
          components={{ token: <code />, scopes: <code /> }}
        />,
      );
      const singular = one.container.textContent ?? "";
      one.unmount();

      const many = render(
        <Trans
          i18nKey="wizard.token.scopeRequirement"
          count={2}
          values={{ scopes: "posts:write activity:write" }}
          components={{ token: <code />, scopes: <code /> }}
        />,
      );
      const plural = many.container.textContent ?? "";

      expect(singular).not.toBe(plural);
      expect(singular).toContain("LINKHUB_API_TOKEN");
      expect(plural).toContain("LINKHUB_API_TOKEN");
      expect(singular).not.toContain("<token>");
      expect(plural).not.toContain("<scopes>");
    },
  );

  it("leaves the app back on the source language for the next test file", async () => {
    await i18n.changeLanguage("en-US");
    expect(i18n.resolvedLanguage).toBe("en-US");
  });
});
