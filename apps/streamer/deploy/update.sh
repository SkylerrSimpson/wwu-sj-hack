#!/bin/sh
# Brings this checkout up to origin/main and rebuilds the streamer when its files changed.
# The updater service runs it each minute, so the team deploys by pushing to main and never needs
# access to this host.
set -eu
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"

exec 9>.git/streamer-deploy.lock
flock -n 9 || exit 0

git fetch -q origin main
git merge -q --ff-only origin/main
now=$(git rev-parse HEAD)
state=.git/streamer-deployed
last=$(cat "$state" 2>/dev/null || echo none)
[ "$now" = "$last" ] && exit 0

# An unknown last commit (first run, or history rewritten) diffs as an error, which means rebuild.
changed=$(git diff --name-only "$last" "$now" -- apps/streamer 2>/dev/null || echo unknown)
if [ -n "$changed" ]; then
  sh apps/streamer/deploy/compose.sh up -d --build streamer
  echo "$(date -u +%FT%TZ) streamer deployed at $now"
fi
# Written only after a successful build, so a failed one is retried next minute.
echo "$now" >"$state"
