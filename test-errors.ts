import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const errors = await prisma.errorLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10
  })
  console.log(JSON.stringify(errors, null, 2))
}

main()
