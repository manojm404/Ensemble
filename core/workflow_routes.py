import os
import subprocess
import sqlite3
import json
import uuid
import asyncio
from typing import List, Dict, Any, Optional

from fastapi import APIRouter, HTTPException, Depends, Request, FastAPI
from pydantic import BaseModel
from core.llm_provider import LLMProvider
from core.dag_engine import DAGWorkflowEngine
from core.ensemble_space import EnsembleSpace
from core.audit import AuditLogger



class RequirementAnalysisRequest(BaseModel):
    prompt: str
    files: Optional[List[str]] = []
    urls: Optional[List[str]] = []
    analysis_depth: str = "all"
    user_id: str


class WorkflowRunResponse(BaseModel):
    status: str
    run_id: str
    message: str = "Workflow initiated successfully."


def register_workflow_routes(app: FastAPI, governance_instance: "Governance"):
    router = APIRouter()

    # Initialize core components (these don't cause circular imports)
    llm_provider = LLMProvider()
    ensemble_space = EnsembleSpace()
    audit_logger = AuditLogger()

    # Dependency to provide the governance instance
    def get_governance():
        return governance_instance

    @router.post("/api/requirements/analyze", response_model=WorkflowRunResponse)
    async def start_requirement_analysis(
        req: RequirementAnalysisRequest,
        governance: "Governance" = Depends(get_governance)
    ):
        """
        Initiates an automated requirement analysis workflow based on user input, files, and URLs.
        """
        try:
            directive_path = "directives/requirement_analysis.yaml"
            if not os.path.exists(directive_path):
                raise HTTPException(status_code=404, detail="Requirement analysis workflow directive not found.")

            with open(directive_path, "r") as f:
                workflow_yaml = f.read()

            workflow_run_id = str(uuid.uuid4())

            initial_input_artifact_name = f"raw_input_{workflow_run_id}.md"
            await ensemble_space.write(req.prompt.encode('utf-8'), initial_input_artifact_name, user_id=req.user_id)

            dag_inputs = {
                "initial_prompt": req.prompt,
                "input_files": req.files,
                "input_urls": req.urls,
                "initial_input_artifact": initial_input_artifact_name
            }

            dag_engine = DAGWorkflowEngine(
                workflow_id=workflow_run_id,
                workflow_yaml=workflow_yaml,
                llm_provider=llm_provider,
                space=ensemble_space,
                audit=audit_logger,
                governance=governance,
                user_id=req.user_id,
                initial_inputs=dag_inputs
            )

            asyncio.create_task(dag_engine.run_workflow())

            audit_logger.log(
                company_id="system",
                agent_id="req_analysis_initiator",
                action_type="REQUIREMENT_ANALYSIS_INITIATED",
                details_json={"workflow_run_id": workflow_run_id, "user_prompt": req.prompt, "files": req.files, "urls": req.urls},
                user_id=req.user_id
            )

            return WorkflowRunResponse(status="started", run_id=workflow_run_id, message="Requirement analysis workflow started.")

        except HTTPException as e:
            raise e
        except Exception as e:
            audit_logger.log(
                company_id="system",
                agent_id="req_analysis_initiator",
                action_type="REQUIREMENT_ANALYSIS_FAILED_INIT",
                details_json={"error": str(e), "user_prompt": req.prompt},
                user_id=req.user_id
            )
            raise HTTPException(status_code=500, detail=f"Failed to start requirement analysis: {str(e)}")

    @router.get("/api/requirements/{run_id}/results")
    async def get_requirement_analysis_results(run_id: str, request: Request):
        """
        Fetches the structured requirement analysis results for a given run_id.
        """
        user_id = request.headers.get("X-User-ID")
        if not user_id:
            raise HTTPException(status_code=401, detail="X-User-ID header is required.")

        try:
            json_result_bytes = await ensemble_space.read(f"requirements_analysis.json", user_id=user_id)
            markdown_result_bytes = await ensemble_space.read(f"requirements.md", user_id=user_id)

            if json_result_bytes is None and markdown_result_bytes is None:
                return {"status": "pending", "message": "Analysis results not yet available or workflow is still running."}
            
            json_content = json_result_bytes.decode('utf-8') if json_result_bytes else "{}"
            markdown_content = markdown_result_bytes.decode('utf-8') if markdown_result_bytes else ""

            return {
                "status": "completed",
                "run_id": run_id,
                "json_results": json.loads(json_content),
                "markdown_summary": markdown_content
            }

        except json.JSONDecodeError:
            raise HTTPException(status_code=500, detail="Failed to decode JSON analysis results.")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to retrieve analysis results: {str(e)}")


    @router.get("/workflows/{workflow_id}/git-log")
    async def get_workflow_git_log(workflow_id: str):
        """
        Returns the git log for a given workflow's workspace, and checks for rollbacks.
        """
        repo_dir = os.path.join("data", "workspace", f"workflow_{workflow_id}", "repo")
        audit_db_path = "data/ensemble_audit.db"
        has_rollback = False

        if os.path.exists(audit_db_path):
            with sqlite3.connect(audit_db_path) as conn:
                cursor = conn.execute(
                    "SELECT 1 FROM events WHERE action_type = 'GIT_SAFETY' AND details_json LIKE '%\\\"action\\\": \\\"rollback\\\"%' AND company_id = ?",
                    (f"workflow_{workflow_id}",)
                )
                if cursor.fetchone():
                    has_rollback = True

        if not os.path.isdir(os.path.join(repo_dir, ".git")):
            return {"log": [], "has_rollback": has_rollback}

        try:
            log_format = "%H|%an|%ar|%s"
            result = subprocess.run(
                ["git", "log", f"--pretty=format:{log_format}"],
                cwd=repo_dir,
                check=True,
                capture_output=True,
                text=True
            )

            log_entries = []
            for line in result.stdout.strip().split("\\n"):
                if not line:
                    continue
                parts = line.split("|", 3)
                if len(parts) == 4:
                    log_entries.append({
                        "sha": parts[0],
                        "author": parts[1],
                        "date": parts[2],
                        "message": parts[3]
                    })

            return {"log": log_entries, "has_rollback": has_rollback}

        except subprocess.CalledProcessError as e:
            raise HTTPException(status_code=500, detail=f"Failed to get git log: {e.stderr}")
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    
    @router.get("/dashboard/cost-efficiency")
    async def get_cost_efficiency_stats():
        """
        Calculates cost savings from M3's smart routing by comparing
        actual spend vs. what it would have cost if a single global model were used.
        """
        audit_db_path = "data/ensemble_audit.db"
        if not os.path.exists(audit_db_path):
            raise HTTPException(status_code=404, detail="Audit database not found.")

        model_costs = {m['id']: m['cost_per_1k_tokens'] for m in LLMProvider.get_supported_models()}
        premium_model_id = 'gemini-2.5-pro'
        premium_model_cost_per_1k = model_costs.get(premium_model_id, 0.0005)

        actual_cost = 0
        hypothetical_cost = 0

        try:
            with sqlite3.connect(audit_db_path) as conn:
                cursor = conn.execute(
                    "SELECT details_json, cost_usd FROM events WHERE action_type = 'MODEL_ROUTING'"
                )
                rows = cursor.fetchall()

            for details_json, cost in rows:
                details = json.loads(details_json)
                model_used = details.get("model")

                actual_cost += cost

                cost_per_1k_used = model_costs.get(model_used, premium_model_cost_per_1k)
                if cost_per_1k_used > 0:
                    estimated_tokens_1k = cost / cost_per_1k_used
                    hypothetical_cost += estimated_tokens_1k * premium_model_cost_per_1k
                else:
                    hypothetical_cost += 0.0001 


            return {
                "savings": hypothetical_cost - actual_cost,
                "actual_cost": actual_cost,
                "hypothetical_single_model_cost": hypothetical_cost,
                "breakdown_by_model": {}
            }
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to calculate cost efficiency: {str(e)}")
            
    app.include_router(router, prefix="") # Include without prefix here, as routes have /api/... already