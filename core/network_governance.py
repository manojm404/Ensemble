import os
import logging
from typing import List, Dict, Any

class NetworkGovernor:
    def __init__(self, docker_client: Any):
        self.client = docker_client
        self.network_name = "ensemble_sovereign_net"
        self.proxy_image = "ubuntu/squid:latest" # or official squid
        self._ensure_network()

    def _ensure_network(self):
        """Create a dedicated bridge network if it doesn't exist."""
        try:
            if not self.client: return
            networks = self.client.networks.list(names=[self.network_name])
            if not networks:
                self.client.networks.create(self.network_name, driver="bridge")
                logging.info(f"🌐 NetworkGovernor: Created bridge network {self.network_name}")
        except Exception as e:
            logging.error(f"❌ NetworkGovernor: Network creation failed: {e}")

    def get_container_config(self, agent_id: str) -> Dict[str, Any]:
        """
        Return networking configuration for an agent container.
        Forces connection to the sovereign bridge with proxy env vars.
        """
        return {
            "network": self.network_name,
            "environment": {
                "http_proxy": "http://ensemble_proxy:3128",
                "https_proxy": "http://ensemble_proxy:3128",
                "no_proxy": "localhost,127.0.0.1"
            }
        }

    # Potential Phase 3.1: logic to dynamically reload squid.conf on domain change
