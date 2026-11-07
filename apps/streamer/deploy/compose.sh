#!/bin/sh
# docker compose for the hosted stack, from anywhere: compose.sh ps, compose.sh logs -f streamer.
# Everything the host keeps sits in LUMMI_HOME, the folder that holds the repo checkout.
set -eu
here=$(dirname "$(readlink -f "$0")")
export LUMMI_HOME="${LUMMI_HOME:-$(readlink -f "$here/../../../..")}"
export STREAMER_DATA="$LUMMI_HOME/data" STREAMER_ENV_FILE="$LUMMI_HOME/streamer.env"
export STREAMER_UID="${STREAMER_UID:-$(id -u)}" STREAMER_GID="${STREAMER_GID:-$(id -g)}"
export DOCKER_GID="${DOCKER_GID:-$(stat -c %g /var/run/docker.sock)}"
# Not 8787, so it can sit beside a development streamer on the same machine.
export STREAMER_PUBLISH_PORT="${STREAMER_PUBLISH_PORT:-8790}"
exec docker compose -f "$here/compose.yaml" "$@"
