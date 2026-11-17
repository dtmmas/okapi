import { PrismaClient } from '@prisma/client';
import { payOrderForUser, getBootstrapSnapshot, findAuthUserByEmail } from '../api/services/restaurant-service.js';

const prisma = new PrismaClient();

async function main() {
  const cashier = await findAuthUserByEmail('cajero@restaurante.gt');
  if (!cashier) {
    throw new Error('No existe cajero@restaurante.gt');
  }

  const { passwordHash: _ph, ...user } = cashier as any;
  const snapshotBefore = await getBootstrapSnapshot(user);
  const order = snapshotBefore.activeOrders[0];
  if (!order) {
    console.log('No hay órdenes activas para probar cobro.');
    return;
  }

  console.log('Antes:', { orderId: order.id, orderCode: order.code, total: order.total, activeOrders: snapshotBefore.activeOrders.length });
  await payOrderForUser(user, { orderId: order.id, method: 'CASH', amount: Number(order.total), receivedAmount: Number(order.total) + 10 });

  const snapshotAfter = await getBootstrapSnapshot(user);
  const stillActive = snapshotAfter.activeOrders.some((o) => o.id === order.id);
  const orderRow = await prisma.order.findUnique({ where: { id: order.id } });
  console.log('Después:', { stillActive, status: orderRow?.status, closedAt: Boolean(orderRow?.closedAt), activeOrders: snapshotAfter.activeOrders.length });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
