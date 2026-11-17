import { PrismaClient, RoleCode } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.findFirst({ orderBy: { id: 'desc' }, include: { branches: true } });
  if (!tenant) {
    throw new Error('No existe tenant en la base de datos.');
  }

  const branchId = tenant.branches[0]?.id ?? null;

  await prisma.user.upsert({
    where: { email: 'mesero@restaurante.gt' },
    update: {
      tenantId: tenant.id,
      branchId,
      role: RoleCode.WAITER,
      name: 'Mesero',
      passwordHash: bcrypt.hashSync('Mesero123*', 8),
      isActive: true,
    },
    create: {
      tenantId: tenant.id,
      branchId,
      role: RoleCode.WAITER,
      name: 'Mesero',
      email: 'mesero@restaurante.gt',
      passwordHash: bcrypt.hashSync('Mesero123*', 8),
      isActive: true,
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    await prisma.$disconnect();
    throw error;
  });
