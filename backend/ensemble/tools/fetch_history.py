"""
Module: fetch_history.py
Description: Part of the Ensemble backend system.
"""

from backend.ensemble.audit import AuditLogger


def fetch_history(limit=5, offset=0, order="DESC", company_id="company_alpha"):
    """
    Tool to fetch conversation history from the Ensemble Audit Logger.

    Args:
        limit (int): Number of events to fetch.
        offset (int): Number of events to skip.
        order (str): "ASC" (oldest first) or "DESC" (newest first).
        company_id (str): The organization context.

    Returns:
        str: Formatted historical messages.
    """
    audit = AuditLogger()
    history = audit.get_history(
        company_id, limit=int(limit), offset=int(offset), order=order
    )

    if not history:
        return f"No history found for company '{company_id}' at offset {offset}."

    output = []
    # If order is ASC, it's chronological. If DESC, it's most recent first.
    direction = "Chronological" if order.upper() == "ASC" else "Most Recent First"
    output.append(f"--- FETCHED HISTORY ({direction}) ---")

    for event in history:
        a_type = event["action_type"]
        details = event.get("details", {})
        agent = event.get("agent_id", "unknown")
        ts = event.get("timestamp", "")

        if a_type == "USER_INPUT":
            content = details.get("text", "")
            output.append(f"[{ts}] USER: {content}")
        elif a_type == "RESULT":
            content = details.get("result", "")
            output.append(f"[{ts}] ASSISTANT ({agent}): {content}")
        elif a_type == "TOOL_RESULT":
            tool = details.get("tool", "unknown")
            out = details.get("output", "")
            output.append(f"[{ts}] TOOL_RESULT ({tool}): {out}")
        else:
            # Internal actions like tool calls
            output.append(
                f"[{ts}] INTERNAL ({a_type}): {agent} performed {details.get('type', 'action')}"
            )

    return "\n".join(output)


if __name__ == "__main__":
    # Test call
    print(fetch_history(limit=2, order="ASC"))
    print("\n---\n")
    print(fetch_history(limit=2, order="DESC"))
