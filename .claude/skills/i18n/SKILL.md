---
name: i18n
description: How internationalisation works in LinkHub's web app — react-i18next with pt-BR, en-US and es-ES, already shipped. Use when adding or changing any user-visible string, adding a locale, touching apps/web/src/i18n/, or when a guardrail reports a raw string or an unresolved key. Every user-visible string in apps/web goes through t(); this skill is the contract for keeping it that way.
---

# i18n — how it works, and the rules that keep it usable

## Read this first: i18n is live

`apps/web` runs **react-i18next** with three locales. Every user-visible string
goes through `t()`, `<html lang>` follows the active language, and two gate
checks fail the build if either stops being true.

```
apps/web/src/i18n/
  index.ts                 i18next init, imported once (for its side effect) from main.tsx
  locales/
    pt-BR.json
    en-US.json             the source language and the fallback
    es-ES.json
apps/web/src/lib/language.ts   detection, persistence, <html lang>
```

`lib/language.ts` deliberately mirrors `lib/theme.ts`: read `localStorage`, fall
back to the environment, apply to the document, persist on change. It also
widens a browser tag onto a shipped locale before i18next sees it — a browser
reporting `pt`, `pt-PT` or `es-419` is a real user who should get a translated
app, and i18next's own `supportedLngs` check is exact-match.

**So: do not write a bare English string in JSX.** Not in a JSX text node, not
in `placeholder`, `title`, `alt` or `aria-label`. The gate will catch it, but
the point is that a raw string is a string a Brazilian user reads in English.

---

## Writing strings so they stay translatable

1. **Keep user-visible text at the JSX leaf.** A string assembled three call
   sites away cannot be extracted without rewriting the logic.
2. **Never concatenate a sentence from fragments.** `"Deleted " + count + " posts"`
   is untranslatable — word order and pluralisation differ per language. Write
   the whole sentence, with the variable interpolated, as one key.
3. **Do not park user-visible text in a module-level constant.** If a catalogue
   genuinely has to live at module scope, make it a function of `t` — a
   module-scope `i18n.t()` is evaluated once at import time and freezes the
   first language for the life of the tab, which the live language switcher
   makes visible. Where the shape cannot change because another feature imports
   it as a plain `Record`, use a `get label()` accessor: same type, resolved on
   every read.

---

## The setup

### Locales

Three, and they ship together:

| Locale | Notes |
|---|---|
| `pt-BR` | Brazilian Portuguese |
| `en-US` | English — the source language, and the fallback |
| `es-ES` | Spanish (Spain) |

Region tags are deliberate: `pt-BR` is not `pt-PT` and `es-ES` is not `es-419`,
and pretending otherwise produces translations that read as foreign to half the
audience.

### Library

**react-i18next**, not react-intl. Reasons that matter here: the hook API
(`useTranslation`) fits the function-component codebase with no provider
gymnastics, and `Trans` handles the inline-markup cases — a `<code>` or a link
inside a sentence — that the settings and layout pages have.

There is no `i18next-browser-languagedetector`. Detection is ~30 lines in
`lib/language.ts` instead, because the plugin's `supportedLngs` matching is
exact and would send a browser reporting plain `pt` to the English fallback.
Doing it by hand also makes it unit-testable.

Consult **context7** before changing the init — the i18next API has moved across
majors (this repo runs i18next 26 / react-i18next 17) and a remembered example
will be wrong.

### How the init is set up, and why

- `initReactI18next`, `fallbackLng: "en-US"`, `supportedLngs` listing all three.
- **All three catalogues are bundled, not fetched.** A backend plugin buys lazy
  loading and costs a frame of raw keys on first paint plus a race that renders
  English when the network is slow. `initAsync: false` makes the first render
  already have the catalogue.
- Detection order: the stored preference first, then `navigator.languages`,
  walked in order — a machine set to `["de-DE", "pt-BR", "en-US"]` gets
  Portuguese, not English.
- `returnNull: false` and `returnEmptyString: false`, so a missing key renders
  as the key. Ugly on purpose: `common.save` on screen is a bug report, an empty
  button is a mystery.
- `escapeValue: false` — React escapes already, and letting i18next escape too
  double-encodes apostrophes.
- **`<html lang>` follows the active language** via the `languageChanged` event.
  `index.html` ships a static `en`; screen readers take pronunciation from this
  attribute and a stale value is a real accessibility defect.
- There is deliberately **no `CustomTypeOptions`** declaration. Typing
  `resources` as `typeof enUS` does turn a mistyped key into a compile error,
  but measured on this catalogue it added 14 seconds to a cold `tsc -b` at 265
  keys — and the catalogue is over a thousand. `i18n-raw-strings.mjs` checks
  every `t("…")` against `en-US.json` instead: same bug caught, ~0.1s, and it
  also finds keys nothing renders.

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
| `common.save`, `common.cancel`, `common.delete`, `common.tryAgain` | `dashboard.save`, `settings.cancelButton`, `profile.emptyState` |

Everything reusable lives under `common.*`. A `<feature>.*` namespace is for
text that is genuinely domain-specific and would be ambiguous on its own:

```
common.save
common.cancel
profile.openToWork
search.matchExplainer
posts.reviewQueue
```

`enum.*` is a third case: closed sets that belong to the domain rather than to
any one feature — work model, contract type, seniority, spoken languages,
months. Before this existed, `resume`, `search` and `work-history` each had
their own name for the same six contract types.

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

`scripts/guardrails/i18n-parity.mjs` enforces this in the gate. Nobody has to
remember.

### 5. Enum leaves are named by the wire value

`enum.contractType["full-time"]`, `enum.workModel["on-site"]`,
`enum.persona["qa-engineer"]`. That lets a call site write
``t(`enum.contractType.${value}`)`` with no lookup table — and it keeps the
distinction that matters visible: **translate the label, never the value.**
Every `value` in a `{value, label}` option array goes to the API and is matched
server-side. A translated value is a silently broken search.

Where a value may not be in the catalogue (data from the API rather than a
closed set), pass `{ defaultValue: raw }` so an unknown value renders as itself
rather than as a raw key.

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

## The two gate checks

`npm run i18n:check` runs both; the gate runs them too, and both are
sub-second.

**`i18n-parity.mjs`** — every locale holds the same key set (deep, dotted
paths), no empty values, valid JSON. It guards the failure it was written for:
somebody adds a key to `en-US` and ships, and `pt-BR` renders the raw key three
weeks later in front of a user.

**`i18n-raw-strings.mjs`** — the other half. Parity says nothing about the
string that never became a key. It walks every `.tsx` in `apps/web/src` with a
small JSX-aware scanner and reports visible text outside `t()`, plus the
`placeholder`, `title`, `alt` and `aria-label` attributes. It also checks that
every `t("…")` and `i18nKey="…"` resolves in `en-US.json`, and that every key in
`en-US.json` is reachable from the code.

Its known limit, worth knowing before you trust it: **it only reads JSX.** A
user-visible string built in a plain `.ts` helper or a template literal is
invisible to it. Those exist — `lib/auth-api.ts` error messages, for instance —
and they are covered by review, not by the scanner. Extending it to arbitrary
TypeScript was tried and produced mostly false positives; a check that cries
wolf gets switched off in a week.

---

## The lint rule — optional, not enabled

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

This is **not** enabled today. The two gate checks above already cover the same
ground more precisely and without touching the recorded eslint ratchet in
`.github/workflows/ci.yml`. Enable it only if you want editor-time feedback,
and start at `warn`.

---

## Adding a fourth locale

1. Add the tag to `SUPPORTED_LANGUAGES` and `PRIMARY_SUBTAG_TO_LANGUAGE` in
   `apps/web/src/lib/language.ts`, and to `EXPECTED_LOCALES` in
   `scripts/guardrails/i18n-parity.mjs`.
2. Add the locale file with the **complete** key set — parity will tell you
   exactly which keys are missing, by name.
3. Add the code and endonym to `LANGUAGE_LABELS` in
   `shared-components/language-toggle.tsx`, and the endonym key under
   `enum.uiLanguage.*` in all locale files. The endonym is not translated: a
   speaker who cannot read the interface still recognises their own language's
   name.
4. Register it in `LOCALES` in the visual scenario below and run it.

## Verifying a change

**The public profile (`/profile/$username`) is the highest-stakes screen.** It is
the page strangers see, it is the product's shareable artifact, and it is
public — a raw key visible there is visible to everyone, not just to a signed-in
user who can be told to reload.

```bash
npm run visual:run -- scripts/visual/scenarios/i18n-locales.scenario.mjs
```

One run walks it in all three locales and both themes and asserts the two things
an eye is bad at: that no raw key reached the screen, and that nothing scrolls
sideways. Portuguese and Spanish run 15-25% longer than English, so a button
sized to "Save" splits at "Guardar cambios" — invisible to anyone developing in
English.

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
