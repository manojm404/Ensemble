"""
core/ensemble_space.py
EnsembleSpace with content-addressable storage (CAS) and artifact manifest.
Phase 3: Added user_id scoping for multi-tenant isolation.
"""

import hashlib
import os
import sqlite3
import time
from typing import List, Optional

from backend.ensemble.storage.space_base import Space


class EnsembleSpace(Space):
    def __init__(self, base_dir: str = "data/ensemble_space/"):
        super().__init__()
        self.base_dir = base_dir
        self.manifest_db = os.path.join(base_dir, "manifest.db")
        os.makedirs(base_dir, exist_ok=True)
        self._init_manifest()

    def _get_user_dir(self, user_id: str = None) -> str:
        """Get user-scoped storage directory."""
        if user_id:
            user_dir = os.path.join(self.base_dir, "users", user_id)
        else:
            user_dir = self.base_dir
        os.makedirs(user_dir, exist_ok=True)
        return user_dir

    def _init_manifest(self):
        with sqlite3.connect(self.manifest_db) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS artifacts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    symbolic_name TEXT,
                    hash TEXT,
                    state_name TEXT,
                    company_id TEXT,
                    user_id TEXT,
                    created_at TEXT
                )
            """)
            # Add user_id column if it doesn't exist (migration)
            try:
                conn.execute("ALTER TABLE artifacts ADD COLUMN user_id TEXT")
            except sqlite3.OperationalError:
                pass  # Column already exists

    def write(
        self,
        content: bytes,
        symbolic_name: str,
        state_name: str = None,
        company_id: str = None,
        user_id: str = None,
    ) -> str:
        """Store content in CAS and record in manifest. Phase 3: user_id scoping."""
        user_dir = self._get_user_dir(user_id)
        content_hash = hashlib.sha256(content).hexdigest()
        blob_path = os.path.join(user_dir, content_hash)

        # Store blob
        with open(blob_path, "wb") as f:
            f.write(content)

        # Update manifest
        timestamp = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        with sqlite3.connect(self.manifest_db) as conn:
            conn.execute(
                """
                INSERT INTO artifacts (symbolic_name, hash, state_name, company_id, user_id, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
            """,
                (
                    symbolic_name,
                    content_hash,
                    state_name,
                    company_id,
                    user_id,
                    timestamp,
                ),
            )

        # --- RAG Indexing Hook ---
        try:
            text_content = content.decode("utf-8")
            from backend.ensemble.rag import get_vector_store

            store = get_vector_store()
            store.add(
                text_content,
                {
                    "symbolic_name": symbolic_name,
                    "state_name": state_name,
                    "company_id": company_id,
                    "user_id": user_id,
                    "hash": content_hash,
                },
            )
        except (UnicodeDecodeError, ImportError, Exception) as e:
            print(f"RAG Indexing skipped for {symbolic_name}: {e}")

        return content_hash

    def read(self, symbolic_name: str, user_id: str = None) -> Optional[bytes]:
        """Retrieve latest artifact content by symbolic name. Phase 3: user-scoped."""
        user_dir = self._get_user_dir(user_id)

        with sqlite3.connect(self.manifest_db) as conn:
            query = "SELECT hash FROM artifacts WHERE symbolic_name = ?"
            params = [symbolic_name]

            if user_id:
                query += " AND (user_id = ? OR user_id IS NULL)"
                params.append(user_id)

            query += " ORDER BY created_at DESC LIMIT 1"

            cursor = conn.execute(query, params)
            row = cursor.fetchone()
            if row:
                content_hash = row[0]
                blob_path = os.path.join(user_dir, content_hash)
                if os.path.exists(blob_path):
                    with open(blob_path, "rb") as f:
                        return f.read()
        return None

    def read_all_versions(self, symbolic_name: str, user_id: str = None) -> List[bytes]:
        """Retrieve all historical versions of an artifact by symbolic name."""
        user_dir = self._get_user_dir(user_id)
        versions = []

        with sqlite3.connect(self.manifest_db) as conn:
            query = "SELECT hash FROM artifacts WHERE symbolic_name = ?"
            params = [symbolic_name]

            if user_id:
                query += " AND (user_id = ? OR user_id IS NULL)"
                params.append(user_id)

            query += " ORDER BY created_at ASC"  # Oldest first

            cursor = conn.execute(query, params)
            for row in cursor.fetchall():
                content_hash = row[0]
                blob_path = os.path.join(user_dir, content_hash)
                if os.path.exists(blob_path):
                    with open(blob_path, "rb") as f:
                        versions.append(f.read())
        return versions

    def list_artifacts(self, state_name: str = None, user_id: str = None) -> List[str]:
        """List symbolic names, optionally filtered by state and user."""
        query = "SELECT DISTINCT symbolic_name FROM artifacts"
        params = []
        conditions = []

        if state_name:
            conditions.append("state_name = ?")
            params.append(state_name)
        if user_id:
            conditions.append("(user_id = ? OR user_id IS NULL)")
            params.append(user_id)

        if conditions:
            query += " WHERE " + " AND ".join(conditions)

        with sqlite3.connect(self.manifest_db) as conn:
            cursor = conn.execute(query, params)
            return [row[0] for row in cursor.fetchall()]

    def exists(self, symbolic_name: str, user_id: str = None) -> bool:
        """Check if an artifact exists. Phase 3: user-scoped."""
        with sqlite3.connect(self.manifest_db) as conn:
            query = "SELECT 1 FROM artifacts WHERE symbolic_name = ?"
            params = [symbolic_name]

            if user_id:
                query += " AND (user_id = ? OR user_id IS NULL)"
                params.append(user_id)

            query += " LIMIT 1"
            cursor = conn.execute(query, params)
            return cursor.fetchone() is not None
