# Already has git, ssh, flock and docker compose; the updater talks to the host's daemon.
FROM docker:29.1-cli
ARG UID=1000
# ssh refuses to run for a uid with no account.
RUN adduser -D -u "$UID" updater
