# Standards

What the code must look like. The root `AGENTS.md` has the loop.

## Where code goes

- A page in `apps/web/src/app/` reads `data` from `@/lib/data` and renders components. `@/lib/data` is imported only from server components, so the dataset stays out of the browser bundle.
- Anything that filters, scores, groups, matches or formats records is a pure function in `apps/web/src/lib/<name>.ts` with `<name>.test.ts` beside it, even when used once; components receive its result as props. One file runs with `pnpm exec vitest run apps/web/src/lib/<name>.test.ts`.
- One `lib/` module per concept, named with the spec's glossary word, exporting a type and the functions on it; callers know nothing of its internals, so a change to one concept is a change to one module. The Shape section of `docs/SPEC.md` lists the modules; a new one is added there first.
- Anything that depends on the current time or the user's location runs in a client component; the pure function it calls takes `now` or the location as a parameter, so its test passes a fixed value.
- Components live in `apps/web/src/components/`; `components/ui/` is shadcn output. shadcn here is Base UI: compose with the `render` prop (`render={<a href="…" />}`). Add one with `pnpm --filter @hack/web exec shadcn add <name>`, then `make fmt`.
- When the demo script has a second language, every UI string lives in one map in `apps/web/src/lib/copy.ts`, keyed by language, and `<html lang>` follows the selection.
- The Python side holds the same rule: transforms are functions in `data/build.py` with tests in `data/test_build.py`; `data/AGENTS.md` has the rest.

## Bar

- Smallest change that works. Something used once is inlined, except core logic (Where code goes). A helper, type, or option earns its place at the second use. Widen an existing function before adding a sibling. Delete over add.
- Reach for the platform first: Next, React, Tailwind, shadcn, the browser, the Python stdlib.
- TypeScript strict, Python typed; `make check` is the gate.
- Tests run the real code and fake only the network edge.
- Copy the user reads is plain US English with no em dashes: a colon, comma, or full stop instead.
- Always keep: validation of anything a user types, keyboard and screen-reader basics (labels, focus order, contrast), provenance on every record (source and retrieval date), every safeguard in `docs/SPEC.md`.

## Comments

Code is the only source of truth. A comment is one or two lines for what the code cannot hold: a line that would otherwise read as a bug, a decision (why this departs from the default, or a rejected alternative someone would retry), or a shape the type cannot express. It states the reason, never an issue number. A missing comment is never a violation; a reader who needs prose needs better names or structure. Tests may say what they prove. A comment that restates or has drifted from the code is deleted.

## Decisions

A line in `docs/DECISIONS.md` (what, why, what it replaced) before the code, for: a choice a reader could ask about ("why no accounts?", "why this source?"); a new dependency (`pnpm --filter @hack/web add <pkg>` or `cd data && uv add <pkg>`), naming what it replaces; a silenced check (`@ts-ignore`, `# type: ignore`, `# noqa`, a skipped test); anything that fits, predicts or calls a model, which also gets a safeguard row in `docs/SPEC.md` and a model card in `data/NOTES.md`.

## Issues

An issue is a slice: one sentence you could watch happen in the demo, plus acceptance criteria; the owner is the assignee. Create one with

```sh
gh issue create -l slice -a <owner-login> -t "<verb phrase>" -b "$(cat <<'EOF'
### In the demo
One sentence you could watch happen in the demo.
### Done when
- [ ]
### Why it matters
### Out of scope
EOF
)"
```

Open one only while `gh issue list -l slice -s open --json number -q length` prints a number below 8; otherwise close or merge a slice first. A slice over two hours is split. A bug is one repro line: `gh issue create -l bug -t "<what is wrong>" -b "<repro>"`.
