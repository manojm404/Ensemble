from core.governance import (
    _build_magicflow_workflow_from_plan,
    _build_domain_workflow,
    _classify_failure_kind,
    _classify_workflow_domain,
    _failure_kind_label,
    _normalize_artifact_display_path,
)
from core.workflow_planner import MagicFlowPlan, MagicFlowStagePlan


def _skill(skill_id: str, name: str, category: str, description: str, emoji: str) -> dict:
    return {
        "id": skill_id,
        "name": name,
        "category": category,
        "description": description,
        "emoji": emoji,
        "tags": [skill_id.replace("-", " ")],
    }


def test_artifact_display_paths_strip_internal_workspace_prefixes():
    assert _normalize_artifact_display_path("repo/index.html") == "index.html"
    assert _normalize_artifact_display_path("step1/index.html") == "Step 1/index.html"
    assert _normalize_artifact_display_path("outputs/repo/styles.css") == "styles.css"
    assert _normalize_artifact_display_path("workspace/step2/app.js") == "Step 2/app.js"


def test_news_article_prompt_uses_content_specialists():
    prompt = (
        "go through latest news about AI on internet and generate a report on latest 3 topics. "
        "then i want to publish one article based on the report"
    )
    skills = [
        _skill("search-specialist", "Search Specialist", "Research", "Expert web researcher", "🔎"),
        _skill("seo-content-planner", "SEO Content Planner", "Marketing", "Content planning and topic clusters", "🧭"),
        _skill("seo-content-writer", "SEO Content Writer", "Marketing", "Writes SEO-optimized content", "✍️"),
        _skill("seo-content-auditor", "SEO Content Auditor", "Marketing", "Reviews content quality", "🧪"),
        _skill("content-marketer", "Content Marketer", "Marketing", "Omnichannel content strategist", "📣"),
        _skill("product_lifecycle_lead", "Product Lifecycle Lead", "Product", "Generic product manager", "🧭"),
        _skill("data_pipeline_engineer", "Data Pipeline Engineer", "Data", "Generic data engineer", "🛠️"),
    ]

    workflow = _build_domain_workflow(prompt, skills, desired_count=2)

    assert _classify_workflow_domain(prompt)["key"] == "news_article_content"
    assert len(workflow["nodes"]) == 2

    labels = [node["data"]["label"] for node in workflow["nodes"]]
    subtitles = [node["data"]["subtitle"] for node in workflow["nodes"]]
    reasons = [node["data"]["selection_reason"] for node in workflow["nodes"]]

    assert labels[0].endswith("Search Specialist")
    assert labels[1].endswith("SEO Content Writer")
    assert subtitles == ["News Research", "Angle & Outline + Article Drafting + Editorial QA"]
    assert all("Matched" in reason for reason in reasons)
    assert workflow["metadata"]["domain_key"] == "news_article_content"
    assert workflow["metadata"]["generated_agents"] == 2
    assert workflow["metadata"]["stage_plan"][0]["selection_reason"].startswith("Matched")
    assert all("Product Lifecycle Lead" not in label for label in labels)
    assert all("Data Pipeline Engineer" not in label for label in labels)


def test_news_article_prompt_prefers_writer_even_with_namespaced_ids():
    prompt = (
        "go through latest news about AI on internet and generate a report on latest 3 topics. "
        "then i want to publish one article based on the report"
    )
    skills = [
        _skill("core_content-marketing_agents_search-specialist", "Search Specialist", "Research", "Expert web researcher", "🔎"),
        _skill("core_seo-content-creation_agents_seo-content-planner", "SEO Content Planner", "Marketing", "Content planning and topic clusters", "🧭"),
        _skill("core_seo-content-creation_agents_seo-content-writer", "SEO Content Writer", "Marketing", "Writes SEO-optimized content", "✍️"),
        _skill("core_seo-content-creation_agents_seo-content-auditor", "SEO Content Auditor", "Marketing", "Reviews content quality", "🧪"),
        _skill("core_content-marketing_agents_content-marketer", "Content Marketer", "Marketing", "Omnichannel content strategist", "📣"),
    ]

    workflow = _build_domain_workflow(prompt, skills, desired_count=2)

    labels = [node["data"]["label"] for node in workflow["nodes"]]
    subtitles = [node["data"]["subtitle"] for node in workflow["nodes"]]

    assert labels[0].endswith("Search Specialist")
    assert labels[1].endswith("SEO Content Writer")
    assert subtitles == ["News Research", "Angle & Outline + Article Drafting + Editorial QA"]


def test_news_article_prompt_uses_live_registry_research_and_writer_agents():
    prompt = (
        "go through latest news about AI on internet and generate a report on latest 3 topics. "
        "then i want to publish one article based on the report"
    )
    skills = [
        _skill("core_default", "Generalist Research Agent", "Default", "Generalist research and synthesis", "🔎"),
        _skill("core_marketing-multi-platform-content-strategist", "Multi-Platform Content Strategist", "Marketing", "Omnichannel content strategist", "🧭"),
        _skill("core_marketing-thought-leadership-author", "Thought Leadership Author", "Marketing", "Writes authoritative content", "✍️"),
        _skill("core_marketing-technical-seo-lead", "Technical SEO Lead", "Marketing", "Optimizes content for search", "📈"),
        _skill("core_testing-evidence-collector", "QA Evidence Collector", "Testing", "Collects evidence for QA", "🧪"),
        _skill("core_engineering-code-quality-auditor", "Code Quality Auditor", "Engineering", "Audits code quality", "👁️"),
    ]

    workflow = _build_domain_workflow(prompt, skills, desired_count=2)
    labels = [node["data"]["label"] for node in workflow["nodes"]]

    assert labels[0].endswith("Generalist Research Agent")
    assert labels[1].endswith(("Multi-Platform Content Strategist", "Thought Leadership Author"))
    assert all("QA Evidence Collector" not in label for label in labels)
    assert all("Code Quality Auditor" not in label for label in labels)


def test_suv_comparison_prompt_uses_research_score_and_blog_agents():
    prompt = (
        "Agent 1 – Research top 5 electric SUVs (price, range, horsepower) and generate a short report. "
        "Agent 2 – Based on the report, calculate value score = (range/price)*1000 + horsepower/100, then pick the best SUV. "
        "Agent 3 – Write a fun, short blog post announcing the winner and why it's great."
    )
    skills = [
        _skill("search-specialist", "Search Specialist", "Research", "Expert web researcher", "🔎"),
        _skill("core_product-market-intelligence-analyst", "Market Intelligence Analyst", "Product", "Market research and competitive analysis", "🔭"),
        _skill("core_support-analytics-reporter", "Analytics & Insights Reporter", "Support", "Data analysis and insights", "📊"),
        _skill("core_marketing-multi-platform-content-strategist", "Multi-Platform Content Strategist", "Marketing", "Omnichannel content strategist", "✍️"),
        _skill("core_marketing-thought-leadership-author", "Thought Leadership Author", "Marketing", "Writes authoritative content", "📘"),
        _skill("core_engineering-code-quality-auditor", "Code Quality Auditor", "Engineering", "Audits code quality", "👁️"),
    ]

    workflow = _build_domain_workflow(prompt, skills, desired_count=3)

    assert _classify_workflow_domain(prompt)["key"] == "comparison_analysis_blog"
    assert len(workflow["nodes"]) == 3

    labels = [node["data"]["label"] for node in workflow["nodes"]]
    subtitles = [node["data"]["subtitle"] for node in workflow["nodes"]]
    assert labels[0].endswith(("Search Specialist", "Market Intelligence Analyst"))
    assert labels[1].endswith("Analytics & Insights Reporter")
    assert labels[2].endswith(("Multi-Platform Content Strategist", "Thought Leadership Author"))
    assert subtitles == ["Market Research", "Value Scoring", "Winner Blog Draft"]
    assert all("Code Quality Auditor" not in label for label in labels)


def test_embedded_temperature_sensor_prompt_uses_explicit_dag_roles():
    prompt = (
        "Run a 4-agent DAG workflow simulating an embedded temperature sensor debugging process. "
        "Agent 1 (Embedded Systems Tester) generates a random raw temperature value between 20–35°C. "
        "Agent 2 (Calibration Engineer) applies a calibration formula: corrected = raw × 1.02 + offset, "
        "where offset is a random value between -1 and +1. Agent 3 (Fault Detector) compares raw and "
        "corrected values; if the difference exceeds 2°C, it flags a \"DRIFT ALERT\". Agent 4 "
        "(Logging & Report Agent) writes a structured engineering log entry containing timestamp, raw value, "
        "corrected value, difference, and alert status. The workflow runs for 5 cycles (one reading per cycle). "
        "Final output is a plain text log with 5 entries, no HTML, no web app. All agents are public, run in "
        "series (dag mode), and each agent passes its output to the next."
    )
    skills = [
        _skill("core_engineering-embedded-systems-engineer", "Embedded Systems Engineer", "Engineering", "Firmware and sensor debugging", "🔧"),
        _skill("core_engineering-data-pipeline-engineer", "Data Pipeline Engineer", "Engineering", "Data transformation and validation", "🛠️"),
        _skill("core_testing-test-results-analyzer", "Test Results Analyzer", "Testing", "Analyzes failures and drift", "🧪"),
        _skill("core_support-analytics-reporter", "Analytics & Insights Reporter", "Support", "Creates logs and reports", "📊"),
        _skill("core_product-market-intelligence-analyst", "Market Intelligence Analyst", "Product", "Market analysis", "🔭"),
        _skill("core_marketing-multi-platform-content-strategist", "Multi-Platform Content Strategist", "Marketing", "Content strategy", "✍️"),
    ]

    workflow = _build_domain_workflow(prompt, skills, desired_count=3)

    assert _classify_workflow_domain(prompt)["key"] == "embedded_temperature_sensor_debug"
    assert len(workflow["nodes"]) == 4
    assert len(workflow["edges"]) == 3

    labels = [node["data"]["label"] for node in workflow["nodes"]]
    subtitles = [node["data"]["subtitle"] for node in workflow["nodes"]]
    instructions = [node["data"]["instruction"] for node in workflow["nodes"]]

    assert labels == [
        "🔧 Embedded Systems Tester",
        "🧮 Calibration Engineer",
        "🚨 Fault Detector",
        "📋 Logging & Report Agent",
    ]
    assert subtitles == [
        "Raw Sensor Reading",
        "Calibration Correction",
        "Drift Detection",
        "Engineering Log",
    ]
    assert all(node["data"]["visibility"] == "public" for node in workflow["nodes"])
    assert all(node["data"]["timing_policy"]["type"] == "dependency" for node in workflow["nodes"])
    assert workflow["metadata"]["requested_agents"] == 4
    assert workflow["metadata"]["generated_agents"] == 4
    assert workflow["metadata"]["workflow_mode"] == "dag"
    assert workflow["metadata"]["output_type"] == "document"
    assert workflow["metadata"]["cycle_count"] == 5
    assert workflow["metadata"]["route_quality"] in {"complete", "adapted"}
    assert all(stage["match_type"] in {"exact", "adapted", "virtual"} for stage in workflow["metadata"]["stage_plan"])
    assert all("match_confidence" in node["data"] for node in workflow["nodes"])
    assert "exactly 5 entries" in instructions[-1]
    assert all("Market Intelligence Analyst" not in label for label in labels)
    assert all("Multi-Platform Content Strategist" not in label for label in labels)


def test_incident_response_dashboard_prompt_uses_ops_specialists():
    prompt = (
        "Run a 5-agent DAG workflow for a product-quality launch simulation of an AI-powered incident response dashboard. "
        "Goal: create a production-ready incident response playbook and a corresponding single-page internal dashboard mockup "
        "that helps an ops team investigate a live outage. A customer-facing payments service started failing intermittently "
        "after a deploy. Errors spiked during checkout, some requests timed out, retries increased downstream load, logs mention "
        "elevated latency, cache misses, and a sudden rise in 5xx responses. The deploy included a config change, a dependency "
        "bump, and a new circuit breaker rule."
    )
    skills = [
        _skill("incident-responder", "Incident Responder", "Operations", "Handles incident intake and mitigation", "🚨"),
        _skill("event-tracker", "Event Tracker", "Operations", "Reconstructs timelines", "🕒"),
        _skill("error-detective", "Error Detective", "Operations", "Finds root causes", "🧪"),
        _skill("backend-architect", "Backend Architect", "Engineering", "Designs recovery plans", "🏗️"),
        _skill("frontend-developer", "Frontend Developer", "Engineering", "Builds dashboards", "💻"),
        _skill("product_manager", "Product Manager", "Product", "Clarifies requirements", "🧭"),
    ]

    workflow = _build_domain_workflow(prompt, skills, desired_count=5)

    assert _classify_workflow_domain(prompt)["key"] == "incident_response_dashboard"
    assert len(workflow["nodes"]) == 5

    labels = [node["data"]["label"] for node in workflow["nodes"]]
    subtitles = [node["data"]["subtitle"] for node in workflow["nodes"]]
    match_types = [node["data"]["match_type"] for node in workflow["nodes"]]

    assert labels == [
        "🚨 Incident Intake Analyst",
        "🕒 Timeline Reconstruction Specialist",
        "🔍 Root Cause Analyst",
        "🛠️ Remediation Planner",
        "📦 Packaging & Dashboard Agent",
    ]
    assert subtitles == [
        "Incident Intake",
        "Timeline Reconstruction",
        "Root Cause Analysis",
        "Remediation Plan",
        "Playbook & Dashboard Packaging",
    ]
    assert workflow["metadata"]["domain_key"] == "incident_response_dashboard"
    assert workflow["metadata"]["generated_agents"] == 5
    assert workflow["metadata"]["requested_agents"] == 5
    assert all(match_type == "virtual" for match_type in match_types)
    assert workflow["metadata"]["route_confirmation_required"] is True


def test_code_review_prompt_uses_review_specialists():
    prompt = "Review this codebase, identify bugs and security issues, and suggest a safe repair plan."
    skills = [
        _skill("repo-scanner", "Repo Scanner", "Engineering", "Summarizes repository changes", "🔎"),
        _skill("code-quality-auditor", "Code Quality Auditor", "Quality", "Audits code quality", "👁️"),
        _skill("testpilot", "Test Pilot", "Testing", "Designs test coverage", "🧪"),
        _skill("backend-architect", "Backend Systems Architect", "Engineering", "Designs backend fixes", "🏗️"),
        _skill("product_lifecycle_lead", "Product Lifecycle Lead", "Product", "Generic product manager", "🧭"),
    ]

    workflow = _build_domain_workflow(prompt, skills, desired_count=3)

    assert _classify_workflow_domain(prompt)["key"] == "code_review"
    assert len(workflow["nodes"]) == 3

    labels = [node["data"]["label"] for node in workflow["nodes"]]
    subtitles = [node["data"]["subtitle"] for node in workflow["nodes"]]
    reasons = [node["data"]["selection_reason"] for node in workflow["nodes"]]

    assert labels[0].endswith("Repo Scanner")
    assert labels[1].endswith("Code Quality Auditor")
    assert labels[2].endswith("Backend Systems Architect")
    assert subtitles == ["Repository Scan", "Risk Review + Test Planning", "Repair Advice"]
    assert all("Matched" in reason for reason in reasons)
    assert workflow["metadata"]["domain_key"] == "code_review"
    assert workflow["metadata"]["generated_agents"] == 3
    assert workflow["metadata"]["route_evidence"]
    assert any("security" in term.lower() or "review" in term.lower() for term in workflow["metadata"]["route_evidence"])


def test_local_business_web_prompt_uses_web_specialists():
    prompt = "need a modern website for local bar - add extensive menu and happy hour deal make it modern and classy"
    skills = [
        _skill("product_manager", "Product Manager", "Product", "Clarifies requirements", "🧭"),
        _skill("strategic_planner", "Strategic Planner", "Strategy", "Plans launches", "🗺️"),
        _skill("search-specialist", "Search Specialist", "Research", "Finds source material", "🔎"),
        _skill("ui-ux-designer", "UI UX Designer", "Design", "Shapes the visual system", "🎨"),
        _skill("seo-content-writer", "SEO Content Writer", "Marketing", "Writes launch copy", "✍️"),
        _skill("frontend-developer", "Frontend Developer", "Engineering", "Builds responsive UI", "💻"),
        _skill("seo-content-auditor", "SEO Content Auditor", "Quality", "Reviews launch readiness", "🧪"),
    ]

    workflow = _build_domain_workflow(prompt, skills, desired_count=5)

    assert _classify_workflow_domain(prompt)["key"] == "local_business_web"
    assert len(workflow["nodes"]) == 5

    labels = [node["data"]["label"] for node in workflow["nodes"]]
    subtitles = [node["data"]["subtitle"] for node in workflow["nodes"]]
    reasons = [node["data"]["selection_reason"] for node in workflow["nodes"]]

    assert labels[0].endswith("Product Manager")
    assert labels[1].endswith("UI UX Designer")
    assert labels[2].endswith("SEO Content Writer")
    assert labels[3].endswith("Frontend Developer")
    assert labels[4].endswith("SEO Content Auditor")
    assert subtitles == [
        "Requirements Brief",
        "Brand & UI Direction",
        "Menu & Offer Copy",
        "Responsive Frontend Build",
        "Accessibility & Launch QA",
    ]
    assert all("Matched" in reason for reason in reasons)
    assert workflow["metadata"]["domain_key"] == "local_business_web"
    assert any("bar" in term.lower() or "menu" in term.lower() for term in workflow["metadata"]["route_evidence"])


def test_research_report_webpage_prompt_uses_research_report_web_specialists():
    prompt = "Do research on latest LLM and generate a report, then show the report data on a simple webpage."
    skills = [
        _skill("search-specialist", "Search Specialist", "Research", "Expert web researcher", "🔎"),
        _skill("research-analyst", "Research Analyst", "Research", "Synthesizes findings", "📚"),
        _skill("analytics-reporter", "Analytics Reporter", "Data", "Turns findings into reports", "📊"),
        _skill("frontend-developer", "Frontend Developer", "Engineering", "Builds responsive UI", "💻"),
        _skill("testpilot", "Test Pilot", "Testing", "Audits deliverables", "🧪"),
        _skill("ux-research-lead", "UX Research Lead", "Design", "User research specialist", "🎯"),
        _skill("data-pipeline-engineer", "Data Pipeline Engineer", "Engineering", "Moves data around", "🛠️"),
    ]

    workflow = _build_domain_workflow(prompt, skills, desired_count=4)

    assert _classify_workflow_domain(prompt)["key"] == "research_report_webpage"
    assert len(workflow["nodes"]) == 4

    labels = [node["data"]["label"] for node in workflow["nodes"]]
    subtitles = [node["data"]["subtitle"] for node in workflow["nodes"]]

    assert labels[0].endswith(("Search Specialist", "Research Analyst"))
    assert labels[1].endswith("Analytics Reporter")
    assert labels[2].endswith("Frontend Developer")
    assert labels[3].endswith("Test Pilot")
    assert subtitles == [
        "Research Brief",
        "Report Draft",
        "Webpage Build",
        "Accessibility & Launch QA",
    ]
    assert all("UX Research Lead" not in label for label in labels)
    assert all("Data Pipeline Engineer" not in label for label in labels)


def test_research_report_webpage_prompt_pads_to_requested_agent_count_and_exposes_candidates():
    prompt = "Do research on latest LLM and generate a report, then show the report data on a simple webpage."
    skills = [
        _skill("search-specialist", "Search Specialist", "Research", "Expert web researcher", "🔎"),
        _skill("research-analyst", "Research Analyst", "Research", "Synthesizes findings", "📚"),
        _skill("analytics-reporter", "Analytics Reporter", "Data", "Turns findings into reports", "📊"),
        _skill("frontend-developer", "Frontend Developer", "Engineering", "Builds responsive UI", "💻"),
        _skill("testpilot", "Test Pilot", "Testing", "Audits deliverables", "🧪"),
        _skill("ux-research-lead", "UX Research Lead", "Design", "User research specialist", "🎯"),
        _skill("data-pipeline-engineer", "Data Pipeline Engineer", "Engineering", "Moves data around", "🛠️"),
    ]

    workflow = _build_domain_workflow(prompt, skills, desired_count=5)

    assert len(workflow["nodes"]) == 5
    assert workflow["metadata"]["requested_agents"] == 5
    assert workflow["metadata"]["generated_agents"] == 5
    assert workflow["metadata"]["stage_plan"][-1]["stage"].startswith("Final QA")
    assert workflow["metadata"]["stage_plan"][-1]["requested_role"] == "Final QA Specialist"
    assert workflow["metadata"]["stage_plan"][0]["candidate_agents"]


def test_fitness_web_prompt_uses_fitness_specialists():
    prompt = "Create a personalized fitness website for a local trainer with workouts, coaching plans, and membership signup."
    skills = [
        _skill("product_manager", "Product Manager", "Product", "Clarifies requirements", "🧭"),
        _skill("strategic_planner", "Strategic Planner", "Strategy", "Plans launches", "🗺️"),
        _skill("search-specialist", "Search Specialist", "Research", "Finds source material", "🔎"),
        _skill("ui-ux-designer", "UI UX Designer", "Design", "Shapes the visual system", "🎨"),
        _skill("seo-content-writer", "SEO Content Writer", "Marketing", "Writes launch copy", "✍️"),
        _skill("frontend-developer", "Frontend Developer", "Engineering", "Builds responsive UI", "💻"),
        _skill("seo-content-auditor", "SEO Content Auditor", "Quality", "Reviews launch readiness", "🧪"),
    ]

    workflow = _build_domain_workflow(prompt, skills, desired_count=5)

    assert _classify_workflow_domain(prompt)["key"] == "fitness_wellness_web"
    assert len(workflow["nodes"]) == 5

    labels = [node["data"]["label"] for node in workflow["nodes"]]
    subtitles = [node["data"]["subtitle"] for node in workflow["nodes"]]
    reasons = [node["data"]["selection_reason"] for node in workflow["nodes"]]

    assert labels[0].endswith("Product Manager")
    assert labels[1].endswith("UI UX Designer")
    assert labels[2].endswith("SEO Content Writer")
    assert labels[3].endswith("Frontend Developer")
    assert labels[4].endswith("SEO Content Auditor")
    assert subtitles == [
        "Requirements Brief",
        "Brand & UI Direction",
        "Programs & Offer Copy",
        "Responsive Frontend Build",
        "Accessibility & Launch QA",
    ]
    assert all("Matched" in reason for reason in reasons)
    assert workflow["metadata"]["domain_key"] == "fitness_wellness_web"
    assert any("fitness" in term.lower() or "workout" in term.lower() for term in workflow["metadata"]["route_evidence"])
    assert all("Restaurant" not in label for label in labels)


def test_compliance_prompt_uses_compliance_specialists():
    prompt = "Create a SOC2 compliance plan with policy mapping, gap analysis, remediation steps, and evidence pack."
    skills = [
        _skill("security-auditor", "Security Auditor", "Security", "Audits compliance and security posture", "🛡️"),
        _skill("risk-manager", "Risk Manager", "Risk", "Coordinates remediation plans", "⚖️"),
        _skill("auditor", "Auditor", "Audit", "Packages evidence", "📎"),
        _skill("policy-writer", "Policy Writer", "Governance", "Writes governance controls", "📝"),
        _skill("testpilot", "Test Pilot", "Testing", "Verifies requirements", "🧪"),
    ]

    workflow = _build_domain_workflow(prompt, skills, desired_count=5)

    assert _classify_workflow_domain(prompt)["key"] == "compliance_governance"
    assert len(workflow["nodes"]) == 5

    labels = [node["data"]["label"] for node in workflow["nodes"]]
    subtitles = [node["data"]["subtitle"] for node in workflow["nodes"]]
    reasons = [node["data"]["selection_reason"] for node in workflow["nodes"]]

    assert labels[0].endswith("Security Auditor")
    assert labels[1].endswith("Risk Manager")
    assert labels[2].endswith("Test Pilot")
    assert labels[3].endswith("Policy Writer")
    assert labels[4].endswith("Auditor")
    assert subtitles == [
        "Policy Intake",
        "Control Mapping",
        "Gap Analysis",
        "Remediation Plan",
        "Evidence Pack",
    ]
    assert all("Matched" in reason for reason in reasons)
    assert workflow["metadata"]["domain_key"] == "compliance_governance"
    assert any("soc2" in term.lower() or "compliance" in term.lower() for term in workflow["metadata"]["route_evidence"])


def test_magicflow_structured_plan_converts_into_standard_workflow_shape():
    prompt = "Build a modern local bar website with menu, happy hour, and classy branding."
    skills = [
        _skill("product_manager", "Product Manager", "Product", "Clarifies requirements", "🧭"),
        _skill("ui-ux-designer", "UI UX Designer", "Design", "Shapes the visual system", "🎨"),
        _skill("frontend-developer", "Frontend Developer", "Engineering", "Builds responsive UI", "💻"),
        _skill("seo-content-writer", "SEO Content Writer", "Marketing", "Writes launch copy", "✍️"),
    ]
    plan = MagicFlowPlan(
        title="Classy Local Bar Site",
        domain_key="local_business_web",
        domain_title="Local Business Website",
        prompt_summary="A modern bar site with menus and happy hour details.",
        requested_agents=3,
        generated_agents=3,
        output_type="web_app",
        route_evidence=["bar", "menu", "happy hour"],
        routing_reason="Matched local business signals and selected the minimum viable route.",
        stages=[
            MagicFlowStagePlan(
                label="Requirements Brief",
                summary="Clarify the bar's goals and offer structure.",
                instruction="Capture the brief for a modern bar website.",
                keywords=["bar", "menu"],
                categories=["product"],
                preferred_ids=["product_manager"],
                tools=["read_artifact"],
                temperature=0.2,
                selection_reason="Matched bar and menu signals, so Product Manager handles Requirements Brief.",
            ),
            MagicFlowStagePlan(
                label="Brand & UI Direction",
                summary="Shape the visual direction and premium feel.",
                instruction="Define classy branding and layout direction.",
                keywords=["classy", "branding"],
                categories=["design"],
                preferred_ids=["ui-ux-designer"],
                tools=["read_artifact"],
                temperature=0.2,
                selection_reason="Matched classy and branding signals, so UI UX Designer handles Brand & UI Direction.",
            ),
            MagicFlowStagePlan(
                label="Responsive Frontend Build",
                summary="Build the actual landing experience.",
                instruction="Implement the website in HTML, CSS, and JS.",
                keywords=["website", "frontend"],
                categories=["engineering"],
                preferred_ids=["frontend-developer"],
                tools=["write_artifact"],
                temperature=0.2,
                selection_reason="Matched website and frontend signals, so Frontend Developer handles Responsive Frontend Build.",
            ),
        ],
    )

    workflow = _build_magicflow_workflow_from_plan(prompt, skills, plan, desired_count=3)

    assert workflow["metadata"]["planner_source"] == "langchain"
    assert workflow["metadata"]["output_type"] == "web_app"
    assert workflow["metadata"]["generated_agents"] == 3
    assert [node["data"]["label"].endswith(name) for node, name in zip(workflow["nodes"], ["Product Manager", "UI UX Designer", "Frontend Developer"])]
    assert workflow["metadata"]["stage_plan"][0]["selection_reason"].startswith("Matched")
    assert workflow["metadata"]["route_quality"] == "complete"
    assert all(stage["match_type"] == "exact" for stage in workflow["metadata"]["stage_plan"])


def test_magicflow_plan_creates_virtual_agents_when_catalog_does_not_match():
    prompt = (
        "Run a three-agent corrosion engineering workflow. A Cathodic Protection Specialist models pitting, "
        "a Fracture Mechanics Solver estimates stress intensity, and a NACE Compliance Reviewer writes the risk memo."
    )
    skills = [
        _skill("core_marketing-content-strategist", "Content Strategist", "Marketing", "Writes campaign content", "✍️"),
        _skill("core_product-market-analyst", "Market Analyst", "Product", "Market research and competitive analysis", "🔭"),
    ]
    plan = MagicFlowPlan(
        title="Corrosion Engineering Risk Workflow",
        domain_key="corrosion_engineering",
        domain_title="Corrosion Engineering",
        prompt_summary="Corrosion engineering pitting, fracture mechanics, and NACE review.",
        requested_agents=3,
        generated_agents=3,
        output_type="document",
        route_evidence=["corrosion", "fracture", "NACE"],
        routing_reason="Niche engineering workflow requiring specialized roles.",
        stages=[
            MagicFlowStagePlan(
                label="Pitting Growth Model",
                summary="Estimate corrosion pitting growth.",
                requested_role="Cathodic Protection Specialist",
                required_capabilities=["corrosion modeling", "cathodic protection"],
                output_contract="numeric pitting-growth estimate",
                instruction="Model corrosion pitting growth from the prompt.",
                keywords=["corrosion", "pitting", "cathodic"],
                categories=["corrosion engineering"],
                tools=["read_artifact", "write_artifact"],
            ),
            MagicFlowStagePlan(
                label="Stress Intensity Estimate",
                summary="Estimate fracture mechanics risk.",
                requested_role="Fracture Mechanics Solver",
                required_capabilities=["finite element reasoning", "stress intensity"],
                output_contract="stress-intensity estimate",
                instruction="Estimate stress intensity and explain assumptions.",
                keywords=["fracture", "stress", "mechanics"],
                categories=["mechanical engineering"],
                tools=["read_artifact", "write_artifact"],
            ),
            MagicFlowStagePlan(
                label="Compliance Risk Memo",
                summary="Write the compliance risk memo.",
                requested_role="NACE Compliance Reviewer",
                required_capabilities=["NACE compliance", "risk review"],
                output_contract="plain text risk memo",
                instruction="Write a concise NACE compliance risk memo.",
                keywords=["NACE", "compliance", "risk"],
                categories=["corrosion standards"],
                tools=["read_artifact", "write_artifact"],
            ),
        ],
    )

    workflow = _build_magicflow_workflow_from_plan(prompt, skills, plan, desired_count=3)

    labels = [node["data"]["label"] for node in workflow["nodes"]]
    stage_plan = workflow["metadata"]["stage_plan"]

    assert labels == [
        "🧠 Cathodic Protection Specialist",
        "🧠 Fracture Mechanics Solver",
        "🧠 NACE Compliance Reviewer",
    ]
    assert all(stage["match_type"] == "virtual" for stage in stage_plan)
    assert all(stage["agent_id"].startswith("virtual_") for stage in stage_plan)
    assert workflow["metadata"]["route_quality"] == "adapted"
    assert all("Content Strategist" not in label for label in labels)
    assert all("Market Analyst" not in label for label in labels)


def test_failure_kind_classification_maps_common_failure_types():
    assert _classify_failure_kind("Error calling openai_compatible: 403 Forbidden") == "provider"
    assert _classify_failure_kind("Workflow validation failed: Canvas is empty") == "validation"
    assert _classify_failure_kind("Approval required before execution can continue") == "approval"
    assert _classify_failure_kind("Unexpected error while executing the workflow") == "runtime"
    assert _failure_kind_label("provider") == "Provider issue"
    assert _failure_kind_label("validation") == "Validation issue"
