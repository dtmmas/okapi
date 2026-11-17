import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.findFirst({ orderBy: { id: 'desc' }, include: { branches: true } });
  if (!tenant) {
    console.log('No hay tenant.');
    return;
  }

  const branchId = tenant.branches[0]?.id ?? null;
  const openOrders = await prisma.order.findMany({
    where: {
      tenantId: tenant.id,
      status: { in: ['OPEN', 'IN_PREPARATION', 'READY', 'SERVED'] },
    },
    orderBy: { createdAt: 'desc' },
    include: { table: true, customer: true },
  });

  const tables = await prisma.restaurantTable.findMany({
    where: { tenantId: tenant.id },
    orderBy: { id: 'asc' },
  });

  const openShift = branchId
    ? await prisma.cashShift.findFirst({ where: { tenantId: tenant.id, branchId, closedAt: null }, orderBy: { openedAt: 'desc' } })
    : null;

  console.log({
    tenantId: tenant.id,
    branchId,
    tables: tables.length,
    openOrders: openOrders.length,
    cashShiftOpen: Boolean(openShift),
  });

  console.log(
    'Orders:',
    openOrders.map((o) => ({
      id: o.id,
      code: o.code,
      status: o.status,
      table: o.table?.code ?? null,
      customer: o.customer?.name ?? null,
      total: Number(o.total),
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

