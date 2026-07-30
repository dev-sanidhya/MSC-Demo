from .retrieval import HybridRetriever


if __name__ == "__main__":
    count = HybridRetriever().build()
    print(f"Retrieval index ready with {count} documents.")
