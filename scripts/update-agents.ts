
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  console.log('Adding Homelab and Engineer agents...')
  
  const additionalAgents = [
    {
      id: 'homelab-agent',
      name: 'Homelab Agent',
      emoji: '🏠',
      role: 'Ops',
      status: 'online',
      currentTask: 'Monitoring Mac Mini worker & Mint hub sync',
      tasksCompleted: 842,
      totalCost: 0.00
    },
    {
      id: 'autonomous-engineer',
      name: 'Autonomous Engineer',
      emoji: '👷',
      role: 'Dev',
      status: 'idle',
      currentTask: 'Scheduled: Project generation at 8:00 AM',
      tasksCompleted: 15,
      totalCost: 4.20
    }
  ]
  
  for (const agent of additionalAgents) {
    await prisma.agentState.upsert({
      where: { id: agent.id },
      update: agent,
      create: agent
    })
  }

  // Add a mission for the Engineer
  await prisma.mission.create({
    data: {
      agentId: 'autonomous-engineer',
      title: 'Generate Daily Project',
      description: 'Create a new creative project blueprint based on recent Obsidian ideas.',
      status: 'pending',
      priority: 'high'
    }
  })

  console.log('Update complete.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
