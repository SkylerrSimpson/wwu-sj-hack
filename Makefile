.PHONY: setup dev data fmt check check-web check-data

setup:
	git config core.hooksPath .githooks
	git config pull.rebase true
	pnpm install
	cd data && uv sync

dev:
	pnpm dev

data:
	cd data && uv run build.py

fmt:
	pnpm format
	cd data && uv run ruff format .

check: check-data check-web

check-data:
	cd data && uv run ruff format --check . && uv run ruff check . && uv run mypy . && uv run pytest -q && uv run check.py

check-web:
	pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build:web
