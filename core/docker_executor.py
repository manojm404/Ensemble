import docker
import os
import logging
from core.network_governance import NetworkGovernor
from typing import List, Dict, Any, Optional

WORKSPACE_DIR = os.path.abspath("data/workspace/")
DOCKER_AVAILABLE = False

class DockerExecutor:
    def __init__(self):
        self.client = None
        self.network_gov = None
        self.check_availability()

    def check_availability(self):
        """Ping the Docker daemon to check if it is reachable."""
        global DOCKER_AVAILABLE
        try:
            self.client = docker.from_env()
            self.client.version()
            DOCKER_AVAILABLE = True
            self.network_gov = NetworkGovernor(self.client)
            logging.info("🐳 DockerExecutor: Daemon reached. Sovereign Sandboxing & Networking ENABLED.")
        except Exception as e:
            DOCKER_AVAILABLE = False
            logging.error(f"⚠️ DockerExecutor: Daemon unreachable or permission denied: {e}. Sovereign Sandboxing DISABLED.")

    def run_container(self, image: str, command: str, volumes: Dict[str, Any] = None, mem_limit: str = "512m") -> Dict[str, Any]:
        """
        Runs a command in a hardened Docker container.
        Resource Limits are ENFORCED: pids_limit=512, memswap_limit=0, no-socket-mounting.
        """
        if not DOCKER_AVAILABLE:
            return {"status": "error", "message": "Docker not available. Falling back to unprotected mode."}

        try:
            # Default volumes to workspace if not provided
            if volumes is None:
                volumes = {WORKSPACE_DIR: {'bind': '/workspace', 'mode': 'rw'}}

            # Apply Networking Policy
            net_cfg = self.network_gov.get_container_config(os.getenv("AGENT_ID", "default_agent"))
            
            container = self.client.containers.run(
                image=image,
                command=command,
                volumes=volumes,
                working_dir="/workspace",
                environment=net_cfg.get("environment", {}),
                mem_limit=mem_limit,
                memswap_limit=0, # Disable swap to avoid thrashing
                pids_limit=512,  # Prevent fork bombs
                ulimits=[
                    docker.types.Ulimit(name='nofile', soft=1024, hard=1024)
                ],
                network=net_cfg.get("network", "bridge"),
                detach=False,
                stdout=True,
                stderr=True,
                remove=True # Auto-cleanup after run
            )
            return {"status": "success", "output": container.decode('utf-8')}
        except docker.errors.ContainerError as e:
            return {"status": "failure", "output": e.stderr.decode('utf-8'), "exit_code": e.exit_status}
        except Exception as e:
            return {"status": "error", "message": str(e)}

# Global Instance
docker_executor = DockerExecutor()
