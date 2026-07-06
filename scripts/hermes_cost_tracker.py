import os
import requests

class HermesCostTracker:
    """
    A helper class for Hermes agents to track LLM costs and self-report
    to the Hermes Mission Control dashboard.
    """
    
    # Standard pricing per 1k tokens (Update these based on current rates)
    PRICING = {
        "gpt-4o": {"input": 0.005, "output": 0.015},
        "gpt-4o-mini": {"input": 0.00015, "output": 0.0006},
        "claude-3-5-sonnet": {"input": 0.003, "output": 0.015},
        "claude-3-haiku": {"input": 0.00025, "output": 0.00125},
        "gemini-1.5-flash": {"input": 0.000125, "output": 0.000375},
    }

    def __init__(self, agent_id, agent_name, emoji="🤖", role="Utility", dashboard_url="http://localhost:3000"):
        self.agent_id = agent_id
        self.agent_name = agent_name
        self.emoji = emoji
        self.role = role
        self.dashboard_url = f"{dashboard_url.rstrip('/')}/api/agents/state"
        self.api_secret = os.getenv("INTERNAL_API_SECRET")
        self.total_cost = 0.0
        self.tasks_completed = 0

    def add_usage(self, model_name, input_tokens, output_tokens):
        """Calculate and add cost based on model and token counts."""
        model_pricing = self.PRICING.get(model_name, self.PRICING["gpt-4o-mini"]) # Default to cheap mini
        cost = (input_tokens / 1000 * model_pricing["input"]) + (output_tokens / 1000 * model_pricing["output"])
        self.total_cost += cost
        return cost

    def report_state(self, status, current_task, tasks_inc=0):
        """Send heartbeat to Mission Control."""
        if not self.api_secret:
            print("Warning: INTERNAL_API_SECRET not set. Cannot report to dashboard.")
            return

        self.tasks_completed += tasks_inc
        
        payload = {
            "id": self.agent_id,
            "name": self.agent_name,
            "emoji": self.emoji,
            "role": self.role,
            "status": status,
            "currentTask": current_task,
            "tasksCompleted": self.tasks_completed,
            "totalCost": round(self.total_cost, 4)
        }
        
        try:
            headers = {"Authorization": f"Bearer {self.api_secret}"}
            res = requests.post(self.dashboard_url, json=payload, headers=headers, timeout=5)
            return res.status_code == 200
        except Exception as e:
            print(f"Failed to report to Mission Control: {e}")
            return False
