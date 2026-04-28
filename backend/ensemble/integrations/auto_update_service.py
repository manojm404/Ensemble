"""
core/auto_update_service.py
Background service for checking and applying marketplace pack updates.
Polls remote sources periodically and notifies UI via WebSocket.
"""

import asyncio
import json
import os
from datetime import datetime
from typing import Any, Callable, Dict, List, Optional

from backend.ensemble.integrations.marketplace_sync import MarketplaceSource, MarketplaceSync
from backend.ensemble.api.ws_manager import ws_manager


class AutoUpdateService:
    """Background service for automatic pack update checking and application."""

    def __init__(
        self,
        marketplace_sync: Optional[MarketplaceSync] = None,
        config_path: str = "config/marketplace_sources.json",
    ):
        self.marketplace_sync = marketplace_sync or MarketplaceSync(config_path)
        self.config_path = config_path
        self.running = False
        self._task: Optional[asyncio.Task] = None
        self._update_callbacks: List[Callable] = []

        # Load settings
        self.settings = self._load_settings()

    def _load_settings(self) -> Dict[str, Any]:
        """Load auto-update settings from config."""
        try:
            if os.path.exists(self.config_path):
                with open(self.config_path, "r") as f:
                    config = json.load(f)
                    return config.get("settings", {})
        except Exception as e:
            print(f"⚠️ [AutoUpdate] Failed to load settings: {e}")

        # Default settings
        return {
            "max_concurrent_downloads": 3,
            "download_timeout_seconds": 30,
            "cache_ttl_seconds": 3600,
            "auto_backup_before_update": True,
            "conflict_resolution_default": "prompt",
        }

    async def start(self):
        """Start the background update service."""
        if self.running:
            print("⚠️ [AutoUpdate] Service already running")
            return

        self.running = True
        self._task = asyncio.create_task(self._update_loop())
        print("✅ [AutoUpdate] Background service started")

    async def stop(self):
        """Stop the background update service."""
        if not self.running:
            return

        self.running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        print("🛑 [AutoUpdate] Background service stopped")

    async def _update_loop(self):
        """Main loop - check for updates periodically."""
        while self.running:
            try:
                # Get minimum polling interval from all sources
                min_interval = self._get_min_polling_interval()

                print(f"🔄 [AutoUpdate] Checking for updates...")
                await self._check_all_sources()

                # Wait for next check
                print(f"⏰ [AutoUpdate] Next check in {min_interval}s")
                await asyncio.sleep(min_interval)

            except asyncio.CancelledError:
                print("🛑 [AutoUpdate] Update loop cancelled")
                break
            except Exception as e:
                print(f"❌ [AutoUpdate] Error in update loop: {e}")
                # Wait before retrying on error
                await asyncio.sleep(60)

    def _get_min_polling_interval(self) -> int:
        """Get minimum polling interval from all enabled sources."""
        intervals = [
            source.polling_interval
            for source in self.marketplace_sync.sources
            if source.enabled and hasattr(source, "polling_interval")
        ]

        return min(intervals) if intervals else 3600  # Default 1 hour

    async def _check_all_sources(self):
        """Check all enabled sources for updates."""
        # Get installed packs
        installed_packs = self._get_installed_packs()

        if not installed_packs:
            print("ℹ️ [AutoUpdate] No packs installed, skipping update check")
            return

        print(f"🔍 [AutoUpdate] Checking {len(installed_packs)} installed packs...")

        for source in self.marketplace_sync.sources:
            if not source.enabled:
                continue

            await self._check_source_updates(source, installed_packs)

    def _get_installed_packs(self) -> Dict[str, str]:
        """Get all installed packs and their versions."""
        custom_dir = "data/agents/custom"
        installed = {}

        if not os.path.exists(custom_dir):
            return installed

        for item in os.listdir(custom_dir):
            item_path = os.path.join(custom_dir, item)
            if not os.path.isdir(item_path):
                continue

            # Check for pack metadata
            meta_path = os.path.join(item_path, ".pack_meta.json")
            if os.path.exists(meta_path):
                try:
                    with open(meta_path, "r") as f:
                        meta = json.load(f)
                        installed[item] = meta.get("version", "1.0.0")
                except Exception as e:
                    print(f"⚠️ [AutoUpdate] Failed to read metadata for {item}: {e}")

        return installed

    async def _check_source_updates(
        self, source: MarketplaceSource, installed_packs: Dict[str, str]
    ):
        """Check a specific source for updates."""
        try:
            for pack_id, local_version in installed_packs.items():
                update_info = source.check_for_updates(pack_id, local_version)

                if update_info.get("has_update"):
                    print(
                        f"📢 [AutoUpdate] Update available: {pack_id} {local_version} → {update_info['remote_version']}"
                    )

                    # Check if auto-update is enabled for this source
                    if getattr(source, "auto_update", False):
                        await self._apply_update(source, pack_id, update_info)
                    else:
                        # Notify UI via WebSocket
                        await self._notify_update_available(pack_id, update_info)

        except Exception as e:
            print(f"❌ [AutoUpdate] Failed to check {source.name}: {e}")

    async def _apply_update(
        self, source: MarketplaceSource, pack_id: str, update_info: Dict[str, Any]
    ):
        """Automatically apply an update."""
        try:
            print(f"🔄 [AutoUpdate] Auto-updating {pack_id}...")

            # Backup current version
            if self.settings.get("auto_backup_before_update", True):
                self._backup_pack(pack_id)

            # Download new version
            pack_dir = os.path.join("data/agents/custom", pack_id)

            # Download ZIP from source
            zip_data = source.download_pack_zip(pack_id)
            if not zip_data:
                print(f"❌ [AutoUpdate] Failed to download {pack_id}")
                return

            # Extract and install
            import io
            import zipfile

            # Clear current pack
            if os.path.exists(pack_dir):
                import shutil

                shutil.rmtree(pack_dir)

            os.makedirs(pack_dir, exist_ok=True)

            # Extract new version
            with zipfile.ZipFile(io.BytesIO(zip_data)) as zf:
                zf.extractall(pack_dir)

            # Update metadata
            meta_path = os.path.join(pack_dir, ".pack_meta.json")
            if os.path.exists(meta_path):
                with open(meta_path, "r") as f:
                    meta = json.load(f)
            else:
                meta = {}

            meta["version"] = update_info["remote_version"]
            meta["updated_at"] = datetime.now().isoformat()
            meta["auto_updated"] = True

            with open(meta_path, "w") as f:
                json.dump(meta, f, indent=2)

            # Sync registry
            from backend.ensemble.skill_registry import skill_registry

            skill_registry.sync_all()

            print(
                f"✅ [AutoUpdate] Successfully updated {pack_id} to {update_info['remote_version']}"
            )

            # Notify UI
            await self._notify_update_applied(pack_id, update_info)

        except Exception as e:
            print(f"❌ [AutoUpdate] Failed to apply update for {pack_id}: {e}")
            # Attempt rollback
            self._rollback_pack(pack_id)

    async def _notify_update_available(self, pack_id: str, update_info: Dict[str, Any]):
        """Notify UI of available update via WebSocket."""
        try:
            await ws_manager.broadcast(
                company_id="system",
                event_type="PACK_UPDATE_AVAILABLE",
                data={
                    "pack_id": pack_id,
                    "local_version": update_info.get("local_version", "unknown"),
                    "remote_version": update_info.get("remote_version", "unknown"),
                    "pack_name": update_info.get("remote_pack", {}).get(
                        "name", pack_id
                    ),
                    "timestamp": datetime.now().isoformat(),
                },
            )
            print(f"📡 [AutoUpdate] Notified UI of update: {pack_id}")
        except Exception as e:
            print(f"⚠️ [AutoUpdate] Failed to notify UI: {e}")

    async def _notify_update_applied(self, pack_id: str, update_info: Dict[str, Any]):
        """Notify UI that an update was automatically applied."""
        try:
            await ws_manager.broadcast(
                company_id="system",
                event_type="PACK_UPDATED",
                data={
                    "pack_id": pack_id,
                    "old_version": update_info.get("local_version", "unknown"),
                    "new_version": update_info.get("remote_version", "unknown"),
                    "timestamp": datetime.now().isoformat(),
                },
            )
            print(f"📡 [AutoUpdate] Notified UI of applied update: {pack_id}")
        except Exception as e:
            print(f"⚠️ [AutoUpdate] Failed to notify UI: {e}")

    def _backup_pack(self, pack_id: str) -> bool:
        """Backup a pack before updating."""
        try:
            import shutil

            pack_dir = os.path.join("data/agents/custom", pack_id)
            archive_dir = os.path.join("data/agents/archive", pack_id, "auto_backup")

            if not os.path.exists(pack_dir):
                return False

            os.makedirs(archive_dir, exist_ok=True)

            # Copy pack to archive
            for item in os.listdir(pack_dir):
                src = os.path.join(pack_dir, item)
                dst = os.path.join(archive_dir, item)
                if os.path.isdir(src):
                    shutil.copytree(src, dst, dirs_exist_ok=True)
                else:
                    shutil.copy2(src, dst)

            print(f"💾 [AutoUpdate] Backed up {pack_id} to {archive_dir}")
            return True

        except Exception as e:
            print(f"❌ [AutoUpdate] Failed to backup {pack_id}: {e}")
            return False

    def _rollback_pack(self, pack_id: str) -> bool:
        """Rollback a pack to the latest backup."""
        try:
            import shutil

            archive_dir = os.path.join("data/agents/archive", pack_id, "auto_backup")
            pack_dir = os.path.join("data/agents/custom", pack_id)

            if not os.path.exists(archive_dir):
                print(f"⚠️ [AutoUpdate] No backup found for {pack_id}")
                return False

            # Clear current pack
            if os.path.exists(pack_dir):
                shutil.rmtree(pack_dir)

            # Restore from backup
            shutil.copytree(archive_dir, pack_dir)

            print(f"↩️ [AutoUpdate] Rolled back {pack_id} to backup")
            return True

        except Exception as e:
            print(f"❌ [AutoUpdate] Failed to rollback {pack_id}: {e}")
            return False

    def on_update(self, callback: Callable):
        """Register a callback for when updates are found."""
        self._update_callbacks.append(callback)

    def check_now(self) -> List[Dict[str, Any]]:
        """Manually trigger an update check (synchronous)."""
        installed_packs = self._get_installed_packs()
        updates = []

        for source in self.marketplace_sync.sources:
            if not source.enabled:
                continue

            for pack_id, local_version in installed_packs.items():
                update_info = source.check_for_updates(pack_id, local_version)
                if update_info.get("has_update"):
                    updates.append(update_info)

        return updates

    def get_status(self) -> Dict[str, Any]:
        """Get service status."""
        return {
            "running": self.running,
            "sources": self.marketplace_sync.get_source_status(),
            "installed_packs": self._get_installed_packs(),
            "settings": self.settings,
        }


# Global instance
auto_update_service = AutoUpdateService()
