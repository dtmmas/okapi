import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const tenantCount = await prisma.tenant.count();
  const branchCount = await prisma.branch.count();
  const userCount = await prisma.user.count();
  const users = await prisma.user.findMany({
    select: {
      role: true,
      name: true,
      email: true,
    },
    orderBy: {
      id: 'asc',
    },
  });

  console.log(
    JSON.stringify(
      {
        tenantCount,
        branchCount,
        userCount,
        users,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
