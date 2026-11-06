"""Backend service runner for E-KYC Project.

Launches the FastAPI backend service via Uvicorn.
Supports:
  --create-admin   Provision an initial platform administrator
Automatically activates the project virtual environment (.venv) if available.
"""

import os
import subprocess
import sys


def main():
    project_root = os.path.dirname(os.path.abspath(__file__))
    venv_python = os.path.join(project_root, ".venv", "Scripts", "python.exe")

    # Check for management commands
    if "--create-admin" in sys.argv:
        if os.path.exists(venv_python) and os.path.abspath(sys.executable).lower() != os.path.abspath(venv_python).lower():
            cmd = [venv_python, "-m", "backend.scripts.create_admin"] + [arg for arg in sys.argv[1:] if arg != "--create-admin"]
            sys.exit(subprocess.call(cmd))
        from backend.scripts.create_admin import main as create_admin_main
        create_admin_main()
        return

    target_app = "backend.app.main:app"

    # Re-exec with .venv python if not already running in it
    if os.path.exists(venv_python) and os.path.abspath(sys.executable).lower() != os.path.abspath(venv_python).lower():
        print(f"[*] Activating virtual environment: {venv_python}")
        cmd = [venv_python, "-m", "uvicorn", target_app, "--host", "127.0.0.1", "--port", "8000", "--reload"]
        sys.exit(subprocess.call(cmd))

    # If already running inside .venv
    import uvicorn

    print(f"[*] Starting E-KYC FastAPI Backend ({target_app}) at http://127.0.0.1:8000 ...")
    uvicorn.run(target_app, host="127.0.0.1", port=8000, reload=True)


if __name__ == "__main__":
    main()
