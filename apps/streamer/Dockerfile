FROM python:3.12-slim

ENV UV_PYTHON_DOWNLOADS=never PYTHONUNBUFFERED=1 PATH=/app/.venv/bin:$PATH
RUN pip install --no-cache-dir uv==0.9.5

WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev
COPY streamer ./streamer
# A new named volume takes this owner, so the default non-root user can write to it.
RUN mkdir /data && chown 1000:1000 /data

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s \
    CMD python -c "import urllib.request as u; u.urlopen('http://127.0.0.1:8787/healthz', timeout=4)"
CMD ["python", "-m", "streamer"]
