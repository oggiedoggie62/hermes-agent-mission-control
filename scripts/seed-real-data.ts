
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  console.log('Purging existing data...')
  await prisma.mission.deleteMany({})
  await prisma.idea.deleteMany({})
  await prisma.agentState.deleteMany({})
  
  console.log('Seeding real Hermes data...')
  
  // Real Agents based on memory/obsidian/crons
  const agents = [
    {
      id: 'x-gaming-bot',
      name: 'X Gaming Bot',
      emoji: '🎮',
      role: 'Social',
      status: 'online',
      currentTask: 'Waiting for fresh leaks (Source: Grok)',
      tasksCompleted: 450,
      totalCost: 12.50,
      recentActivity: JSON.stringify([{timestamp: new Date().toISOString(), message: 'Posted Thread Weekly Summary'}])
    },
    {
      id: 'petition-tracker',
      name: 'Destiny Petition Tracker',
      emoji: '✍️',
      role: 'Research',
      status: 'idle',
      currentTask: 'Monitoring Destiny 3 & SteamOS petitions',
      tasksCompleted: 89,
      totalCost: 2.15
    },
    {
      id: 'ufo-cms-builder',
      name: 'UFO CMS Builder',
      emoji: '🛸',
      role: 'Dev',
      status: 'working',
      currentTask: 'Syncing backend changes to Mac CMS',
      tasksCompleted: 124,
      totalCost: 5.80
    },
    {
      id: 'obsidian-sync-bot',
      name: 'Obsidian Sync Bot',
      emoji: '📓',
      role: 'Ops',
      status: 'online',
      currentTask: 'Indexing Nextcloud/Ideas and TODO',
      tasksCompleted: 567,
      totalCost: 0.00
    }
  ]
  
  for (const agent of agents) {
    await prisma.agentState.create({ data: agent })
  }

  // Real Missions based on history
  const missions = [
    {
      agentId: 'petition-tracker',
      title: 'Analyze Destiny 3 Petition Growth',
      description: 'Check if signatures passed 1000 milestone today.',
      status: 'completed',
      priority: 'high'
    },
    {
      agentId: 'x-gaming-bot',
      title: 'Post Destiny Petition Tracker Update',
      description: 'Engaging post about growth to X via Make.com',
      status: 'completed',
      priority: 'medium'
    },
    {
      agentId: 'ufo-cms-builder',
      title: 'Migrate to n8n',
      description: 'Test migration of Make.com webhooks to n8n for cost reduction.',
      status: 'pending',
      priority: 'medium'
    }
  ]
  
  for (const mission of missions) {
    await prisma.mission.create({ data: mission })
  }

  // Real Ideas from Obsidian/Keep
  const ideas = [
    {
      title: '3D Printing AI Integration',
      description: 'Automate print failure detection using Hermes/vision.',
      category: 'Creative',
      source: 'obsidian-sync-bot'
    },
    {
      title: '#BringDestinyToSteamOS Campaign',
      description: 'Focus growth scout to find key influencers in Steam Deck community.',
      category: 'Growth',
      source: 'x-gaming-bot'
    },
    {
      title: 'Self-hosted Password Manager',
      description: 'Setup vaultwarden on Mac Mini worker.',
      category: 'Ops',
      source: 'obsidian-sync-bot'
    }
  ]
  
  for (const idea of ideas) {
    await prisma.idea.create({ data: idea })
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
