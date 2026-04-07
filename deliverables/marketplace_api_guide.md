# 🛒 Ensemble Marketplace API Guide

This guide describes the new local-first Marketplace endpoints available in the Ensemble backend (port 8089).

## 1. Pack Listing
**`GET /api/marketplace/packs`**
*   **Description**: Fetches the available agent packs from the remote/local manifest.
*   **Response**:
    ```json
    {
      "version": 1,
      "packs": [
        {
          "id": "game-dev-pack",
          "name": "Game Development Pack",
          "emoji": "🎮",
          "version": "1.0.0",
          "author": "Community",
          "download_url": "https://...",
          "agent_files": ["unity-architect.md"]
        }
      ]
    }
    ```

## 2. Installation
**`POST /api/marketplace/install`**
*   **Body**: `{"pack_id": "string", "download_url": "string", "version": "string"}`
*   **Behavior**: Downloads ZIP, extracts to `data/agents/custom/<pack_id>`, saves metadata, and re-syncs the registry.
*   **Error Handling**: Returns `500` if download or extraction fails. Partial files are cleaned up automatically.

## 3. Updates
**`POST /api/marketplace/update/{pack_id}`**
*   **Description**: Compares local version with remote manifest.
*   **Behavior**: Archives existing files to `data/agents/archive/<pack_id>/v<old_version>` and installs the newest version.
*   **Response**: `{"status": "success", "old_version": "1.0.0", "new_version": "1.1.0"}`

## 4. Rollback
**`POST /api/marketplace/rollback/{pack_id}`**
*   **Body**: `{"version": "string"}` (e.g., `"1.0.0"`)
*   **Behavior**: Restores files from the archive and updates the local metadata.

## 5. Agent Statistics
**`GET /api/agents/stats`**
*   **Description**: Returns usage metadata for **all** agents (Native, Custom, Imported).
*   **Response**:
    ```json
    {
      "stats": [
        {
          "agent_id": "native_researcher",
          "usage_count": 42,
          "total_cost": 0.0125,
          "last_used": "2026-04-07T..."
        }
      ]
    }
    ```

## 6. Directory Structure (Post-Install)
```text
data/
  agents/
    custom/
      <pack_id>/
        .pack_meta.json   # Local version tracker
        agent_one.md
        agent_two.md
    archive/              # Rollback storage
      <pack_id>/
        v1.0.0/
          ...
```

---
*Note: All endpoints return standard JSON and use port 1420 (UI) permissible CORS.*
