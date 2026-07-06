
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  console.log('Ensuring real mission data is seeded...')
  
  // Real Missions based on user history
  const missions = [
    {
      agentId: 'autonomous-engineer',
      title: 'Generate Daily Project',
      description: 'Create a new creative project blueprint based on recent Obsidian ideas.',
      status: 'pending',
      priority: 'high'
    },
    {
      agentId: 'petition-tracker',
      title: 'Destiny SteamOS Milestone',
      description: 'Check for 1000 signature goal on Change.org.',
      status: 'active',
      priority: 'medium'
    },
    {
      agentId: 'x-gaming-bot',
      title: 'Morning Leaks Digest',
      description: 'Fetch Grok leaks and post summary to X.',
      status: 'completed',
      priority: 'high'
    }
  ]
  
  for (const m of missions) {
    await prisma.mission.upsert({
      where: { id: 'mission-' + m.title.replace(/ /g, '-').toLowerCase() },
      update: m,
      create: { ...m, id: 'mission-' + m.title.replace(/ /g, '-').toLowerCase() }
    })
  }
}

main().catch(console.error).finally(() => prisma.$disconnect())
