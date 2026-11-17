import { PrismaClient } from '@prisma/client';
import { createOrderForUser, findAuthUserByEmail } from '../api/services/restaurant-service.js';

const prisma = new PrismaClient();

async function main() {
  const waiter = await findAuthUserByEmail('mesero@restaurante.gt');
  if (!waiter) {
    throw new Error('No existe mesero@restaurante.gt');
  }

  const table = await prisma.restaurantTable.findFirst({ where: { tenantId: waiter.tenantId }, orderBy: { id: 'asc' } });
  const product = await prisma.product.findFirst({ where: { tenantId: waiter.tenantId }, orderBy: { id: 'asc' } });

  if (!table || !product) {
    throw new Error('Faltan datos base (mesa/producto).');
  }

  const user = {
    id: waiter.id,
    tenantId: waiter.tenantId,
    branchId: waiter.branchId ?? 1,
    role: waiter.role,
    permissions: waiter.permissions,
    name: waiter.name,
    email: waiter.email,
  };

  const order = await createOrderForUser(user, {
    tableId: table.id,
    customer: { name: 'Cliente demo' },
    type: 'DINE_IN',
    items: [{ productId: product.id, quantity: 1, notes: 'Demo para cobro' }],
  });

  console.log({ table: table.code, orderId: order.id, orderCode: order.code, total: order.total });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
