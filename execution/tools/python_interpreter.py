import subprocess
import sys
import tempfile
import os

def python_interpreter(code: str) -> str:
    """
    Executes Python code in a subprocess and returns stdout/stderr.
    Args:
        code: The Python code to execute.
    Returns:
        str: The output of the code execution.
    """
    with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
        f.write(code)
        temp_path = f.name

    try:
        result = subprocess.run(
            [sys.executable, temp_path],
            capture_output=True,
            text=True,
            timeout=30
        )
        output = result.stdout
        if result.stderr:
            output += "\n--- ERRORS ---\n" + result.stderr
        return output.strip() or "Success (No output)"
    except subprocess.TimeoutExpired:
        return "Error: Execution timed out (30s limit)."
    except Exception as e:
        return f"Error: {str(e)}"
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)

if __name__ == "__main__":
    # Test
    print(python_interpreter("print(2+2)"))
