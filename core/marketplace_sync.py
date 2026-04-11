"""
core/marketplace_sync.py
Remote marketplace synchronization from GitHub repositories.
Fetches agent packs from external sources and transforms them to Ensemble format.
"""
import os
import json
import requests
from typing import List, Dict, Any, Optional
from datetime import datetime
from pathlib import Path


class MarketplaceSource:
    """Represents a remote marketplace source (e.g., GitHub repository)."""
    
    def __init__(self, config: Dict[str, Any]):
        self.id = config['id']
        self.name = config['name']
        self.type = config.get('type', 'github')
        self.enabled = config.get('enabled', True)
        self.config = config
        
        # GitHub-specific config
        if self.type == 'github':
            self.repo = config['repo']  # e.g., "wshobson/agents"
            self.branch = config.get('branch', 'main')
            self.plugins_path = config.get('plugins_path', 'plugins/')
            self.manifest_path = config.get('manifest_path', '.claude-plugin/marketplace.json')
            self.polling_interval = config.get('polling_interval_seconds', 3600)
            self.auto_update = config.get('auto_update', False)
            
        # Rate limiting
        self._last_request_time = 0
        self._request_count = 0
        self._rate_limit_remaining = 5000
    
    def fetch_available_packs(self) -> List[Dict[str, Any]]:
        """Fetch available packs from remote source."""
        if not self.enabled:
            return []
        
        if self.type == 'github':
            return self._fetch_from_github()
        elif self.type == 'local':
            return self._fetch_from_local()
        
        return []
    
    def _fetch_from_github(self) -> List[Dict[str, Any]]:
        """Fetch packs from GitHub repository."""
        try:
            # Step 1: Fetch marketplace.json manifest
            manifest = self._fetch_manifest()
            if not manifest:
                print(f"⚠️ [MarketplaceSync] No manifest found in {self.repo}")
                return []
            
            # Step 2: Transform plugins to Ensemble pack format
            packs = []
            plugins = manifest.get('plugins', [])
            
            print(f"📦 [MarketplaceSync] Found {len(plugins)} plugins in {self.repo}")
            
            for plugin in plugins:
                pack = self._transform_plugin_to_pack(plugin)
                if pack:
                    packs.append(pack)
            
            print(f"✅ [MarketplaceSync] Transformed {len(packs)} packs from {self.repo}")
            return packs
            
        except Exception as e:
            print(f"❌ [MarketplaceSync] Failed to fetch from GitHub: {e}")
            return []
    
    def _fetch_manifest(self) -> Optional[Dict[str, Any]]:
        """Fetch marketplace.json from GitHub."""
        url = f"https://raw.githubusercontent.com/{self.repo}/{self.branch}/{self.manifest_path}"
        
        try:
            response = self._make_request(url)
            if response.status_code == 200:
                return response.json()
            else:
                print(f"⚠️ [MarketplaceSync] Manifest not found (HTTP {response.status_code})")
                return None
        except Exception as e:
            print(f"❌ [MarketplaceSync] Failed to fetch manifest: {e}")
            return None
    
    def _transform_plugin_to_pack(self, plugin: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Transform a plugin definition to Ensemble pack format."""
        try:
            plugin_name = plugin.get('name', '')
            plugin_source = plugin.get('source', '')
            
            # Scan for agent files in the plugin
            agent_files = self._scan_plugin_agents(plugin_name)
            
            if not agent_files:
                print(f"⚠️ [MarketplaceSync] No agent files found in plugin: {plugin_name}")
                return None
            
            # Build pack
            pack = {
                'id': plugin_name,
                'name': self._format_plugin_name(plugin_name),
                'description': plugin.get('description', ''),
                'emoji': self._guess_emoji(plugin.get('category', '')),
                'version': plugin.get('version', '1.0.0'),
                'author': self._extract_author(plugin.get('author', {})),
                'source': 'github',
                'repo': self.repo,
                'branch': self.branch,
                'download_url': self._build_download_url(plugin_name),
                'agent_files': agent_files,
                'category': plugin.get('category', 'General'),
                'homepage': plugin.get('homepage', ''),
                'license': plugin.get('license', 'MIT'),
                'fetched_at': datetime.now().isoformat()
            }
            
            return pack
            
        except Exception as e:
            print(f"❌ [MarketplaceSync] Failed to transform plugin {plugin.get('name', 'unknown')}: {e}")
            return None
    
    def _scan_plugin_agents(self, plugin_name: str) -> List[str]:
        """Scan a plugin directory for agent .md files."""
        agents_path = f"plugins/{plugin_name}/agents"
        
        try:
            files = self._list_directory(agents_path)
            agent_files = [f for f in files if f.endswith('.md')]
            return agent_files
        except Exception as e:
            print(f"⚠️ [MarketplaceSync] Failed to scan agents for {plugin_name}: {e}")
            return []
    
    def _list_directory(self, path: str) -> List[str]:
        """List files in a GitHub directory."""
        url = f"https://api.github.com/repos/{self.repo}/contents/{path}?ref={self.branch}"
        
        try:
            response = self._make_request(url)
            if response.status_code == 200:
                items = response.json()
                return [item['name'] for item in items if item['type'] == 'file']
            return []
        except Exception as e:
            print(f"⚠️ [MarketplaceSync] Failed to list directory {path}: {e}")
            return []
    
    def _build_download_url(self, plugin_name: str) -> str:
        """Build ZIP download URL for a plugin."""
        # For now, we'll build ZIP on-demand via the backend
        # This URL points to our local endpoint that will fetch from GitHub
        return f"http://127.0.0.1:8088/api/marketplace/download/{self.id}/{plugin_name}"
    
    def _fetch_from_local(self) -> List[Dict[str, Any]]:
        """Fetch packs from local filesystem (for testing/local sources)."""
        path = self.config.get('path', 'data/marketplace/zips')
        manifest_path = self.config.get('manifest_path', 'data/marketplace/packs.json')
        
        try:
            if os.path.exists(manifest_path):
                with open(manifest_path, 'r') as f:
                    data = json.load(f)
                    return data.get('packs', [])
            return []
        except Exception as e:
            print(f"❌ [MarketplaceSync] Failed to fetch from local: {e}")
            return []
    
    def check_for_updates(self, pack_id: str, local_version: str) -> Dict[str, Any]:
        """Check if remote has a newer version of a pack."""
        try:
            remote_packs = self.fetch_available_packs()
            remote_pack = next((p for p in remote_packs if p['id'] == pack_id), None)
            
            if not remote_pack:
                return {
                    'has_update': False,
                    'reason': 'Pack not found in remote source',
                    'pack_id': pack_id
                }
            
            # Compare versions
            from packaging.version import Version, InvalidVersion
            try:
                local_v = Version(local_version)
                remote_v = Version(remote_pack['version'])
                has_update = remote_v > local_v
            except InvalidVersion:
                # Fallback to string comparison
                has_update = remote_pack['version'] != local_version
            
            return {
                'pack_id': pack_id,
                'local_version': local_version,
                'remote_version': remote_pack['version'],
                'has_update': has_update,
                'remote_pack': remote_pack
            }
            
        except Exception as e:
            print(f"❌ [MarketplaceSync] Failed to check updates for {pack_id}: {e}")
            return {
                'has_update': False,
                'error': str(e),
                'pack_id': pack_id
            }
    
    def download_pack_zip(self, plugin_name: str) -> Optional[bytes]:
        """Download a plugin as a ZIP file."""
        try:
            # Fetch all files from the plugin directory
            files = self._fetch_directory(f"plugins/{plugin_name}")
            
            if not files:
                return None
            
            # Build ZIP in memory
            import zipfile
            import io
            
            zip_buffer = io.BytesIO()
            with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
                for file_path, content in files:
                    zf.writestr(file_path, content)
                
                # Add pack.json manifest
                manifest = self._build_pack_manifest(plugin_name)
                zf.writestr('pack.json', json.dumps(manifest, indent=2))
            
            zip_buffer.seek(0)
            return zip_buffer.getvalue()
            
        except Exception as e:
            print(f"❌ [MarketplaceSync] Failed to download pack {plugin_name}: {e}")
            return None
    
    def _fetch_directory(self, path: str, files: Optional[List] = None) -> List[tuple]:
        """Recursively fetch all files from a GitHub directory."""
        if files is None:
            files = []
        
        url = f"https://api.github.com/repos/{self.repo}/contents/{path}?ref={self.branch}"
        
        try:
            response = self._make_request(url)
            if response.status_code != 200:
                return files
            
            items = response.json()
            
            for item in items:
                if item['type'] == 'file':
                    # Fetch file content
                    content_response = self._make_request(item['download_url'])
                    if content_response.status_code == 200:
                        relative_path = item['path'].replace(f"plugins/", "", 1)
                        files.append((relative_path, content_response.text))
                
                elif item['type'] == 'dir':
                    # Recurse into subdirectory
                    self._fetch_directory(item['path'], files)
            
            return files
            
        except Exception as e:
            print(f"⚠️ [MarketplaceSync] Failed to fetch directory {path}: {e}")
            return files
    
    def _build_pack_manifest(self, plugin_name: str) -> Dict[str, Any]:
        """Build a pack.json manifest for a downloaded plugin."""
        return {
            'pack_id': plugin_name,
            'source': 'github',
            'repo': self.repo,
            'branch': self.branch,
            'downloaded_at': datetime.now().isoformat(),
            'version': '1.0.0'  # Will be updated when fetched from remote manifest
        }
    
    def _make_request(self, url: str, timeout: int = 10) -> requests.Response:
        """Make HTTP request with rate limiting and error handling."""
        # Check rate limit
        if self._request_count >= 4500:  # Stay under 5000/hr limit
            print(f"⚠️ [MarketplaceSync] Approaching GitHub API rate limit")
        
        # Add auth token if available
        headers = {'Accept': 'application/vnd.github.v3+json'}
        gh_token = os.getenv('GITHUB_TOKEN')
        if gh_token:
            headers['Authorization'] = f'token {gh_token}'
        
        response = requests.get(url, headers=headers, timeout=timeout)
        
        # Update rate limit tracking
        self._request_count += 1
        self._last_request_time = datetime.now().timestamp()
        
        # Check rate limit headers
        remaining = response.headers.get('X-RateLimit-Remaining')
        if remaining:
            self._rate_limit_remaining = int(remaining)
        
        return response
    
    def _format_plugin_name(self, name: str) -> str:
        """Convert plugin name to human-readable format."""
        return name.replace('-', ' ').replace('_', ' ').title()
    
    def _guess_emoji(self, category: str) -> str:
        """Guess appropriate emoji based on category."""
        emoji_map = {
            'development': '💻',
            'ai-ml': '🤖',
            'security': '🔒',
            'infrastructure': '🏗️',
            'data': '📊',
            'devops': '⚙️',
            'mobile': '📱',
            'cloud': '☁️',
            'business': '💼',
            'documentation': '📝',
            'testing': '🧪',
            'database': '🗄️',
            'frontend': '🎨',
            'backend': '🔧',
            'general': '📦'
        }
        return emoji_map.get(category.lower(), '📦')
    
    def _extract_author(self, author: Dict[str, Any]) -> str:
        """Extract author name from author object."""
        if isinstance(author, dict):
            return author.get('name', 'Unknown')
        return str(author) if author else 'Unknown'
    
    def get_status(self) -> Dict[str, Any]:
        """Get source status and statistics."""
        return {
            'id': self.id,
            'name': self.name,
            'type': self.type,
            'enabled': self.enabled,
            'repo': self.config.get('repo'),
            'rate_limit_remaining': self._rate_limit_remaining,
            'last_request': self._last_request_time,
            'total_requests': self._request_count
        }


class MarketplaceSync:
    """Main orchestrator for marketplace synchronization."""
    
    def __init__(self, config_path: str = "config/marketplace_sources.json"):
        self.config_path = config_path
        self.sources: List[MarketplaceSource] = []
        self._load_config()
    
    def _load_config(self):
        """Load marketplace source configuration."""
        try:
            if os.path.exists(self.config_path):
                with open(self.config_path, 'r') as f:
                    config = json.load(f)
                    sources_config = config.get('sources', [])
                    self.sources = [MarketplaceSource(c) for c in sources_config]
                    print(f"✅ [MarketplaceSync] Loaded {len(self.sources)} sources")
            else:
                print(f"⚠️ [MarketplaceSync] Config not found: {self.config_path}")
                self.sources = []
        except Exception as e:
            print(f"❌ [MarketplaceSync] Failed to load config: {e}")
            self.sources = []
    
    def fetch_all_packs(self) -> List[Dict[str, Any]]:
        """Fetch packs from all enabled sources."""
        all_packs = []
        
        for source in self.sources:
            if not source.enabled:
                continue
            
            print(f"🔄 [MarketplaceSync] Fetching from {source.name}...")
            packs = source.fetch_available_packs()
            all_packs.extend(packs)
        
        print(f"✅ [MarketplaceSync] Total packs fetched: {len(all_packs)}")
        return all_packs
    
    def check_all_updates(self, installed_packs: Dict[str, str]) -> List[Dict[str, Any]]:
        """Check for updates across all sources."""
        updates = []
        
        for pack_id, local_version in installed_packs.items():
            for source in self.sources:
                if not source.enabled:
                    continue
                
                update_info = source.check_for_updates(pack_id, local_version)
                if update_info.get('has_update'):
                    updates.append(update_info)
        
        return updates
    
    def download_pack(self, source_id: str, plugin_name: str) -> Optional[bytes]:
        """Download a pack from specific source."""
        source = next((s for s in self.sources if s.id == source_id), None)
        if not source:
            print(f"❌ [MarketplaceSync] Source not found: {source_id}")
            return None
        
        return source.download_pack_zip(plugin_name)
    
    def get_source_status(self) -> List[Dict[str, Any]]:
        """Get status of all sources."""
        return [source.get_status() for source in self.sources]
    
    def add_source(self, config: Dict[str, Any]):
        """Add a new marketplace source."""
        source = MarketplaceSource(config)
        self.sources.append(source)
        self._save_config()
        print(f"✅ [MarketplaceSync] Added source: {source.name}")
    
    def remove_source(self, source_id: str):
        """Remove a marketplace source."""
        self.sources = [s for s in self.sources if s.id != source_id]
        self._save_config()
        print(f"✅ [MarketplaceSync] Removed source: {source_id}")
    
    def _save_config(self):
        """Save current configuration."""
        config = {
            'sources': [
                {
                    'id': s.id,
                    'name': s.name,
                    'type': s.type,
                    'enabled': s.enabled,
                    **s.config
                }
                for s in self.sources
            ]
        }
        
        os.makedirs(os.path.dirname(self.config_path), exist_ok=True)
        with open(self.config_path, 'w') as f:
            json.dump(config, f, indent=2)


# Global instance
marketplace_sync = MarketplaceSync()
