from __future__ import annotations

import copy

from fastapi.testclient import TestClient

from core.governance import app
from core import settings as app_settings


DEFAULT_SETTINGS = {
    "provider": "gemini",
    "model": "gemini-2.5-flash",
    "base_url": None,
    "approval_cost_threshold": 0.0001,
    "approval_timeout_seconds": 300,
    "theme": "dark",
}


def _fake_user_id(request):
    return request.headers.get("x-user-id", "11111111-1111-1111-1111-111111111111")


def test_save_user_settings_merges_existing_local_values(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.setattr(app_settings, "_local_config", {})

    first = app_settings.save_user_settings(
        "local:dev",
        {
            "provider": "openai",
            "model": "gpt-4o-mini",
            "approval_cost_threshold": 0.25,
            "approval_timeout_seconds": 900,
            "theme": "light",
        },
    )

    second = app_settings.save_user_settings(
        "local:dev",
        {
            "model": "gpt-4o",
        },
    )

    assert first["provider"] == "openai"
    assert first["approval_cost_threshold"] == 0.25
    assert second["provider"] == "openai"
    assert second["model"] == "gpt-4o"
    assert second["approval_cost_threshold"] == 0.25
    assert second["approval_timeout_seconds"] == 900
    assert second["theme"] == "light"


def test_policy_settings_validate_save_and_reload(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.setenv("ENFORCE_AUTH", "false")
    monkeypatch.setattr(app_settings, "_local_config", {})
    monkeypatch.setattr("core.governance._get_user_id_from_request", _fake_user_id)

    client = TestClient(app)
    headers = {"x-user-id": "11111111-1111-1111-1111-111111111111"}

    saved = client.put(
        "/api/settings",
        headers=headers,
        json={
            "approval_cost_threshold": 0.125,
            "approval_timeout_seconds": 900,
            "theme": "system",
        },
    )

    assert saved.status_code == 200
    loaded = client.get("/api/settings", headers=headers)
    assert loaded.status_code == 200
    assert loaded.json()["settings"]["approval_cost_threshold"] == 0.125
    assert loaded.json()["settings"]["approval_timeout_seconds"] == 900
    assert loaded.json()["settings"]["theme"] == "system"

    invalid = client.put(
        "/api/settings",
        headers=headers,
        json={"approval_timeout_seconds": 5},
    )

    assert invalid.status_code == 400
    assert "between 30 seconds and 86400 seconds" in invalid.json()["detail"]

    reloaded = client.get("/api/settings", headers=headers)
    assert reloaded.json()["settings"]["approval_timeout_seconds"] == 900


def test_provider_settings_reject_managed_provider_custom_model(monkeypatch):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.setenv("ENFORCE_AUTH", "false")
    monkeypatch.setattr("core.governance._get_user_id_from_request", _fake_user_id)

    store: dict[str, dict[str, object]] = {}

    def fake_get_user_settings(user_id: str):
        return copy.deepcopy(store.get(user_id, DEFAULT_SETTINGS))

    def fake_save_user_settings(user_id: str, data: dict[str, object]):
        current = fake_get_user_settings(user_id)
        for key, value in data.items():
            if value is not None and value != "":
                current[key] = value
        store[user_id] = current
        return copy.deepcopy(current)

    monkeypatch.setattr("core.governance.settings.get_user_settings", fake_get_user_settings)
    monkeypatch.setattr("core.governance.settings.save_user_settings", fake_save_user_settings)

    client = TestClient(app)
    response = client.post(
        "/api/settings/provider",
        headers={"x-user-id": "11111111-1111-1111-1111-111111111111"},
        json={
            "provider": "groq",
            "model": "my-custom-groq-model",
            "base_url": "https://api.groq.com/openai/v1",
        },
    )

    assert response.status_code == 400
    payload = response.json()
    assert "unsupported model" in payload["detail"].lower()
    assert "llama-3.1-8b-instant" in payload["detail"]

    loaded = client.get(
        "/api/settings/provider",
        headers={"x-user-id": "11111111-1111-1111-1111-111111111111"},
    )

    assert loaded.status_code == 200
    assert loaded.json()["model"] == DEFAULT_SETTINGS["model"]


def test_provider_settings_are_scoped_per_account(monkeypatch):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.setenv("ENFORCE_AUTH", "false")
    monkeypatch.setattr("core.governance._get_user_id_from_request", _fake_user_id)

    store: dict[str, dict[str, object]] = {}

    def fake_get_user_settings(user_id: str):
        return copy.deepcopy(store.get(user_id, DEFAULT_SETTINGS))

    def fake_save_user_settings(user_id: str, data: dict[str, object]):
        current = fake_get_user_settings(user_id)
        for key, value in data.items():
            if value is not None and value != "":
                current[key] = value
        store[user_id] = current
        return copy.deepcopy(current)

    monkeypatch.setattr("core.governance.settings.get_user_settings", fake_get_user_settings)
    monkeypatch.setattr("core.governance.settings.save_user_settings", fake_save_user_settings)

    client = TestClient(app)

    user_a = "11111111-1111-1111-1111-111111111111"
    user_b = "22222222-2222-2222-2222-222222222222"

    response_a = client.post(
        "/api/settings/provider",
        headers={"x-user-id": user_a},
        json={"provider": "openai", "model": "gpt-4o", "base_url": "https://api.openai.com/v1"},
    )
    response_b = client.post(
        "/api/settings/provider",
        headers={"x-user-id": user_b},
        json={"provider": "openai_compatible", "model": "cerebras-llama-3.3-70b", "base_url": "https://api.cerebras.ai/v1"},
    )

    assert response_a.status_code == 200
    assert response_b.status_code == 200

    loaded_a = client.get("/api/settings/provider", headers={"x-user-id": user_a})
    loaded_b = client.get("/api/settings/provider", headers={"x-user-id": user_b})

    assert loaded_a.json()["provider"] == "openai"
    assert loaded_a.json()["model"] == "gpt-4o"
    assert loaded_b.json()["provider"] == "openai_compatible"
    assert loaded_b.json()["model"] == "cerebras-llama-3.3-70b"
    assert loaded_a.json()["model"] != loaded_b.json()["model"]


class _FakeQueryResult:
    def __init__(self, data):
        self.data = data
        self.error = None


class _FakeTableQuery:
    def __init__(self, store, table_name):
        self.store = store
        self.table_name = table_name
        self.operation = "select"
        self.filters: dict[str, object] = {}
        self.columns = "*"

    def select(self, columns="*"):
        self.operation = "select"
        self.columns = columns
        return self

    def delete(self):
        self.operation = "delete"
        return self

    def eq(self, field, value):
        self.filters[field] = value
        return self

    def limit(self, _count):
        return self

    def execute(self):
        rows = self.store.setdefault(self.table_name, [])

        def matches(row):
            return all(row.get(field) == value for field, value in self.filters.items())

        if self.operation == "delete":
            removed = [row for row in rows if matches(row)]
            self.store[self.table_name] = [row for row in rows if not matches(row)]
            return _FakeQueryResult(removed)

        projected = []
        requested_columns = [part.strip() for part in self.columns.split(",")] if self.columns != "*" else None
        for row in rows:
            if matches(row):
                if requested_columns is None:
                    projected.append(copy.deepcopy(row))
                else:
                    projected.append({column: row.get(column) for column in requested_columns})
        return _FakeQueryResult(projected)


class _FakeSupabaseAdmin:
    def __init__(self, store):
        self.store = store
        self.client = self

    def table(self, table_name):
        return _FakeTableQuery(self.store, table_name)

    def query(self, table_name, method="select", **kwargs):
        query = self.table(table_name)
        if method == "select":
            query.select(kwargs.get("columns", "*"))
            if "eq" in kwargs and "eq_value" in kwargs:
                query.eq(kwargs["eq"], kwargs["eq_value"])
            return query.execute()
        if method == "delete":
            if "eq" in kwargs and "eq_value" in kwargs:
                query.eq(kwargs["eq"], kwargs["eq_value"])
            query.delete()
            return query.execute()
        if method == "upsert":
            data = copy.deepcopy(kwargs.get("data", {}))
            unique_fields = [part.strip() for part in kwargs.get("on_conflict", "").split(",") if part.strip()]
            rows = self.store.setdefault(table_name, [])

            def matches(row):
                return all(row.get(field) == data.get(field) for field in unique_fields)

            existing = next((row for row in rows if matches(row)), None)
            if existing is None:
                data.setdefault("id", f"{table_name}-{len(rows) + 1}")
                rows.append(data)
                result = [data]
            else:
                existing.update(data)
                result = [existing]
            return _FakeQueryResult(result)

        raise NotImplementedError(method)


def test_api_key_delete_requires_ownership(monkeypatch):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.setenv("ENFORCE_AUTH", "false")
    monkeypatch.setattr("core.governance._get_user_id_from_request", _fake_user_id)

    store = {
        "user_api_keys": [
            {
                "id": "key-a",
                "user_id": "11111111-1111-1111-1111-111111111111",
                "provider": "openai",
                "key_suffix": "aaaaaa",
                "is_active": True,
                "encrypted_key": "enc-a",
            },
            {
                "id": "key-b",
                "user_id": "22222222-2222-2222-2222-222222222222",
                "provider": "openai",
                "key_suffix": "bbbbbb",
                "is_active": True,
                "encrypted_key": "enc-b",
            },
        ]
    }
    monkeypatch.setattr("core.supabase_client.supabase_admin", _FakeSupabaseAdmin(store))

    client = TestClient(app)

    forbidden = client.delete("/api/settings/api-keys/key-b", headers={"x-user-id": "11111111-1111-1111-1111-111111111111"})
    assert forbidden.status_code == 404

    allowed = client.delete("/api/settings/api-keys/key-a", headers={"x-user-id": "11111111-1111-1111-1111-111111111111"})
    assert allowed.status_code == 200
    assert allowed.json()["status"] == "success"
    assert store["user_api_keys"] == [
        {
            "id": "key-b",
            "user_id": "22222222-2222-2222-2222-222222222222",
            "provider": "openai",
            "key_suffix": "bbbbbb",
            "is_active": True,
            "encrypted_key": "enc-b",
        }
    ]


def test_api_key_save_and_list_only_show_suffix(monkeypatch):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.setenv("ENFORCE_AUTH", "false")
    monkeypatch.setattr("core.governance._get_user_id_from_request", _fake_user_id)
    monkeypatch.setattr("core.security.crypto.encrypt_api_key", lambda value: f"enc::{value}")
    monkeypatch.setattr("core.security.crypto.mask_key", lambda value, visible_chars=6: f"...{value[-visible_chars:]}")

    store = {"user_api_keys": []}
    monkeypatch.setattr("core.supabase_client.supabase_admin", _FakeSupabaseAdmin(store))

    client = TestClient(app)
    user_id = "11111111-1111-1111-1111-111111111111"
    api_key = "sk-test-123456"

    response = client.post(
        "/api/settings/api-keys",
        headers={"x-user-id": user_id, "Authorization": "Bearer test-token"},
        json={"provider": "openai", "api_key": api_key},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["key"]["key_suffix"] == "...123456"
    assert store["user_api_keys"][0]["encrypted_key"] == f"enc::{api_key}"

    listed = client.get("/api/settings/api-keys", headers={"x-user-id": user_id, "Authorization": "Bearer test-token"})
    assert listed.status_code == 200
    listed_key = listed.json()["keys"][0]
    assert listed_key["key_suffix"] == "...123456"
    assert listed_key["provider"] == "openai"


def test_api_key_test_rejects_unsupported_managed_model(monkeypatch):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.setenv("ENFORCE_AUTH", "false")
    monkeypatch.setattr("core.governance._get_user_id_from_request", _fake_user_id)

    client = TestClient(app)
    response = client.post(
        "/api/settings/api-keys/test",
        headers={"x-user-id": "11111111-1111-1111-1111-111111111111"},
        json={"provider": "openai", "api_key": "sk-test", "model": "not-a-supported-model"},
    )

    assert response.status_code == 400
    assert "unsupported model" in response.json()["detail"].lower()


def test_api_key_test_uses_selected_supported_model(monkeypatch):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.setenv("ENFORCE_AUTH", "false")
    monkeypatch.setattr("core.governance._get_user_id_from_request", _fake_user_id)

    captured: dict[str, object] = {}

    class FakeResponse:
        status_code = 200
        text = '{"ok": true}'

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def post(self, url, headers=None, json=None):
            captured["url"] = url
            captured["headers"] = headers or {}
            captured["json"] = json or {}
            return FakeResponse()

    monkeypatch.setattr("httpx.AsyncClient", FakeAsyncClient)

    client = TestClient(app)
    response = client.post(
        "/api/settings/api-keys/test",
        headers={"x-user-id": "11111111-1111-1111-1111-111111111111"},
        json={"provider": "openai", "api_key": "sk-test", "model": "gpt-4o"},
    )

    assert response.status_code == 200
    assert response.json()["success"] is True
    assert captured["json"]["model"] == "gpt-4o"


def test_workflow_run_blocks_unsupported_saved_provider_before_execution(monkeypatch):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.setenv("ENFORCE_AUTH", "false")
    monkeypatch.setattr("core.governance._get_user_id_from_request", _fake_user_id)
    monkeypatch.setattr(
        "core.governance.settings.get_user_settings",
        lambda _user_id: {
            **DEFAULT_SETTINGS,
            "provider": "openai",
            "model": "not-a-supported-model",
            "base_url": "https://api.openai.com/v1",
        },
    )

    client = TestClient(app)
    response = client.post(
        "/api/workflows/run",
        headers={"x-user-id": "11111111-1111-1111-1111-111111111111"},
        json={
            "id": "wf_provider_preflight",
            "initialInput": "Run a harmless workflow.",
            "nodes": [
                {
                    "id": "n1",
                    "type": "agent",
                    "data": {
                        "label": "QA Verification Agent",
                        "role": "qa_verification_agent",
                        "instruction": "Verify the input and produce a short report.",
                    },
                }
            ],
            "edges": [],
            "metadata": {"workflow_mode": "dag"},
        },
    )

    assert response.status_code == 400
    assert "unsupported model" in response.json()["detail"].lower()
