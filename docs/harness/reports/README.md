# Eval reports — the receipts

Every deletion in the harness split had to be backed by a report ID. Those
reports are generated into `.harness-eval/runs/<id>/`, which is **gitignored** —
a run is a record of one evaluation, and the claim deck alone is 1,429 rows.

That is fine for the raw run and wrong for the four documents that authorise
cuts: on a fresh clone, "no cut without a report ID" would be unverifiable
because the reports would not exist. So the ones that carry decisions are copied
here and committed.

| File | What it decides |
|---|---|
| `2026-09-03-baseline-07-redundancy-agreement.md` | Track B. Ship / Review / Hold per claim. **83 Ship rows, none applied** — Ship permits a cut, it does not require one. |
| `2026-09-03-baseline-10-usefulness-agreement.md` | Track C. Slim / Keep-core / Mixed / Hold per surface, plus the fan-in gate. |
| `2026-09-03-baseline-11-mixed-apply.md` | The per-section KEEP / CUT list for the seven Mixed surfaces. The **only** legitimate input for a Mixed apply. |
| `2026-09-03-baseline-12-second-model-recheck.md` | A different model family re-checking every Slim and Mixed candidate before anything large was deleted. It **blocked** one Slim, confirmed two, and downgraded one to Mixed. |
| `2026-09-04-post-10-usefulness-agreement.md` | Track C again, after the split, for the comparison in `../eval-log.md`. |

The judge score files (`05`, `06`, `08`, `09`) and the claim deck are not copied
— they are large, and everything decision-bearing in them is summarised in the
agreement reports above. Re-run the eval if you need them.
