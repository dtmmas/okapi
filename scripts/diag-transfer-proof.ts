import { PrismaClient } from '@prisma/client';
import { createOrderForUser, findAuthUserByEmail, payOrderForUser } from '../api/services/restaurant-service.js';

const prisma = new PrismaClient();

async function main() {
  const waiter = await findAuthUserByEmail('mesero@restaurante.gt');
  const cashier = await findAuthUserByEmail('cajero@restaurante.gt');

  if (!waiter || !cashier) {
    throw new Error('Faltan usuarios demo (mesero/cajero).');
  }

  const table = await prisma.restaurantTable.findFirst({ where: { tenantId: waiter.tenantId }, orderBy: { id: 'asc' } });
  const product = await prisma.product.findFirst({ where: { tenantId: waiter.tenantId }, orderBy: { id: 'asc' } });

  if (!table || !product) {
    throw new Error('Faltan datos base (mesa/producto).');
  }

  const order = await createOrderForUser(
    { id: waiter.id, tenantId: waiter.tenantId, branchId: waiter.branchId ?? 1, role: waiter.role, permissions: waiter.permissions, name: waiter.name, email: waiter.email },
    {
      tableId: table.id,
      customer: { name: 'Cliente transferencia' },
      type: 'DINE_IN',
      items: [{ productId: product.id, quantity: 1 }],
    },
  );

  const proofImage =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7b3WQAAAAASUVORK5CYII=';

  await payOrderForUser(
    { id: cashier.id, tenantId: cashier.tenantId, branchId: cashier.branchId ?? 1, role: cashier.role, permissions: cashier.permissions, name: cashier.name, email: cashier.email },
    { orderId: order.id, method: 'TRANSFER', amount: Number(order.total), reference: 'TRX-123456', proofImage },
  );

  const payment = await prisma.payment.findFirst({ where: { orderId: order.id }, orderBy: { id: 'desc' } });
  console.log({
    orderId: order.id,
    paymentId: payment?.id,
    method: payment?.method,
    hasReference: Boolean(payment?.reference),
    hasProofImage: Boolean(payment?.proofImage),
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
