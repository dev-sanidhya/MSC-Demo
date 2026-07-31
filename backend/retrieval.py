"""Local Qdrant hybrid retrieval for the showcase demo."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from fastembed import SparseTextEmbedding, TextEmbedding
from qdrant_client import QdrantClient, models


ROOT = Path(__file__).resolve().parent
COLLECTION = "msc_demo"
DENSE_NAME = "dense"
SPARSE_NAME = "sparse"
DENSE_MODEL = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
SPARSE_MODEL = "Qdrant/bm25"
QUERY_CONCEPTS = {
    "iodoform": "Iodoform Test",
    "lucas": "Lucas Test",
    "victor meyer": "Victor Meyer Test",
    "williamson": "Williamson Ether Synthesis",
    "grignard": "Grignard Reagent",
    "ester": "Ester Reaction",
    "hydroboration": "Hydroboration-Oxidation",
    "dehydration": "Dehydration of Alcohol",
    "oxidation": "Oxidation of Alcohol",
    "pinacol": "Pinacol-Pinacolone Rearrangement",
    "phenol": "Phenol",
}


class HybridRetriever:
    def __init__(self) -> None:
        self._dense: TextEmbedding | None = None
        self._sparse: SparseTextEmbedding | None = None
        self.client = QdrantClient(path=str(ROOT / ".qdrant"))

    @property
    def dense(self) -> TextEmbedding:
        if self._dense is None:
            self._dense = TextEmbedding(DENSE_MODEL, cache_dir=str(ROOT / ".cache"))
        return self._dense

    @property
    def sparse(self) -> SparseTextEmbedding:
        if self._sparse is None:
            self._sparse = SparseTextEmbedding(SPARSE_MODEL, cache_dir=str(ROOT / ".cache"))
        return self._sparse

    def ready(self) -> bool:
        return self.client.collection_exists(COLLECTION)

    def build(self) -> int:
        source = ROOT / "data" / "documents.jsonl"
        documents = [json.loads(line) for line in source.read_text(encoding="utf-8").splitlines() if line]
        first_vector = list(self.dense.embed([documents[0]["searchText"]]))[0]
        if self.client.collection_exists(COLLECTION):
            self.client.delete_collection(COLLECTION)
        self.client.create_collection(
            COLLECTION,
            vectors_config={
                DENSE_NAME: models.VectorParams(size=len(first_vector), distance=models.Distance.COSINE)
            },
            sparse_vectors_config={SPARSE_NAME: models.SparseVectorParams()},
        )

        batch_size = 48
        for offset in range(0, len(documents), batch_size):
            batch = documents[offset : offset + batch_size]
            texts = [document["searchText"] for document in batch]
            dense_vectors = list(self.dense.embed(texts))
            sparse_vectors = list(self.sparse.embed(texts))
            points = []
            for index, (document, dense, sparse) in enumerate(
                zip(batch, dense_vectors, sparse_vectors, strict=True), start=offset
            ):
                points.append(
                    models.PointStruct(
                        id=index,
                        vector={
                            DENSE_NAME: dense.tolist(),
                            SPARSE_NAME: models.SparseVector(
                                indices=sparse.indices.tolist(), values=sparse.values.tolist()
                            ),
                        },
                        payload=document,
                    )
                )
            self.client.upsert(COLLECTION, points=points, wait=True)
            print(f"Indexed {min(offset + batch_size, len(documents))}/{len(documents)}")
        return len(documents)

    def search(self, query: str, limit_per_type: int = 3) -> dict[str, list[dict[str, Any]]]:
        if not self.ready():
            raise RuntimeError("Retrieval index is not built. Run backend/build_index.py first.")
        dense = list(self.dense.query_embed(query))[0]
        sparse = list(self.sparse.query_embed(query))[0]
        response = self.client.query_points(
            COLLECTION,
            prefetch=[
                models.Prefetch(query=dense.tolist(), using=DENSE_NAME, limit=16),
                models.Prefetch(
                    query=models.SparseVector(
                        indices=sparse.indices.tolist(), values=sparse.values.tolist()
                    ),
                    using=SPARSE_NAME,
                    limit=16,
                ),
            ],
            query=models.FusionQuery(fusion=models.Fusion.RRF),
            limit=12,
            with_payload=True,
        )
        candidates = [
            (point.score, point.payload) for point in response.points if point.payload
        ]
        if not candidates:
            return {"videos": [], "books": []}
        expected_labels = {
            label for term, label in QUERY_CONCEPTS.items() if term in query.lower()
        }
        named_query_terms = {
            term for term in QUERY_CONCEPTS if term in query.lower()
        }
        def ranking_key(pair: tuple[float, dict[str, Any]]) -> tuple[int, float]:
            score, item = pair
            labels = set(item["metadata"].get("keywords", []))
            return len(expected_labels & labels), score

        ranked = [
            item
            for _, item in sorted(candidates, key=ranking_key, reverse=True)
        ]
        videos: list[dict[str, Any]] = []
        books: list[dict[str, Any]] = []
        for item in ranked:
            public = self._public(item)
            metadata = public["metadata"]
            if item["sourceType"] == "video" and len(videos) < limit_per_type:
                # Adjacent overlapping windows are one recommendation, not
                # three apparently different sources.
                if any(
                    existing["metadata"]["videoId"] == metadata["videoId"]
                    and abs(existing["metadata"]["startSeconds"] - metadata["startSeconds"]) < 75
                    for existing in videos
                ):
                    continue
                videos.append(public)
            elif item["sourceType"] == "book" and len(books) < limit_per_type:
                # Dense search must not force a book citation for a named test
                # or reaction that this volume never actually mentions.
                book_text = item["searchText"].lower()
                if named_query_terms and not all(term in book_text for term in named_query_terms):
                    continue
                if any(existing["metadata"]["page"] == metadata["page"] for existing in books):
                    continue
                books.append(public)
            if len(videos) >= limit_per_type and len(books) >= limit_per_type:
                break
        return {"videos": videos, "books": books}

    @staticmethod
    def _public(item: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": item["id"],
            "sourceType": item["sourceType"],
            "text": item["text"],
            "context": item["context"],
            "metadata": item["metadata"],
        }
