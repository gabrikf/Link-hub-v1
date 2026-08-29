# CH-<slug>: <mission in one line>

```yaml
charter:
  id: CH-<slug>
  mission: "<one sentence — what we're looking for and why it matters>"
  mode: <charter-with-tour | freestyle | scenario-based | strategy-based | adversarial-agent | collaborative>
  persona:
    name: <from <qa-docs-path>/personas.md>
    interface: <browser | mcp | cli>
    device: <desktop | tablet | phone-small | phone-large | none>
    network: <wifi-fast | 4g | flaky>
  journey: J-<slug>
  scenarios: [<scenario ids this session can settle>]
  tour: <exactly one — see ../qa-execution/references/tours.md>
  themes: [light, dark]        # both, for any browser charter, unless a reason is stated below
  time_box_minutes: <30 | 60 | 90>
  environment:
    web: http://localhost:5173
    api: http://localhost:3333
    account: <seed account, e.g. seed-react-frontend-003 or recruiter.seed@crafthub.local>
  guidance:
    must_try:
      - "<2-4 specific things to attempt — for a Disclosure Tour, draw from the disclosure
         section of ../qa-execution/references/edge-cases.md>"
    must_avoid:
      - "<known-broken or out-of-scope areas>"
      - "the known deliberate debt: eslint backlog, apps/mcp test gap, packages/ui, pluguins/"
    theme_exception: "<only if themes is not [light, dark] — why>"
```

<!-- The charter is durable and immutable: re-run it in later cycles; each run's debrief goes in that run's report (Session Debriefs), never here. -->
