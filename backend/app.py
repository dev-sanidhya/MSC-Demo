from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from .retrieval import HybridRetriever


app = FastAPI(title="MSC Demo Retrieval", docs_url=None, redoc_url=None)
retriever = HybridRetriever()


@app.on_event("startup")
def warm_retrieval_models() -> None:
    """Pay the local-model startup cost before a student sends the first doubt."""
    _ = retriever.dense
    _ = retriever.sparse


class SearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=1000)
    limit_per_type: int = Field(default=3, ge=1, le=5)


@app.get("/health")
def health() -> dict[str, bool]:
    return {"ok": True, "indexReady": retriever.ready()}


@app.post("/search")
def search(request: SearchRequest):
    try:
        return retriever.search(request.query.strip(), request.limit_per_type)
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
