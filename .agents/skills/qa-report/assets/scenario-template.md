---
id: SET-disclosure-blocks-employer
area: SET
title: Agent cannot name the employer above the chosen disclosure level
persona: Atlas
journey: J-set-disclosure-policy
expected: With the policy at its strictest level, a post published through MCP names no employer in the posts list, in list_my_posts, on the logged-out public profile, or in the API payload behind it
entry_points: mcp:create_post; http://localhost:5173/dashboard/settings; http://localhost:5173/seed-react-frontend-003
qa_status: untested
bug_ids:
fix_status:
retest_status:
fix_commits:
evidence:
last_report:
overlaps:
---

EXAMPLE FILE — replace every value after reading. Flat frontmatter, one field per line, fixed order, exactly these 16 fields (the scripts in `scripts/` parse this list); free-prose notes live here in the body and only here.

Use the body for what the frontmatter cannot hold: which themes this surface must be walked in (`Walk in light and dark.`), the disclosure specifics behind the one-sentence `expected`, and any deliberate skip reasoning. Keep it short — the tracker answers "what state is this in?"; the story belongs in the bug files and the dated reports.
