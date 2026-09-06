# Dark mode — detection heuristic and the screenshot checklist

Read this after you have captured both themes (SKILL.md §3) and need a way to double-check a surface
that looks suspicious, or a checklist to run down before calling a dark screenshot done.

---

### When `setTheme` throws

It throws when the theme it was asked for is not what the page ended up painted — deliberately, and
after a settle window, because returning a light screenshot under a dark filename is the failure this
helper exists to prevent. The message carries the painted theme, `documentElement.style.colorScheme`
and the computed body background, so start there. Two causes account for almost all of them:

- **The scenario mocks `**/preferences`itself with a body that carries no`theme`key.**`setTheme`re-themes a preferences mock in place (so a pinned`language`survives) but leaves a mock without a`theme`alone, because a`500`or a`delay: Infinity`on this endpoint is usually the point of the
capture. Give that mock a`theme`, or drop it.
- **The scenario is also driving the real theme toggle.** Clicking it persists a preference through
  `PATCH /preferences`, which `setTheme` deliberately does not intercept. Pick one mechanism per
  scenario — `dialog-chrome.scenario.mjs` is the worked example of driving the control.

### `seedStoredTheme(preference)` — the seed-only half

Writes `localStorage["crafthub-theme"]` and reloads, and makes **no claim** about what paints. It
exists for one kind of check: proving the DATABASE beats a stale local mirror, which is what
`app-boot.scenario.mjs` asserts. There, a page that ignores the seed is the pass — so it must not go
near `setTheme`'s assertion. If you want a dark screenshot, you want `setTheme`.

### Emulating the OS preference (the "also valid" alternative to `setTheme`)

For a first-visit user with nothing stored in `localStorage["crafthub-theme"]`, emulating the OS
preference is also a valid, deterministic way to reach dark mode:

```js
await page.emulateMedia({ colorScheme: "dark" });
await page.reload();
```

This is unverified, unlike `setTheme` — nothing checks that dark is what ended up painted, and for a
SIGNED-IN account it will not be, because `app-boot.ts` applies the account's stored preference over
whatever the OS said. Use it for anonymous first-visit checks; use `setTheme('dark')` everywhere
else. (`setTheme('system')` combines the two honestly: it resolves the OS preference in the page and
asserts against that.)

### The missing-`dark:` heuristic

An element whose computed background is **identical in both themes** usually has no `dark:` variant.
It is a heuristic, not a proof — some elements are intentionally theme-independent (brand colors, a
cover image, a fixed-color badge) — so treat a hit as "go look at it", not as a failure:

```js
const bgIn = async (selector) =>
  page.evaluate(
    (s) => getComputedStyle(document.querySelector(s)).backgroundColor,
    selector,
  );

await setTheme("light");
const light = await bgIn('[data-testid="profile-card"]');
await setTheme("dark");
const dark = await bgIn('[data-testid="profile-card"]');
assert(
  light !== dark,
  "profile card background changes between themes (has a dark: variant)",
);
```

### Dark-mode checklist for the screenshot

- Text contrast on every surface — including muted/secondary text and placeholder text.
- Borders still visible (the `zinc-700` vs `zinc-800` distinction `surface.ts` exists to keep
  consistent).
- Icons (`react-icons` `fi` set) not black-on-dark.
- Translucent surfaces (`SURFACE_PROFILE`, `SURFACE_GLASS`) still readable over the user's accent
  color and cover image.
- Focus rings still visible.
- Charts / AI Match % indicators still legible.
- Radix dialog overlays and their content, in both themes.
