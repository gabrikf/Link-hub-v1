# Edge Cases

This file catalogs the **non-technical** edge cases real users hit. These are not unit-test edge cases (null inputs, integer overflow, malformed JSON) — those are unit/integration concerns. These are *user-behavior* edge cases that scripted tests miss because they live in the seams between intent and software.

Use during Step 4 of `qa-execution` (tours & edge probes). Pair each with a persona and one tour from the tour catalog (routed together with this file at Step 4 of the SKILL).

## Contents

- Why this catalog exists
- Catalog
  - **Disclosure & agent-authored content edges** (read this one first)
  - Navigation edges
  - Form & input edges
  - Session & auth edges
  - Network & timing edges
  - Device, viewport & theme edges
  - Accessibility edges
  - Interrupt edges
  - Trust & recovery edges
- How to use this catalog
- What is NOT in scope here
- Sources

## Why this catalog exists

> "Try doing unconventional actions like rapidly double-clicking buttons or links to see if the application can handle the extra events gracefully. Using the browser back and refresh buttons in the middle of a multi-step workflow… entering form fields out of order… real users might try [these]." — Testlio, *Exploratory Testing 101*

A scripted test always submits a form once, in order, with valid data, from a single tab, on a stable network, in light mode. A real user does none of those things consistently — and in CraftHub, one of the "users" is an autonomous agent that writes publicly about someone's job.

## Catalog

### Disclosure & agent-authored content edges

**The highest-value section in this file.** CraftHub's defining risk is an agent revealing an employer name, a client, a repository, an internal codename or a blocked term above the level the user chose. Every charter touching posts, settings or the MCP surface draws at least two edges from here.

| Edge case | What to try | What it surfaces |
|---|---|---|
| Tighten the policy after publishing | Publish a post naming the employer under a permissive level, then set the policy to its strictest level | Whether enforcement is retroactive or only applies to new posts — an old post still naming the employer on the public profile is a leak |
| Blocked term in disguise | Add a blocked term, then feed the agent that term lowercased, hyphenated, camel-cased (`AcmeCorpClient`), inside a URL, inside a file path, inside a quoted commit message | Naive substring matching; a filter that only checks the title; a filter that runs on the body but not the summary |
| Blocked term with invisible characters | Paste the term with a non-breaking space or a zero-width joiner inside it | A filter defeated by whitespace normalization that never happened |
| Policy tool unavailable | Have the agent publish while `get_disclosure_policy` errors or returns nothing | **Which way the default fails.** Defaulting to "publish anyway" is a leak; defaulting to "refuse" is correct |
| Policy never configured | Publish as a user who never opened the settings screen | Whether an unset policy is treated as permissive |
| Redaction only skin-deep | Read the same post through the UI, `list_my_posts`, and the public API payload | A body redacted at render time but stored — and served — intact |
| Edit after approval | Approve a post, then `update_post` it from the agent side with new content | Whether an edited post re-enters review or goes straight live |
| Delete after publish | `delete_post` a leaked post, then check the public profile, a cached page, and any feed | Whether "take it back" actually takes it back |
| Work context richer than the policy | Compare `get_work_context`'s payload field by field against what the policy allows | A context payload that hands the agent facts it must not use — the leak is one prompt away |
| Agent posts for the wrong user | Use an API token minted for user A while acting as user B | Token/ownership boundary; a post landing on someone else's profile |
| Two agents, one profile | Publish from two agent sessions concurrently | Double-posting, one policy read racing the other's write |
| Logged-out read | Read the profile of a user with a strict policy while signed out | What a stranger — a recruiter, an employer, a journalist — actually sees |
| Extractor over a private repo | Point the extractor at a repository whose name is itself sensitive | Whether the repo name reaches the post, the hash, or the UI |

### Navigation edges

| Edge case | What to try | What it surfaces |
|---|---|---|
| Refresh during submit | Click submit, refresh before the response arrives | Double-submit, lost confirmation, ghost record |
| Back button after success | Reach a "profile published" or "post approved" screen, press back | Cached success state, re-fire of the action |
| Back button mid-form | Fill half the resume-import form, press back, return | Lost data, stale state |
| Forward after back | Back → Forward → back → forward | URL state desync in the code-based TanStack Router tree |
| Deep-link mid-flow | Bookmark `/dashboard/posts/review`, visit it tomorrow | Missing prerequisites, auth-redirect loops |
| Close-and-reopen tab | Close the tab during a resume import, reopen immediately | Lost progress vs successful background completion |
| Same URL in two tabs | Rearrange the layout in both, save in one, refresh the other | Stale read, lost update |
| Visit a nonexistent profile | `/definitely-not-a-user` | 404 UX, recovery links, whether it leaks whether the username exists |

### Form & input edges

| Edge case | What to try | What it surfaces |
|---|---|---|
| Double-click submit | Click submit twice within 200ms | Duplicate post, duplicate token, duplicate search |
| Tab through form out of order | Click field 5, then 2, then 8 | Tab-index bugs, validation at the wrong moment |
| Submit with autofill | Let the browser autofill sign-up, submit immediately | Race between fill and validate; a username claimed from a value nobody read |
| Paste a whole JD | Paste 40 lines of requirements into the search box | Line-break loss, truncation before embedding, layout overflow |
| Paste from a PDF | Copy from a rendered PDF (soft hyphens, ligatures) | Broken tokens reaching the embedding, garbled display |
| Empty submit | Submit search / post / settings with nothing filled | Validation copy quality, error proximity, focus management |
| Upload the wrong thing | Upload a `.docx` renamed `.pdf`, a 0-byte file, a scanned image-only PDF, a 60-page PDF | Silent failure, a half-imported profile the user can't undo |
| Drop a file outside the drop zone | Drag a PDF onto the page background | Browser navigates to the file URL — losing unsaved layout work |
| Drag a block onto itself | In `/dashboard/layout`, drag a block back to its own slot | dnd-kit / react-grid-layout state corruption |
| Collapse everything | Drag every profile block into one column, then reload | Whether the arrangement round-trips |

### Session & auth edges

| Edge case | What to try | What it surfaces |
|---|---|---|
| Session expiry mid-form | Start a long edit, wait for the JWT to expire, submit | Lost data on redirect to `/`, confused post-login state |
| Login as someone else in another tab | Sign in as the recruiter in tab B, return to tab A as a candidate | Cross-tab session contamination, wrong-user writes |
| Logout in another tab | Log out in tab B while tab A has an unsaved arrangement | Tab A acting on a dead session, silent failures |
| Sign in twice rapidly | Click Google sign-in twice during the OAuth roundtrip | Stuck state, double-redirect, double account creation |
| Password manager mismatch | Let a manager fill a stale password | Login fails with an error the manager can't see |
| Cookies blocked | Visit with third-party cookies blocked | OAuth flows that silently break, especially in Safari |
| API token revoked mid-run | Revoke the agent's token in settings while it is mid-publish | Whether the failure is legible on both sides |
| Token in the wrong scope | Use a read-scoped token to publish | Boundary enforcement, error copy |

### Network & timing edges

| Edge case | What to try | What it surfaces |
|---|---|---|
| Slow 3G | Throttle the network | Optimistic UI showing success on failure; spinners with no timeout |
| Flaky network | Toggle offline mid-request | Lost data, no retry, no offline indicator |
| Long-running import | Trigger a resume import that takes >30s | Timeout UX, "still working" indicator, cancellable? |
| Submit while offline | Disable network, submit a post | Queued vs lost vs error UX |
| Model still loading | Run a search and read the AI Match % column before the TF.js model is ready | `NaN%`, `0%`, or a rank that reshuffles under the cursor |
| Embedding backend down | Search while the API can't reach its embedding provider | Whether the failure degrades honestly or renders an empty result set as "no matches" |
| Clock skew | Visit with the device clock wrong | Token-validity bugs, timestamps in the future |
| DST boundary | Enter a work-history range crossing a DST change | Off-by-one-day durations |

### Device, viewport & theme edges

| Edge case | What to try | What it surfaces |
|---|---|---|
| **Dark mode** | Walk the whole surface with `.dark` active | A card that stayed white, dark text on dark, a vanished border, a hardcoded hex — this repo's most common visual bug class |
| **Theme flip mid-flow** | Open a modal in light, toggle to dark with it open | Portals and Radix overlays that never re-read the theme |
| **Theme after reload** | Set dark, reload | Theme not persisted, or a light flash before dark paints |
| Rotate device | Portrait → landscape mid-flow | Layout reflow loses focus/state |
| Tiny viewport (320px) | Resize to 320×568 | Sticky elements covering content, untappable buttons, a layout editor unusable by touch |
| Very large viewport (4K) | 3840×2160 | Whitespace explosion, a profile drifting to one corner |
| Mobile layout mirror | Arrange on desktop, then check the mobile arrangement | Whether the two arrangements stay in sync as promised |
| Reduced motion | OS "reduce motion" on | Critical animations skipped, lost feedback |
| OS / browser zoom | System zoom 200%, Ctrl+± | Layout breaks, overlapping elements |

### Accessibility edges

| Edge case | What to try | What it surfaces |
|---|---|---|
| Keyboard-only | Unplug the mouse and walk the whole journey | Focus order, focus-visible, skip links, Radix modal escape |
| Keyboard-only layout editor | Rearrange profile blocks without a mouse | Whether drag-and-drop has any keyboard affordance at all |
| Screen reader | VoiceOver / NVDA over the public profile and the review queue | Missing labels, unannounced dynamic content, an AI Match % that reads as a bare number with no context |
| Non-Latin characters | Enter `日本語` / `العربية` / `русский` in a name or post | Encoding, font fallback, search behavior |
| Voice control | macOS / Windows voice control | Buttons without accessible names |

### Interrupt edges

| Edge case | What to try | What it surfaces |
|---|---|---|
| Phone lock mid-upload | Start a resume upload on mobile, lock the screen | Suspended request, silent failure |
| App-switch during OAuth | Open another app during the Google redirect | Lost auth, broken redirect chain |
| Long-idle review queue | Leave the queue open an hour, then approve | Acting on a post the agent has since edited or deleted |
| Battery saver | iOS low-power mode | Background timers slow, in-browser model throttled |

### Trust & recovery edges

| Edge case | What to try | What it surfaces |
|---|---|---|
| Return after error | Hit a 500, refresh in 1 minute, then 10, then a day | Stale error page, "we're sorry" loops, fixed-but-cached |
| Share a profile link | Send `/<username>` to a logged-out reader | What a stranger sees; whether anything private renders |
| Forward a dashboard URL | Send `/dashboard/settings` to a logged-out reader | Auth-redirect quality, no preview leak |
| Recover from a leak | After a disclosure leak, walk the journey as the affected user | Whether the product offers any path to remove, correct, or re-publish |

## How to use this catalog

1. After picking the persona and tour for a charter, pick 5-10 relevant edge cases. Match the edge case to the surface — the layout editor doesn't need a DST test; work history does.
2. **Any charter touching posts, settings, the public profile or the MCP surface draws at least two from the disclosure section.**
3. Record which edge cases were attempted in the charter debrief — attempted-and-clean is evidence too.
4. For each finding, file via the global bug registry (routed at Step 6 of the SKILL) with `Persona Affected:` and `Journey Step:` filled in.
5. Don't try every edge case in one box. The time-box governs.

## What is NOT in scope here

These belong elsewhere:

- **Unit-level boundary tests** (null, empty array, overflow) — vitest unit tests.
- **SQL injection / XSS / CSRF** — security review. *Note the distinction:* a disclosure leak is **in scope here** because it is the product doing what it was asked, wrongly; an injection is an attacker defeating the product, which is a security concern.
- **Load and concurrent-user stress** — load testing tools.
- **Race conditions in code** — integration tests, fuzzing.
- **Build-time errors** — `npm run check-types` and the pre-push gate.

If you find one of those during a user-QA session, file the bug and recommend the right gate, but do not attempt to verify it from inside the QA session.

## Sources

- Testlio — *Exploratory Testing 101: Going Off-Script*.
- Sahipro — *Exploratory Testing Best Practices*.
- Thoughtworks — *10 tips for an Agile QA mindset, Tip 3 (corner cases)* and *Tip 8* (don't rely on incognito or cleared cache; users don't).
