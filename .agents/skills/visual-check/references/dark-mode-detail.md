# Dark mode — detection heuristic and the screenshot checklist

Read this after you have captured both themes (SKILL.md §3) and need a way to double-check a surface
that looks suspicious, or a checklist to run down before calling a dark screenshot done.

---

### Emulating the OS preference (the "also valid" alternative to `setTheme`)

For a first-visit user with nothing stored in `localStorage["crafthub-theme"]`, emulating the OS
preference is also a valid, deterministic way to reach dark mode:

```js
await page.emulateMedia({ colorScheme: 'dark' });
await page.reload();
```

### The missing-`dark:` heuristic

An element whose computed background is **identical in both themes** usually has no `dark:` variant.
It is a heuristic, not a proof — some elements are intentionally theme-independent (brand colors, a
cover image, a fixed-color badge) — so treat a hit as "go look at it", not as a failure:

```js
const bgIn = async (selector) =>
  page.evaluate((s) => getComputedStyle(document.querySelector(s)).backgroundColor, selector);

await setTheme(page, 'light');
const light = await bgIn('[data-testid="profile-card"]');
await setTheme(page, 'dark');
const dark = await bgIn('[data-testid="profile-card"]');
assert(light !== dark, 'profile card background changes between themes (has a dark: variant)');
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
