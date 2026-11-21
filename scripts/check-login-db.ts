import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.count();
  const tenants = await prisma.tenant.count();
  const sample = await prisma.user.findFirst({
    select: { id: true, email: true, isActive: true, role: true, passwordHash: true },
    orderBy: { id: 'asc' },
  });

  console.log(
    JSON.stringify(
      {
        users,
        tenants,
        sample: sample
          ? {
              id: sample.id,
              email: sample.email,
              isActive: sample.isActive,
              role: sample.role,
              passwordHashPrefix: sample.passwordHash.slice(0, 12),
            }
          : null,
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