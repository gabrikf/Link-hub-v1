---
name: i18n
description: The migration guide for adding internationalisation to LinkHub's web app — react-i18next with pt-BR, en-US and es-ES. Use when the user asks to add i18n, translate the UI, support another language, extract hardcoded strings, or when you are about to write user-visible text and need to know whether it should go through t(). LinkHub has NO i18n today; this skill is the plan, not a description of existing code.
---

# i18n — the plan, not the present

## Read this first: there is no i18n in LinkHub today

Zero i18next. Zero react-intl. No locale files, no provider, no `t()`. Every
user-visible string in `apps/web` is a hardcoded English literal and
`index.html` says `<html lang="en">`.

**So: do not invent `t()` calls.** Do not add an i18n library because a string
looked translatable. Do not create `apps/web/src/i18n/` speculatively. Writing
`t('dashboard.title')` against a translation function that does not exist
produces a screen that renders raw keys — a worse outcome than English text.

Write plain English strings. This skill is what to do **when the user actually
asks for i18n**, and how to write strings today so that migration is mechanical
rather than archaeological.

---

## Writing strings today so the migration is cheap

You are not doing i18n. You are avoiding the three things that make it painful:

1. **Keep user-visible text at the JSX leaf.** A string assembled from three
   variables three call sites away cannot be extracted without rewriting the
   logic. Build the sentence where it is rendered.
2. **Never concatenate a sentence from fragments.**
   `"Deleted " + count + " posts"` is untranslatable — word order and
   pluralisation differ per language. Write the whole sentence, with the
   variable interpolated, as one literal.
3. **Do not put user-visible text in a constant far from its use**, especially
   not in a shared `constants.ts`. It hides the string from extraction and from
   the reviewer.

Follow those three and the eventual migration is find-and-replace. Ignore them
and it is a refactor.

---

## The target setup

### Locales

Three, and they ship together:

| Locale | Notes |
|---|---|
| `pt-BR` | Brazilian Portuguese |
| `en-US` | English — the source language, since every existing string is already English |
| `es-ES` | Spanish (Spain) |

```
apps/web/src/i18n/
  index.ts                 i18next init, imported once from main.tsx
  locales/
    pt-BR.json
    en-US.json
    es-ES.json
```

### Library

**react-i18next**, not react-intl. Reasons that matter here: the hook API
(`useTranslation`) fits the existing function-component codebase with no
provider gymnastics; `Trans` handles the inline-markup cases (a link inside a
sentence) that this app has on the profile and settings pages; and language
detection plus lazy locale loading come as maintained plugins rather than
hand-rolled code.

Consult **context7** for the current react-i18next API before writing the init —
it has changed shape across majors and a remembered example will be wrong.

### Init sketch (do not write this until asked)

- `initReactI18next`, `fallbackLng: "en-US"`, `supportedLngs` listing all three.
- Detection order: an explicit user preference first, then `navigator.language`.
  Persist the choice in `localStorage`, next to `linkhub-theme` — the same
  pattern `src/lib/theme.ts` already uses.
- **Update `<html lang>` when the language changes.** It is currently hardcoded
  to `en`. Screen readers pick pronunciation from it, and leaving it stale is a
  real accessibility defect, not a nicety.
- `returnNull: false` so a missing key renders the key rather than `null`,
  which turns a translation gap into something visible instead of an empty box.

---

## Key naming — the rules that keep the file usable

These are the rules that decide whether the locale file is 200 reusable keys or
2000 duplicates. They are not style preferences.

### 1. Reuse before you create

**Always search the locale file for the TEXT before adding a key.** Search by
value, not by key name. If `"save": "Save"` exists, write `t('save')`. Never add
`saveButton`, `formSave`, `profileSaveLabel`.

### 2. Name by meaning, never by location

A key must be reusable on a screen that does not exist yet. Naming it after
where it first appeared guarantees the next screen adds a duplicate.

| Good | Bad |
|---|---|
| `save`, `cancel`, `delete`, `requiredField`, `noDataFound` | `dashboardSave`, `settingsCancelButton`, `profileEmptyState` |

Namespace only where the text is genuinely domain-specific and would be
ambiguous on its own:

```
common.save
common.cancel
profile.openToWork
search.aiMatchPercent
posts.awaitingReview
```

### 3. Changing an existing key's value is dangerous

A key may be used on many screens. Editing its value silently changes text
everywhere.

- **If the key is used in more than one place → create a NEW key** with the new
  text and use it only where asked. Leave the old key alone.
- Only edit a value in place after confirming — by searching the codebase for
  every usage — that it is used in exactly one place, or the user explicitly
  asked to change it everywhere.
- Before deleting any key, search for every usage. A deleted key that is still
  referenced renders as the raw key string in production.

### 4. Every key exists in all three locales, immediately

Add to `pt-BR.json`, `en-US.json` **and** `es-ES.json` in the same commit. A key
that exists in one locale is a bug waiting for a user with a different browser
language. If a translation is not ready, put the English text in as a
placeholder — visible-but-wrong beats a raw key on screen.

`scripts/guardrails/i18n-parity.mjs` enforces this. It already runs in the gate
and is a no-op until `apps/web/src/i18n/locales/` exists — the day the first
locale file lands, parity is enforced automatically. Nobody has to remember.

---

## Interpolation and plurals

```jsonc
{
  "posts.deletedCount_one": "Deleted {{count}} post",
  "posts.deletedCount_other": "Deleted {{count}} posts"
}
```

- Use i18next's `count` plural suffixes. **Do not** write
  `t('deleted') + count + t('posts')` — Portuguese and Spanish have different
  agreement rules and English's "1 post / 2 posts" split does not generalise.
- pt-BR and es-ES both use `_one` / `_other`. Getting this right for three
  languages is exactly what the library is for.
- Dates and numbers go through `Intl.DateTimeFormat` / `Intl.NumberFormat` with
  the active locale — never a hand-rolled `toLocaleDateString('en-US')` and
  never a manual `dd/MM/yyyy`.

---

## The lint rule — turn it on WITH the migration, not before

`eslint-plugin-i18next`, rule `i18next/no-literal-string`:

```js
{
  plugins: { i18next },
  rules: {
    "i18next/no-literal-string": ["warn", {
      mode: "jsx-text-only",
      "should-validate-template": true,
      callees: { exclude: ["t", "i18nKey", "console.*", "reportError", "reportHandled"] },
    }],
  },
}
```

Three deliberate choices:

- **`warn`, not `error`.** apps/web already carries 30 recorded eslint errors
  (see `.github/workflows/ci.yml`). Adding several hundred more as errors would
  break the ratchet the day it is enabled and teach everyone to ignore lint.
  Start at `warn`, migrate screen by screen, promote to `error` at zero.
- **`jsx-text-only`.** The full mode flags every string literal in the file —
  class names, query keys, route paths, `data-testid` values — which is almost
  entirely noise in a Tailwind codebase where the longest literals are class
  strings.
- **`t` in the exclude list**, or the rule flags the key you just passed to it.

Do not enable this until the migration is actually underway. A rule that fires
hundreds of times on day one is a rule people configure away.

---

## Migration order, when the user asks

1. Install `i18next`, `react-i18next`, `i18next-browser-languagedetector`.
   Check current APIs with **context7** first.
2. Create `apps/web/src/i18n/index.ts` and three locale files, each with the
   same starting key set. Import the init once, from `main.tsx`.
3. Make `<html lang>` follow the active language.
4. Add a language switcher — settings page, next to the theme toggle.
5. Migrate **one feature at a time**, starting with the highest-traffic screen
   that is also the most self-contained. Run `npm run i18n:parity` and the full
   gate after each feature; do not migrate the whole app in one commit.
6. Enable `i18next/no-literal-string` as `warn` once the first feature is done,
   so new code is caught while old code is still being converted.
7. When the warning count reaches zero, promote it to `error` and delete this
   step from the plan.

**The public profile (`/profile/$username`) is the highest-stakes screen.** It is
the page strangers see, it is the product's shareable artifact, and it is
public — a raw key visible there is visible to everyone, not just to a signed-in
user who can be told to reload. Migrate it carefully and verify it with a visual
scenario in all three locales:

```bash
npm run visual:run -- scripts/visual/scenarios/public-profile.scenario.mjs
```

---

## What is explicitly out of scope

- **The api.** Server-side error messages are not currently localised and this
  plan does not change that. If localised api errors are wanted, the api returns
  a machine-readable error **code** and the web app translates it — the api must
  not return translated prose, because the mcp server and the extractor are also
  consumers and they are not browsers.
- **User-generated content.** Profile bios, post bodies and resume text are the
  user's own words. Never machine-translate them.
- **Seed data.** `seed-realistic.ts` fixtures stay English.
