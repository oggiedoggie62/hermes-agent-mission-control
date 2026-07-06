
import os
import re
import requests
from pathlib import Path

MISSION_CONTROL_DIR = Path(__file__).resolve().parent.parent
NAS_PATH = "/mnt/nas/Youtube4Editing/scripts"
API_URL = "http://localhost:3000/api/content/index"

# Load INTERNAL_API_SECRET from .env if not already in environment
API_SECRET = os.getenv("INTERNAL_API_SECRET")
if not API_SECRET:
    env_path = MISSION_CONTROL_DIR / ".env"
    if env_path.exists():
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line.startswith("INTERNAL_API_SECRET="):
                    raw = line.split("=", 1)[1].strip("\"'")
                    API_SECRET = raw
                    break

def index_files():
    if not os.path.exists(NAS_PATH):
        print(f"NAS path not found: {NAS_PATH}")
        return

    files_found = []
    for path in Path(NAS_PATH).rglob('*'):
        if path.is_file() and path.suffix in ['.py', '.sh', '.md', '.txt', '.json']:
            try:
                content = ""
                # Only read first 5000 chars for preview
                with open(path, 'r', errors='ignore') as f:
                    content = f.read(5000)
                
                stat = path.stat()
                files_found.append({
                    "path": str(path),
                    "name": path.name,
                    "extension": path.suffix,
                    "size": stat.st_size,
                    "content": content,
                    "category": "NAS-Scripts"
                })
            except Exception as e:
                print(f"Error reading {path}: {e}")

    if files_found:
        try:
            res = requests.post(
                API_URL, 
                json={"files": files_found}, 
                headers={"Authorization": f"Bearer {API_SECRET}"}, 
                timeout=10
            )
            print(f"Indexed {len(files_found)} files. Status: {res.status_code}")
        except Exception as e:
            print(f"Failed to post to API: {e}")

if __name__ == "__main__":
    index_files()
