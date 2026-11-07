"""Run with: uv run python -m streamer"""

import logging
import os
import sys

from aiohttp import web

from streamer.config import load
from streamer.server import build


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    try:
        config = load(os.environ)
    except ValueError as error:
        sys.exit(f"streamer: {error}")
    app, _service = build(config)
    logging.getLogger("streamer").info("serving on %s:%s", config.host, config.port)
    web.run_app(
        app,
        host=config.host,
        port=config.port,
        access_log=None,
        handler_cancellation=True,
        shutdown_timeout=5,
        print=None,
    )


if __name__ == "__main__":
    main()
