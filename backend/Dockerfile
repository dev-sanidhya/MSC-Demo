# Build context is the repo root (backend/build_corpus.py reads ../data).
# On Render: set Root Directory to "." and Dockerfile Path to "backend/Dockerfile".
FROM python:3.11-slim AS base

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY data ./data
COPY backend ./backend

# Bakes the Qdrant index and downloads the embedding/reranker models into the
# image at build time, so the container starts instantly and needs no
# persistent volume.
RUN python -m backend.build_corpus && python -m backend.build_index

EXPOSE 8765
# Render assigns $PORT (default 10000) and expects the container to bind to
# it; fall back to 8765 for plain `docker run` outside Render.
CMD ["sh", "-c", "python -m uvicorn backend.app:app --host 0.0.0.0 --port ${PORT:-8765}"]
