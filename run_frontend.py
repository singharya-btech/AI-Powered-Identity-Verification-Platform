"""Frontend service runner for E-KYC Project.

Launches the modern React (Vite) interface in frontend-react/.
"""

import os
import shutil
import subprocess
import sys


def main():
    project_root = os.path.dirname(os.path.abspath(__file__))
    react_dir = os.path.join(project_root, "frontend-react")

    npm_cmd = shutil.which("npm.cmd") or shutil.which("npm") or "npm"
    print("[*] Starting E-KYC Modern React Frontend (Vite) at http://127.0.0.1:5173 ...")
    cmd = [npm_cmd, "run", "dev"]
    sys.exit(subprocess.call(cmd, cwd=react_dir, shell=True))


if __name__ == "__main__":
    main()
