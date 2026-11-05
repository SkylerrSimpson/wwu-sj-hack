# Decisions

One line each: what, why, what it replaced. Append only.

- 2026-11-04 Next.js + Tailwind + shadcn on Vercel for the product, Python for the data. Each owner works in the stack they already know, and the deploy needs no configuration. Replaced: a shared backend.
- 2026-11-04 `data/` writes a static `apps/web/public/data.json` that the app reads at build time. One file is the whole integration, and the demo cannot fail on a dead service. Replaced: an API between the halves, and a database. Revisit only if users have to write data.
- 2026-11-04 `data/schema.json` (JSON Schema) is the contract between the halves; `make check` validates the file against it, and the schema refuses undeclared fields. Readable by both languages and both people. Replaced: an agreement kept by hand.
- 2026-11-04 pnpm workspace, TypeScript 7 with `noUncheckedIndexedAccess`, oxlint with type-aware rules, Prettier at width 100, Vitest at the root. TypeScript 7 has no JavaScript compiler API, so type-aware ESLint rules cannot run against it; oxlint's type-aware mode is built on the same compiler. Replaced: ESLint.
- 2026-11-04 Python is formatted and linted by ruff and type-checked by mypy, so both halves have the same kind of gate. Replaced: unchecked Python.
- 2026-11-04 `uv` runs the Python side (`uv run`, `uv sync`). One tool that behaves the same on every machine and fetches Python itself. Replaced: venv + pip.
- 2026-11-04 Commits land on `main` by rebase, and the pre-commit hook runs the full `make check`, `next build` included. Two owners in two folders; a review queue costs more than it catches in one day, so the hook is the review. Replaced: pull requests.
- 2026-11-04 The Vercel build type-checks. There is no CI, so the deploy is the second gate after the hook. Replaced: skipping type errors at build time.
- 2026-11-04 Tests on core logic and the data contract only; the demo path is checked by a person walking the live deploy after each landing. Replaced: browser end-to-end tests.
- 2026-11-04 `data.json` carries no build timestamp, so `make data` is byte-reproducible and a test proves the committed file is what `build.py` produces; freshness is each source's `retrieved` date. Replaced: a `generated_at` field.
- 2026-11-04 shadcn's current default style (`base-nova`, on Base UI), the `cn` package, and Tailwind through `@tailwindcss/turbopack`. Base UI composes with a `render` prop where Radix took `asChild`. Replaced: the Radix-based shadcn setup.
- 2026-11-04 Next's cache components are off, so the page uses the rendering model every reference assumes. Replaced: create-next-app's `cacheComponents: true`.
- 2026-11-04 Decisions live here, one line each. Replaced: architecture decision records.
- 2026-11-04 Docs are split by reader: `docs/` for people (setup, the weekend, spec, decisions) and `agents/` for coding agents (standards, skills, kickoff), with `AGENTS.md` at the root as the agents' entry point. Replaced: one pile of markdown at the root.
