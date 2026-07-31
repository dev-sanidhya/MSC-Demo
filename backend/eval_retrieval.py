"""Small human-readable showcase retrieval check, not a metrics framework."""

import json
from urllib.error import URLError
from urllib.request import Request, urlopen

from .retrieval import HybridRetriever


QUESTIONS = [
    "Why does Lucas test give turbidity immediately for tertiary alcohols?",
    "What is the iodoform test and which alcohols give positive result?",
    "How does Williamson ether synthesis work?",
    "How does Grignard reagent react with an ester to give tertiary alcohol?",
    "Explain hydroboration oxidation of alkenes to give alcohols",
    "Why is phenol more acidic than ethanol?",
    "Explain Kolbe Schmitt reaction of phenol",
    "How does anisole react with HI?",
    "How do SOCl2 and PBr3 convert alcohols to halides?",
]


def search_running_service(question: str) -> dict | None:
    request = Request(
        "http://127.0.0.1:8765/search",
        data=json.dumps({"query": question, "limit_per_type": 2}).encode(),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urlopen(request, timeout=120) as response:
            return json.load(response)
    except URLError:
        return None


if __name__ == "__main__":
    retriever = None
    for question in QUESTIONS:
        result = search_running_service(question)
        if result is None:
            retriever = retriever or HybridRetriever()
            result = retriever.search(question, 2)
        print(f"\nQ: {question}")
        for source in result["videos"]:
            meta = source["metadata"]
            print(f"  VIDEO {meta['lecture']} @{meta['startSeconds']}s - {meta['topic']}")
        for source in result["books"]:
            meta = source["metadata"]
            print(f"  REFERENCE {meta['sourceTitle']} - {meta['url']}")
    if retriever is not None:
        retriever.client.close()
