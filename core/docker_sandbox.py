import subprocess, os
from typing import Dict

class DockerOrchestrator:
    def __init__(self, limit=5):
        self.limit = limit
        self.workspace = os.path.join(os.getcwd(), "data/workspace")

    def get_active_containers(self):
        """Returns list of active ensemble containers."""
        try:
            cmd = ["docker", "ps", "--filter", "name=ensemble_", "--format", "{{.Names}}"]
            result = subprocess.run(cmd, capture_output=True, text=True)
            return result.stdout.strip().split("\n") if result.stdout else []
        except:
            return []

    def spawn_agent(self, agent_id: str, secrets: Dict[str, str] = None):
        """Spins up a regulated Alpine container for external agents."""
        active = self.get_active_containers()
        if len(active) >= self.limit:
            raise Exception(f"Concurrency Limit Reached: Max {self.limit} External Agents.")
        
        container_name = f"ensemble_{agent_id}"
        # Port mapping logic (Random or range-based)
        host_port = 8000 + len(active)
        
        env_args = []
        if secrets:
            for k, v in secrets.items():
                env_args += ["-e", f"{k}={v}"]

        cmd = [
            "docker", "run", "-d",
            "--name", container_name,
            "-p", f"{host_port}:8080",
            "--network", "none", # Isolated
            "-v", f"{self.workspace}:/tmp/workspace:ro", # Read-only workspace
            "alpine:latest", "tail", "-f", "/dev/null" 
        ] + env_args
        
        try:
            subprocess.run(cmd, check=True)
            return host_port
        except subprocess.CalledProcessError as e:
            print(f"❌ [DockerSandbox] Failed to spawn container: {str(e)}")
            return None

    def kill_agent(self, agent_id: str):
        subprocess.run(["docker", "rm", "-f", f"ensemble_{agent_id}"])

docker_orchestrator = DockerOrchestrator()
