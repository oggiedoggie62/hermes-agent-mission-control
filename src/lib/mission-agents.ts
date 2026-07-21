/* agent: codex | model: gpt-5.5 | date: 2026-07-20 */
import { getAgents } from "@/lib/agentos";

export interface MissionAgentChoice {
  id: string;
  name: string;
  emoji: string | null;
}

const HERMES_PROFILE_AGENTS: MissionAgentChoice[] = [
  { id: "research-bot", name: "Research Bot", emoji: "🔬" },
  { id: "web-bot", name: "Web Bot", emoji: "🌐" },
  { id: "writer-bot", name: "Writer Bot", emoji: "✍️" },
  { id: "mini", name: "Mini", emoji: "🔹" },
];

export async function getMissionAgentChoices(
  readRegistry: typeof getAgents = getAgents,
): Promise<MissionAgentChoice[]> {
  const registry = await readRegistry().catch(() => null);
  const registryAgents = registry
    ? Object.entries(registry.agents).map(([id, agent]) => ({
        id,
        name: agent.name || id,
        emoji: "🤖",
      }))
    : [];

  return [...registryAgents, ...HERMES_PROFILE_AGENTS];
}
