/* agent: codex | model: gpt-5 | date: 2026-07-14 */
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const missions = await prisma.mission.findMany({
      where: {
        status: "completed",
        isArchived: true,
      },
      orderBy: {
        completedAt: "desc",
      },
    });
    return new Response(JSON.stringify(missions), { status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ error: "Failed to fetch archived missions" }), { status: 500 });
  }
}
