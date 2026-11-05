# WWU Social Justice Hackathon

A prototype for a Bellingham nonprofit, built in one day: Saturday Nov 7 2026, two people, presented Sunday. Build what the demo script in `docs/SPEC.md` shows, with the safeguards it lists, and nothing beyond that. Small and clean beats complete: one module per concept and one data contract are what let it grow if the nonprofit wants more, and a Saturday is all it gets now. Optimize for a demo that works, a user who is helped, and decisions we can explain.

## Read first

- `docs/SPEC.md`: the problem, the one user, the demo script, the safeguards. The demo script plus the safeguards table is the scope; everything else waits.
- `docs/DECISIONS.md`: one line per decision made so far.
- Standards, binding on every code change: @agents/standards.md
- Skills and the procedure to follow without them: @agents/skills.md

## Ownership

| Folder      | Owner  | Produces                                    |
| ----------- | ------ | ------------------------------------------- |
| `apps/web/` | Skyler | the Next.js app on Vercel                   |
| `data/`     | Willow | `apps/web/public/data.json`, via `build.py` |

`data/schema.json` is the contract between them; `make check` enforces it, and only Willow commits `data.json`. Work inside your own folder.

A schema change is an issue: `gh issue create -l schema -t "schema: <field>" -b "<why, and the JSON Schema snippet>"`. The other owner comments `agreed`. Then two landings, each `make check` green: for an added field, the data side first (`schema.json`, `build.py` and its test, the regenerated `data.json`), then `data.ts`; for a removed field, `data.ts` first.

## Loop

1. Work the issue number in your prompt; given none, ask for one. Its acceptance criteria are the finish line.
2. Core logic gets a failing test first, then the code that passes it; the folder decides what is core logic (Where code goes, in the standards). A component is built, then clicked by a human.
3. `make check` green. Formatting is fixed by `make fmt`; type, lint and test failures are fixed in the code. The hook runs on every commit.
4. A commit message is one imperative line ending in `#<issue>`, with a body only when the why is not in the diff; the message ends there. Land on `main` with `git fetch origin && git rebase origin/main && make check && git push origin HEAD:main`; a rejected push means run that line again. An agent in a worktree runs `make setup` once and works on branch `slice/<issue>`. A conflict in `docs/DECISIONS.md` or `data/NOTES.md` keeps both sides' lines.
5. End the turn by naming the commit. A human opens the live URL (the `Live:` line in `README.md`) and walks the demo script.
6. Close the issue: `gh issue close <n> -c "<one line on what changed>"`.

Three red `make check` runs in a row on one slice, or thirty minutes by the clock, means the slice is too big: close it with `split into #a #b` and open the two, or cut it.
