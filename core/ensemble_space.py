"""
core/ensemble_space.py
EnsembleSpace with content-addressable storage (CAS) and artifact manifest.
"""
import os
import hashlib
import sqlite3
import time
from typing import List, Dict, Any, Optional
from core.space_base import Space

class EnsembleSpace(Space):
    def __init__(self, base_dir: str = "data/ensemble_space/"):
        super().__init__()
        self.base_dir = base_dir
        self.manifest_db = os.path.join(base_dir, "manifest.db")
        os.makedirs(base_dir, exist_ok=True)
        self._init_manifest()

    def _init_manifest(self):
        with sqlite3.connect(self.manifest_db) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS artifacts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    symbolic_name TEXT,
                    hash TEXT,
                    state_name TEXT,
                    company_id TEXT,
                    created_at TEXT
                )
            """)

    def write(self, content: bytes, symbolic_name: str, state_name: str = None, company_id: str = None) -> str:
        """Store content in CAS and record in manifest."""
        content_hash = hashlib.sha256(content).hexdigest()
        blob_path = os.path.join(self.base_dir, content_hash)
        
        # Store blob
        with open(blob_path, "wb") as f:
            f.write(content)
            
        # Update manifest
        timestamp = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        with sqlite3.connect(self.manifest_db) as conn:
            conn.execute("""
                INSERT INTO artifacts (symbolic_name, hash, state_name, company_id, created_at)
                VALUES (?, ?, ?, ?, ?)
            """, (symbolic_name, content_hash, state_name, company_id, timestamp))
            
        # --- RAG Indexing Hook ---
        # Index text content for semantic search
        try:
            # Try to decode as text. If it fails (e.g. binary/image), skip indexing for now.
            text_content = content.decode('utf-8')
            from core.rag import get_vector_store
            store = get_vector_store()
            store.add(text_content, {
                "symbolic_name": symbolic_name,
                "state_name": state_name,
                "company_id": company_id,
                "hash": content_hash
            })
        except (UnicodeDecodeError, ImportError, Exception) as e:
            # Log failure but don't break the write operation
            print(f"RAG Indexing skipped for {symbolic_name}: {e}")

        return content_hash

    def read(self, symbolic_name: str) -> Optional[bytes]:
        """Retrieve latest artifact content by symbolic name."""
        with sqlite3.connect(self.manifest_db) as conn:
            cursor = conn.execute("""
                SELECT hash FROM artifacts WHERE symbolic_name = ? ORDER BY created_at DESC LIMIT 1
            """, (symbolic_name,))
            row = cursor.fetchone()
            if row:
                content_hash = row[0]
                blob_path = os.path.join(self.base_dir, content_hash)
                if os.path.exists(blob_path):
                    with open(blob_path, "rb") as f:
                        return f.read()
        return None

    def list_artifacts(self, state_name: str = None) -> List[str]:
        """List symbolic names of artifacts, optionally filtered by state."""
        query = "SELECT DISTINCT symbolic_name FROM artifacts"
        params = []
        if state_name:
            query += " WHERE state_name = ?"
            params.append(state_name)
            
        with sqlite3.connect(self.manifest_db) as conn:
            cursor = conn.execute(query, params)
            return [row[0] for row in cursor.fetchall()]

    def exists(self, symbolic_name: str) -> bool:
        """Check if an artifact exists by its symbolic name."""
        with sqlite3.connect(self.manifest_db) as conn:
            cursor = conn.execute("SELECT 1 FROM artifacts WHERE symbolic_name = ? LIMIT 1", (symbolic_name,))
            return cursor.fetchone() is not None
