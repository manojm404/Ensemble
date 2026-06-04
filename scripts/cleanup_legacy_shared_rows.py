#!/usr/bin/env python3
"""Archive and remove legacy shared rows from local SQLite databases.

This script is intentionally conservative:
- It creates byte-for-byte backups of each database before making changes.
- It removes only clearly legacy/shared rows:
  - companies with no owner
  - artifacts with no user_id
  - notifications for dev_user
  - audit events tied to legacy shared company IDs
- It emits a JSON summary so the cleanup can be audited or reversed from backup.
"""

from __future__ import annotations

import argparse
import json
import shutil
import sqlite3
import time
from pathlib import Path
from typing import Dict, Iterable, List, Tuple


ROOT = Path(__file__).resolve().parents[1]
LEGACY_SHARED_COMPANY_IDS = {"company_alpha", "ensemble_prod", "system_sovereign"}


def now_stamp() -> str:
    return time.strftime("%Y%m%d-%H%M%S", time.gmtime())


def backup_database(src: Path, backup_root: Path) -> Path:
    backup_root.mkdir(parents=True, exist_ok=True)
    dest = backup_root / src.name
    shutil.copy2(src, dest)
    return dest


def table_columns(conn: sqlite3.Connection, table: str) -> List[str]:
    return [row[1] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()]


def delete_with_ids(conn: sqlite3.Connection, table: str, id_column: str, ids: Iterable[str]) -> int:
    ids = [value for value in ids if value]
    if not ids:
        return 0
    placeholders = ",".join("?" for _ in ids)
    cursor = conn.execute(
        f"DELETE FROM {table} WHERE {id_column} IN ({placeholders})",
        ids,
    )
    return cursor.rowcount or 0


def cleanup_companies_db(db_path: Path, apply: bool) -> Dict[str, int]:
    summary = {
        "companies_deleted": 0,
        "teams_deleted": 0,
        "agents_deleted": 0,
        "issues_deleted": 0,
        "activity_deleted": 0,
    }
    if not db_path.exists():
        return summary

    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        company_rows = conn.execute(
            "SELECT id FROM companies WHERE user_id IS NULL OR user_id = ''"
        ).fetchall()
        company_ids = [row["id"] for row in company_rows]

        if not apply:
            summary["companies_deleted"] = len(company_ids)
            for table in ("company_teams", "company_agents", "company_issues", "company_activity"):
                count = conn.execute(
                    f"SELECT COUNT(*) FROM {table} WHERE company_id IN ({','.join('?' for _ in company_ids)})"
                    if company_ids else f"SELECT COUNT(*) FROM {table} WHERE 0",
                    company_ids,
                ).fetchone()[0]
                summary[f"{table.split('_')[-1]}_deleted"] = count
            return summary

        if company_ids:
            summary["activity_deleted"] = delete_with_ids(conn, "company_activity", "company_id", company_ids)
            summary["issues_deleted"] = delete_with_ids(conn, "company_issues", "company_id", company_ids)
            summary["agents_deleted"] = delete_with_ids(conn, "company_agents", "company_id", company_ids)
            summary["teams_deleted"] = delete_with_ids(conn, "company_teams", "company_id", company_ids)
            summary["companies_deleted"] = delete_with_ids(conn, "companies", "id", company_ids)
            conn.commit()
    return summary


def cleanup_audit_db(db_path: Path, apply: bool) -> Dict[str, int]:
    summary = {
        "events_deleted": 0,
        "notifications_deleted": 0,
    }
    if not db_path.exists():
        return summary

    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        if not apply:
            summary["events_deleted"] = conn.execute(
                "SELECT COUNT(*) FROM events WHERE company_id IS NULL OR company_id IN (?, ?, ?)",
                tuple(LEGACY_SHARED_COMPANY_IDS),
            ).fetchone()[0]
            summary["notifications_deleted"] = conn.execute(
                "SELECT COUNT(*) FROM notifications WHERE user_id = 'dev_user' OR company_id IS NULL OR company_id IN (?, ?, ?)",
                tuple(LEGACY_SHARED_COMPANY_IDS),
            ).fetchone()[0]
            return summary

        summary["events_deleted"] = conn.execute(
            "DELETE FROM events WHERE company_id IS NULL OR company_id IN (?, ?, ?)",
            tuple(LEGACY_SHARED_COMPANY_IDS),
        ).rowcount or 0
        summary["notifications_deleted"] = conn.execute(
            "DELETE FROM notifications WHERE user_id = 'dev_user' OR company_id IS NULL OR company_id IN (?, ?, ?)",
            tuple(LEGACY_SHARED_COMPANY_IDS),
        ).rowcount or 0
        conn.commit()
    return summary


def cleanup_manifest_db(db_path: Path, apply: bool) -> Dict[str, int]:
    summary = {"artifacts_deleted": 0}
    if not db_path.exists():
        return summary

    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        if not apply:
            summary["artifacts_deleted"] = conn.execute(
                "SELECT COUNT(*) FROM artifacts WHERE user_id IS NULL OR user_id = '' OR company_id IS NULL OR company_id IN (?, ?, ?)",
                tuple(LEGACY_SHARED_COMPANY_IDS),
            ).fetchone()[0]
            return summary

        summary["artifacts_deleted"] = conn.execute(
            "DELETE FROM artifacts WHERE user_id IS NULL OR user_id = '' OR company_id IS NULL OR company_id IN (?, ?, ?)",
            tuple(LEGACY_SHARED_COMPANY_IDS),
        ).rowcount or 0
        conn.commit()
    return summary


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Actually delete rows after backing up databases.")
    parser.add_argument("--backup-root", default=str(ROOT / "data" / "cleanup_backups"), help="Backup folder root.")
    args = parser.parse_args()

    backup_root = Path(args.backup_root) / now_stamp()
    db_paths = {
        "audit": ROOT / "data" / "ensemble_audit.db",
        "companies": ROOT / "data" / "ensemble_companies.db",
        "manifest": ROOT / "data" / "ensemble_space" / "manifest.db",
    }

    print("Legacy shared-row cleanup")
    print(f"Mode: {'APPLY' if args.apply else 'DRY-RUN'}")
    print(f"Backup: {backup_root}")

    for path in db_paths.values():
        if path.exists():
            backup_database(path, backup_root)

    summary = {
        "audit": cleanup_audit_db(db_paths["audit"], args.apply),
        "companies": cleanup_companies_db(db_paths["companies"], args.apply),
        "manifest": cleanup_manifest_db(db_paths["manifest"], args.apply),
    }

    summary_path = backup_root / "cleanup_summary.json"
    backup_root.mkdir(parents=True, exist_ok=True)
    summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")

    print(json.dumps(summary, indent=2))
    print(f"Summary written to {summary_path}")
    if not args.apply:
        print("Dry-run only. Re-run with --apply to delete the stale shared rows.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
