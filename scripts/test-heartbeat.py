import os
import requests
import time

# Simulation of a Hermes Agent heartbeat
API_URL = "http://localhost:3000/api/agents/state"
API_SECRET = "05075888cc8a813dcb4faa766ccb017c930a7eb51cf829a48238eb6bd12b5f84"

payload = {
    "id": "hermes-mission-control-manager",
    "name": "Hermes Mission Control Manager",
    "emoji": "🛰️",
    "role": "Orchestrator",
    "status": "working",
    "currentTask": "Monitoring system health and dashboard status",
    "tasksCompleted": 1,
    "totalCost": 0.05,
}

try:
    response = requests.post(
        API_URL,
        headers={"Authorization": f"Bearer {API_SECRET}"},
        json=payload,
        timeout=10
    )
    print(f"Status Code: {response.status_code}")
    print(f"Response: {response.text}")
except Exception as e:
    print(f"Error: {e}")
