# The issue card

One screen. Everything the next skill needs, nothing it does not.

```
<KEY> — <title>
state <name> · priority <name> · cycle <name> · estimate <n|—>
project <name|—> · parent <KEY|—> · labels <a, b, c>
assignee <name> · updated <date>

DESCRIPTION
<the description, whole — never summarised>

COMMENTS (<n>)
  <author> · <date>
  <the comment, whole>

ATTACHMENTS
  <title> — <url>

LINKS
  PR      <url> — <open|merged|closed>
  design  <url>
  doc     <url>
  other   <url>
```

Rules:

- **Never summarise the description or a comment.** A three-line summary of the
  comment that names the offending commit is how the fix gets lost. Render them
  whole; if the issue is genuinely enormous, say so and render the most recent
  ten comments plus the first.
- **Every field is read from the server**, including state, priority, label and
  cycle names. This repo hardcodes none of them.
- **Classify the links**, do not just list them. A GitHub PR link changes the
  route — the work may already be half done. Match on the host and path shape:
  `github.com/**/pull/**` is a PR, `figma.com` is a design, everything else is a
  doc or other.
- A PR link is worth one extra call: `gh pr view <url> --json state,title` says
  whether that work is open, merged or abandoned.
- Missing field → `—`. Never invent one, and never leave a heading with nothing
  under it.
