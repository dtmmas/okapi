import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const tenants = await prisma.tenant.findMany({ include: { branches: true } });
  const users = await prisma.user.findMany({ orderBy: { id: 'asc' } });
  console.log('Tenants:', tenants.map((tenant) => ({ id: tenant.id, name: tenant.name, branches: tenant.branches.length })));
  console.log(
    'Users:',
    users.map((user) => ({
      id: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      branchId: user.branchId,
      isActive: user.isActive,
    })),
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

