"""
core/github_pack_builder.py
On-demand ZIP builder for GitHub repositories.
Fetches plugin directories from GitHub and builds downloadable ZIP files.
"""
import os
import io
import zipfile
import requests
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime


class GitHubPackBuilder:
    """Builds downloadable ZIP packs from GitHub repository contents."""
    
    def __init__(self, repo: str, branch: str = "main", token: Optional[str] = None):
        """
        Initialize GitHub pack builder.
        
        Args:
            repo: GitHub repository (e.g., "wshobson/agents")
            branch: Branch name (default: "main")
            token: GitHub personal access token (optional, for higher rate limits)
        """
        self.repo = repo
        self.branch = branch
        self.token = token or os.getenv('GITHUB_TOKEN')
        self.api_base = f"https://api.github.com/repos/{repo}"
        self._request_count = 0
    
    def build_pack_zip(self, plugin_name: str) -> Optional[io.BytesIO]:
        """
        Build ZIP from a plugin directory in GitHub repo.
        
        Args:
            plugin_name: Name of the plugin directory (e.g., "python-development")
        
        Returns:
            BytesIO buffer containing ZIP file, or None if failed
        """
        try:
            print(f"📦 [PackBuilder] Building ZIP for plugin: {plugin_name}")
            
            # Fetch all files from plugin directory
            files = self._fetch_plugin_files(plugin_name)
            
            if not files:
                print(f"❌ [PackBuilder] No files found for plugin: {plugin_name}")
                return None
            
            print(f"✅ [PackBuilder] Fetched {len(files)} files from {plugin_name}")
            
            # Build ZIP
            zip_buffer = io.BytesIO()
            
            with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
                # Add all plugin files
                for file_path, content in files:
                    zf.writestr(file_path, content)
                
                # Generate and add pack.json manifest
                manifest = self._build_manifest(plugin_name, files)
                zf.writestr("pack.json", manifest)
                
                # Add .pack_meta.json for Ensemble compatibility
                pack_meta = self._build_pack_meta(plugin_name)
                zf.writestr(".pack_meta.json", pack_meta)
            
            zip_buffer.seek(0)
            
            # Log ZIP size
            zip_size = len(zip_buffer.getvalue())
            print(f"✅ [PackBuilder] ZIP built successfully ({zip_size / 1024:.1f} KB)")
            
            return zip_buffer
            
        except Exception as e:
            print(f"❌ [PackBuilder] Failed to build ZIP for {plugin_name}: {e}")
            return None
    
    def build_multi_plugin_zip(self, plugin_names: List[str]) -> Optional[io.BytesIO]:
        """
        Build ZIP containing multiple plugins.
        
        Args:
            plugin_names: List of plugin names to include
        
        Returns:
            BytesIO buffer containing ZIP file, or None if failed
        """
        try:
            print(f"📦 [PackBuilder] Building multi-plugin ZIP with {len(plugin_names)} plugins")
            
            all_files = []
            
            for plugin_name in plugin_names:
                files = self._fetch_plugin_files(plugin_name)
                if files:
                    # Prefix files with plugin name to avoid collisions
                    prefixed_files = [
                        (f"{plugin_name}/{file_path}", content)
                        for file_path, content in files
                    ]
                    all_files.extend(prefixed_files)
            
            if not all_files:
                print(f"❌ [PackBuilder] No files found for any of the plugins")
                return None
            
            print(f"✅ [PackBuilder] Fetched {len(all_files)} total files")
            
            # Build ZIP
            zip_buffer = io.BytesIO()
            
            with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
                for file_path, content in all_files:
                    zf.writestr(file_path, content)
                
                # Add combined manifest
                manifest = {
                    'pack_id': 'multi-plugin-pack',
                    'plugins': plugin_names,
                    'version': '1.0.0',
                    'created_at': datetime.now().isoformat(),
                    'source': 'github',
                    'repo': self.repo
                }
                zf.writestr("pack.json", manifest)
            
            zip_buffer.seek(0)
            return zip_buffer
            
        except Exception as e:
            print(f"❌ [PackBuilder] Failed to build multi-plugin ZIP: {e}")
            return None
    
    def _fetch_plugin_files(self, plugin_name: str) -> List[Tuple[str, str]]:
        """
        Fetch all files from a plugin directory.
        
        Returns:
            List of (relative_path, content) tuples
        """
        plugin_path = f"plugins/{plugin_name}"
        files = []
        
        try:
            # Fetch directory contents recursively
            self._fetch_directory(plugin_path, files)
            return files
        except Exception as e:
            print(f"❌ [PackBuilder] Failed to fetch plugin directory: {e}")
            return []
    
    def _fetch_directory(self, path: str, files: List[Tuple[str, str]]):
        """Recursively fetch all files from a GitHub directory."""
        url = f"{self.api_base}/contents/{path}?ref={self.branch}"
        
        try:
            response = self._make_request(url)
            if response.status_code != 200:
                print(f"⚠️ [PackBuilder] Failed to fetch {path} (HTTP {response.status_code})")
                return
            
            items = response.json()
            
            for item in items:
                if item['type'] == 'file':
                    # Fetch file content
                    content_response = self._make_request(item['download_url'])
                    if content_response.status_code == 200:
                        # Store with relative path
                        relative_path = item['path'].replace("plugins/", "", 1)
                        files.append((relative_path, content_response.text))
                        print(f"  📄 {relative_path}")
                
                elif item['type'] == 'dir':
                    # Recurse into subdirectory
                    self._fetch_directory(item['path'], files)
        
        except Exception as e:
            print(f"⚠️ [PackBuilder] Error fetching directory {path}: {e}")
    
    def _build_manifest(self, plugin_name: str, files: List[Tuple[str, str]]) -> str:
        """Generate pack.json manifest for a plugin."""
        import json
        
        # Categorize files
        agent_files = []
        command_files = []
        skill_files = []
        other_files = []
        
        for file_path, _ in files:
            if file_path.endswith('.md'):
                if 'agent' in file_path.lower():
                    agent_files.append(file_path)
                elif 'skill' in file_path.lower():
                    skill_files.append(file_path)
                else:
                    agent_files.append(file_path)  # Default to agent
            elif file_path.endswith('.py') or file_path.endswith('.js'):
                command_files.append(file_path)
            else:
                other_files.append(file_path)
        
        manifest = {
            'id': plugin_name,
            'name': self._format_name(plugin_name),
            'version': '1.0.0',
            'author': f'From {self.repo}',
            'description': f'Plugin: {self._format_name(plugin_name)}',
            'source': 'github',
            'repo': self.repo,
            'branch': self.branch,
            'agent_files': agent_files,
            'command_files': command_files,
            'skill_files': skill_files,
            'other_files': other_files,
            'total_files': len(files),
            'created_at': datetime.now().isoformat()
        }
        
        return json.dumps(manifest, indent=2)
    
    def _build_pack_meta(self, plugin_name: str) -> str:
        """Generate .pack_meta.json for Ensemble compatibility."""
        import json
        
        meta = {
            'pack_id': plugin_name,
            'installed_at': datetime.now().isoformat(),
            'version': '1.0.0',
            'source': 'github',
            'repo': self.repo,
            'branch': self.branch,
            'url': f"https://github.com/{self.repo}/tree/{self.branch}/plugins/{plugin_name}"
        }
        
        return json.dumps(meta, indent=2)
    
    def _format_name(self, name: str) -> str:
        """Convert plugin name to human-readable format."""
        return name.replace('-', ' ').replace('_', ' ').title()
    
    def _make_request(self, url: str, timeout: int = 10) -> requests.Response:
        """Make HTTP request with optional authentication."""
        headers = {
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'Ensemble-Marketplace'
        }
        
        if self.token:
            headers['Authorization'] = f'token {self.token}'
        
        response = requests.get(url, headers=headers, timeout=timeout)
        self._request_count += 1
        
        return response
    
    def get_plugin_info(self, plugin_name: str) -> Optional[Dict[str, Any]]:
        """Get information about a plugin without downloading it."""
        try:
            plugin_path = f"plugins/{plugin_name}"
            url = f"{self.api_base}/contents/{plugin_path}?ref={self.branch}"
            
            response = self._make_request(url)
            if response.status_code != 200:
                return None
            
            items = response.json()
            
            # Categorize files
            file_types = {'agents': 0, 'commands': 0, 'skills': 0, 'other': 0}
            
            for item in items:
                if item['type'] == 'dir':
                    if 'agent' in item['name'].lower():
                        file_types['agents'] += 1
                    elif 'command' in item['name'].lower():
                        file_types['commands'] += 1
                    elif 'skill' in item['name'].lower():
                        file_types['skills'] += 1
            
            return {
                'name': plugin_name,
                'path': plugin_path,
                'file_types': file_types,
                'total_items': len(items),
                'url': f"https://github.com/{self.repo}/tree/{self.branch}/{plugin_path}"
            }
        
        except Exception as e:
            print(f"❌ [PackBuilder] Failed to get plugin info: {e}")
            return None
    
    def list_all_plugins(self) -> List[Dict[str, Any]]:
        """List all plugins in the repository."""
        try:
            url = f"{self.api_base}/contents/plugins?ref={self.branch}"
            response = self._make_request(url)
            
            if response.status_code != 200:
                return []
            
            items = response.json()
            plugins = []
            
            for item in items:
                if item['type'] == 'dir':
                    plugin_info = self.get_plugin_info(item['name'])
                    if plugin_info:
                        plugins.append(plugin_info)
            
            return plugins
        
        except Exception as e:
            print(f"❌ [PackBuilder] Failed to list plugins: {e}")
            return []
    
    def get_usage_stats(self) -> Dict[str, Any]:
        """Get usage statistics for the pack builder."""
        return {
            'repo': self.repo,
            'branch': self.branch,
            'total_requests': self._request_count,
            'has_token': bool(self.token)
        }


# Convenience function for quick use
def create_pack_from_github(repo: str, plugin_name: str, branch: str = "main") -> Optional[io.BytesIO]:
    """
    Quick helper to create a pack ZIP from GitHub.
    
    Args:
        repo: GitHub repository (e.g., "wshobson/agents")
        plugin_name: Plugin name
        branch: Branch name
    
    Returns:
        BytesIO buffer with ZIP, or None
    """
    builder = GitHubPackBuilder(repo, branch)
    return builder.build_pack_zip(plugin_name)
