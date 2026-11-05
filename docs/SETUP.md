# Setup

Gets the site running on your machine. Works on a laptop or on a lab Ubuntu account with no sudo, because everything installs under your home directory. About five minutes.

    for t in git curl make; do command -v $t >/dev/null || echo "missing: $t"; done   # ask lab staff if anything prints
    curl -fsSL https://get.pnpm.io/install.sh | sh -        # pnpm, into ~/.local/share/pnpm
    curl -LsSf https://astral.sh/uv/install.sh | sh          # uv, into ~/.local/bin; it fetches Python itself
    source ~/.bashrc                                         # or open a new terminal, so PATH has both
    pnpm env use --global 24                                 # Node 24, through pnpm
    curl -sL $(curl -s https://api.github.com/repos/cli/cli/releases/latest | grep -o 'https://[^"]*linux_amd64.tar.gz') | tar xz --strip-components=2 -C ~/.local/bin --wildcards '*/bin/gh'
    gh auth login && gh auth setup-git                       # HTTPS pushes, no SSH key to set up
    git config --global user.name "<your name>" && git config --global user.email "<your GitHub email>"
    git clone https://github.com/SkylerrSimpson/wwu-sj-hack.git && cd wwu-sj-hack
    make setup && make check && make dev

When it finishes, the site is at http://localhost:3000 and `make check` printed all green. If anything failed, say so the day you hit it, not Saturday.

macOS: `make` comes with `xcode-select --install`, and the gh line is `brew install gh`. Windows: WSL first, then the lines above. Without `make`, run the recipe lines from the `Makefile` by hand.

## Day to day

- `make dev`: run the site locally.
- `make data`: regenerate `apps/web/public/data.json` from `data/build.py`.
- `make check`: everything the commit hook runs. Green before you push.
- `make fmt`: fix formatting complaints.

## Vercel

Skyler's account. Import the repo, set Root Directory to `apps/web`, Production Branch `main`, Node 24. Every push to `main` redeploys. The production domain (`<name>.vercel.app`) goes in the `Live:` line of `README.md`; per-deployment and branch URLs sit behind a login, so that one is the only URL we hand out.
