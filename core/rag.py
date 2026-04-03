import sqlite3
import json
import numpy as np
import os
from datetime import datetime
from typing import List, Dict, Any, Optional
from sentence_transformers import SentenceTransformer

class VectorStore:
    """
    A local-first vector store using SQLite for metadata/blobs 
    and NumPy for fast cosine similarity search.
    """
    
    def __init__(self, db_path: str = "data/ensemble_memory.db", model_name: str = "all-MiniLM-L6-v2"):
        self.db_path = db_path
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        
        # Load embedding model (cached by sentence-transformers)
        print(f"Loading embedding model: {model_name}...")
        self.model = SentenceTransformer(model_name)
        
        self._init_db()
        self._load_vectors()

    def _init_db(self):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS memories (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    content TEXT NOT NULL,
                    metadata TEXT,
                    embedding BLOB NOT NULL,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """)
            conn.commit()

    def _load_vectors(self):
        """Pre-load vectors into memory for fast similarity search."""
        self.ids = []
        self.vectors = []
        self.contents = []
        self.metadatas = []
        
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute("SELECT id, content, metadata, embedding FROM memories")
            for row in cursor:
                self.ids.append(row[0])
                self.contents.append(row[1])
                self.metadatas.append(json.loads(row[2]) if row[2] else {})
                # Convert blob back to numpy array
                self.vectors.append(np.frombuffer(row[3], dtype=np.float32))
        
        if self.vectors:
            self.vectors_np = np.stack(self.vectors)
        else:
            self.vectors_np = np.empty((0, self.model.get_sentence_embedding_dimension()))

    def add(self, content: str, metadata: Optional[Dict[str, Any]] = None):
        """Add a new memory item and re-sync memory cache."""
        embedding = self.model.encode(content, convert_to_numpy=True).astype(np.float32)
        
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                "INSERT INTO memories (content, metadata, embedding) VALUES (?, ?, ?)",
                (content, json.dumps(metadata) if metadata else None, embedding.tobytes())
            )
            conn.commit()
        
        # Hot-reload memory cache (for simplicity in V1)
        self._load_vectors()

    def search(self, query: str, top_k: int = 5) -> List[Dict[str, Any]]:
        """Perform semantic search using cosine similarity."""
        if self.vectors_np.shape[0] == 0:
            return []
            
        query_vector = self.model.encode(query, convert_to_numpy=True).astype(np.float32)
        
        # Calculate cosine similarities
        # (v . q) / (||v|| * ||q||)
        # Assuming vectors and query are normalized or we just use dot product if we normalize
        norm_v = np.linalg.norm(self.vectors_np, axis=1)
        norm_q = np.linalg.norm(query_vector)
        
        similarities = np.dot(self.vectors_np, query_vector) / (norm_v * norm_q)
        
        # Get top-k indices
        top_indices = np.argsort(similarities)[::-1][:top_k]
        
        results = []
        for idx in top_indices:
            results.append({
                "content": self.contents[idx],
                "metadata": self.metadatas[idx],
                "score": float(similarities[idx])
            })
            
        return results

# Shared instance for easy access
_store = None

def get_vector_store():
    global _store
    if _store is None:
        _store = VectorStore()
    return _store
