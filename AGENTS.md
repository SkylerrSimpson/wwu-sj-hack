# WWU Social Justice Hackathon

A prototype for the Lummi Nation, built in one day: Saturday Nov 7 2026, four people, 10:00 to a 16:00 deadline, pitched at 16:05. Build what the demo script in `docs/SPEC.md` shows, with the safeguards it lists, and nothing beyond that. Small and clean beats complete: one module per concept and one data contract are what let it grow if the Nation wants more, and six hours is all it gets now. Optimize for a demo that works, a user who is helped, and decisions we can explain to judges who don't code.

## Read first

- `docs/SPEC.md`: the problem, the one user, the demo script, the safeguards. The demo script plus the safeguards table is the scope; everything else waits.
- `docs/DECISIONS.md`: one line per decision made so far.
- `docs/HACKATHON.md`: the day's schedule and gates.
- `docs/prep/README.md`: the morning's research, and which note each person's issue needs.
- Standards, binding on every code change: @agents/standards.md
- Skills and the procedure to follow without them: @agents/skills.md

## Ownership

Every file has one owner, and only the owner commits it. Work inside your own files; `git add` them by name, never `git add -A`.

| File(s)                                                       | Owner  | Notes                                                                          |
| ------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------ |
| `data/**`, `apps/web/public/data.json`                        | Willow | `data/AGENTS.md` applies; `build.py` is the only writer of `data.json`         |
| `docs/SPEC.md`, `AGENTS.md`, `README.md`, `docs/HACKATHON.md` | Skyler | Others suggest, Skyler edits                                                   |
| `apps/web/package.json`, `pnpm-lock.yaml`, `components/ui/**` | Skyler | Dependencies land in one commit; ask Skyler for another                        |
| `apps/web/src/lib/data.ts`, `data.test.ts`                    | Skyler | Mirrors `data/schema.json`                                                     |
| `apps/web/src/components/VisitMap.tsx`                        | Skyler | The only client component; takes `ring`, `track`, `label` as props             |
| `apps/web/src/lib/visit.ts`, `visit.test.ts`                  | Nathan | Core logic, test-first                                                         |
| `apps/web/src/app/page.tsx`                                   | Nathan | Summary, flagged visit cards, one line per approved vessel                     |
| `apps/web/src/app/layout.tsx`                                 | Luke   | Banner, caveats, provenance footer, metadata                                   |
| `apps/web/src/app/visits/[id]/page.tsx`                       | Luke   | Static per visit; the referral record; renders `<VisitMap>` for flagged visits |
| `docs/DECISIONS.md`                                           | anyone | Append only; a conflict keeps both sides' lines                                |

`data/schema.json` is the contract between the data side and the web side; `make check` enforces it. Pages import `@/lib/data`; components receive props and never import it.

A schema change is an issue: `gh issue create -l schema -t "schema: <field>" -b "<why, and the JSON Schema snippet>"`. The other owner comments `agreed`. Then two landings, each `make check` green: for an added field, the data side first (`schema.json`, `build.py` and its test, the regenerated `data.json`), then `data.ts`; for a removed field, `data.ts` first.

## Loop

1. Work the issue number in your prompt; given none, ask for one. Its acceptance criteria are the finish line.
2. Core logic gets a failing test first, then the code that passes it; the folder decides what is core logic (Where code goes, in the standards). A component is built, then clicked by a human.
3. `make check` green. Formatting is fixed by `make fmt`; type, lint and test failures are fixed in the code. The hook runs on every commit.
4. A commit message is one imperative line ending in `#<issue>`, with a body only when the why is not in the diff; the message ends there. Land on `main` with `git fetch origin && git rebase origin/main && make check && git push origin HEAD:main`; a rejected push means run that line again. An agent in a worktree runs `make setup` once and works on branch `slice/<issue>`. A conflict in `docs/DECISIONS.md` or `data/NOTES.md` keeps both sides' lines.
5. End the turn by naming the commit. A human opens the live URL (the `Live:` line in `README.md`) and walks the demo script.
6. Close the issue: `gh issue close <n> -c "<one line on what changed>"`.

Three red `make check` runs in a row on one slice, or thirty minutes by the clock, means the slice is too big: close it with `split into #a #b` and open the two, or cut it. Fifteen minutes stuck means ask a teammate.
