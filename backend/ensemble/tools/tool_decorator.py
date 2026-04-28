"""
core/tool_decorator.py
Auto-generates tool metadata schema for agent tool registration.
Written from scratch (agency-agents source repo contains no Python code).
"""

import functools
import inspect

REGISTERED_TOOLS = {}


def tool(func):
    """Decorator that marks a function as an agent tool and registers its schema."""
    sig = inspect.signature(func)
    params = {}
    for name, param in sig.parameters.items():
        annotation = param.annotation
        if annotation == inspect.Parameter.empty:
            annotation = str
        type_map = {str: "string", int: "integer", float: "number", bool: "boolean"}
        params[name] = {
            "type": type_map.get(annotation, "string"),
            "description": f"Parameter '{name}' for tool '{func.__name__}'",
        }

    schema = {
        "name": func.__name__,
        "description": func.__doc__ or f"Tool: {func.__name__}",
        "parameters": {"type": "object", "properties": params},
        "required": [
            n for n, p in sig.parameters.items() if p.default == inspect.Parameter.empty
        ],
    }

    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        return func(*args, **kwargs)

    wrapper._is_tool = True
    wrapper._schema = schema
    REGISTERED_TOOLS[func.__name__] = wrapper
    return wrapper


def get_tool_schemas():
    """Return a list of all registered tool schemas."""
    return [t._schema for t in REGISTERED_TOOLS.values()]
