import 'dotenv/config';
import {
  PrismaClient,
  OrderStatus,
  OrderType,
  PreparationStation,
  PreparationStatus,
  RoleCode,
  TableStatus,
} from '@prisma/client';

const prisma = new PrismaClient();

function imageUrl(prompt: string) {
  return `https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=${encodeURIComponent(prompt)}&image_size=landscape_4_3`;
}

async function upsertCategory(args: {
  tenantId: number;
  name: string;
  parentId?: number | null;
  color?: string | null;
  station: PreparationStation;
}) {
  const existing = await prisma.category.findFirst({
    where: {
      tenantId: args.tenantId,
      name: args.name,
      parentId: args.parentId ?? null,
    },
  });

  if (existing) {
    return existing;
  }

  return prisma.category.create({
    data: {
      tenantId: args.tenantId,
      name: args.name,
      parentId: args.parentId ?? null,
      color: args.color ?? null,
      station: args.station,
    },
  });
}

async function upsertProduct(args: {
  tenantId: number;
  categoryId: number;
  name: string;
  sku: string;
  price: number;
  isPrepared: boolean;
  imagePrompt: string;
}) {
  const existing = await prisma.product.findFirst({
    where: {
      tenantId: args.tenantId,
      sku: args.sku,
    },
  });

  if (existing) {
    return prisma.product.update({
      where: { id: existing.id },
      data: {
        name: args.name,
        categoryId: args.categoryId,
        price: args.price,
        isPrepared: args.isPrepared,
        imageUrl: existing.imageUrl ?? imageUrl(args.imagePrompt),
      },
    });
  }

  return prisma.product.create({
    data: {
      tenantId: args.tenantId,
      categoryId: args.categoryId,
      name: args.name,
      sku: args.sku,
      price: args.price,
      isPrepared: args.isPrepared,
      imageUrl: imageUrl(args.imagePrompt),
    },
  });
}

async function upsertCustomer(args: {
  tenantId: number;
  name: string;
  phone: string;
  email?: string | null;
  points?: number;
  creditLimit?: number;
}) {
  const existing = await prisma.customer.findFirst({
    where: {
      tenantId: args.tenantId,
      phone: args.phone,
    },
  });

  if (existing) {
    return prisma.customer.update({
      where: { id: existing.id },
      data: {
        name: args.name,
        email: args.email ?? existing.email,
        points: args.points ?? existing.points,
        creditLimit: args.creditLimit ?? existing.creditLimit,
      },
    });
  }

  return prisma.customer.create({
    data: {
      tenantId: args.tenantId,
      name: args.name,
      phone: args.phone,
      email: args.email ?? null,
      points: args.points ?? 0,
      creditLimit: args.creditLimit ?? 0,
    },
  });
}

async function upsertTable(args: {
  tenantId: number;
  branchId: number;
  code: string;
  area: string;
  capacity: number;
  status?: TableStatus;
}) {
  const existing = await prisma.restaurantTable.findFirst({
    where: {
      branchId: args.branchId,
      code: args.code,
    },
  });

  if (existing) {
    return prisma.restaurantTable.update({
      where: { id: existing.id },
      data: {
        area: args.area,
        capacity: args.capacity,
        status: args.status ?? existing.status,
      },
    });
  }

  return prisma.restaurantTable.create({
    data: {
      tenantId: args.tenantId,
      branchId: args.branchId,
      code: args.code,
      area: args.area,
      capacity: args.capacity,
      status: args.status ?? TableStatus.FREE,
    },
  });
}

async function ensureOpenCashShift(tenantId: number, branchId: number, cashierId: number) {
  const existing = await prisma.cashShift.findFirst({
    where: {
      tenantId,
      branchId,
      closedAt: null,
    },
  });

  if (existing) {
    return existing;
  }

  return prisma.cashShift.create({
    data: {
      tenantId,
      branchId,
      openedById: cashierId,
      openingAmount: 800,
    },
  });
}

async function createOrderIfMissing(args: {
  tenantId: number;
  branchId: number;
  tableId: number;
  customerId: number;
  code: string;
  status: OrderStatus;
  channel: string;
  items: Array<{
    productId: number;
    quantity: number;
    unitPrice: number;
    notes?: string;
    station: PreparationStation;
    status: PreparationStatus;
  }>;
}) {
  const existing = await prisma.order.findUnique({
    where: { code: args.code },
  });

  if (existing) {
    return existing;
  }

  const total = args.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

  return prisma.order.create({
    data: {
      tenantId: args.tenantId,
      branchId: args.branchId,
      tableId: args.tableId,
      customerId: args.customerId,
      code: args.code,
      type: OrderType.DINE_IN,
      status: args.status,
      total,
      channel: args.channel,
      items: {
        create: args.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          notes: item.notes,
          station: item.station,
          status: item.status,
        })),
      },
    },
  });
}

async function main() {
  const tenant = await prisma.tenant.findFirst({
    include: {
      branches: {
        orderBy: { id: 'asc' },
      },
    },
  });

  if (!tenant || tenant.branches.length === 0) {
    throw new Error('No existe tenant ni sucursal base. Primero deja creada la estructura mínima.');
  }

  const branch = tenant.branches[0];
  const cashier = await prisma.user.findFirst({
    where: {
      tenantId: tenant.id,
      role: RoleCode.CASHIER,
    },
  });

  if (!cashier) {
    throw new Error('No existe un usuario cajero para abrir la caja de prueba.');
  }

  await ensureOpenCashShift(tenant.id, branch.id, cashier.id);

  const platillosRoot = await upsertCategory({
    tenantId: tenant.id,
    name: 'Platillos',
    station: PreparationStation.KITCHEN,
    color: '#f59e0b',
  });
  const productosRoot = await upsertCategory({
    tenantId: tenant.id,
    name: 'Productos',
    station: PreparationStation.BAR,
    color: '#0ea5e9',
  });
  const salsasRoot = await upsertCategory({
    tenantId: tenant.id,
    name: 'Salsas',
    station: PreparationStation.KITCHEN,
    color: '#ef4444',
  });
  const aderezosRoot = await upsertCategory({
    tenantId: tenant.id,
    name: 'Aderezos',
    station: PreparationStation.KITCHEN,
    color: '#22c55e',
  });

  const entradas = await upsertCategory({
    tenantId: tenant.id,
    name: 'Entradas',
    parentId: platillosRoot.id,
    station: PreparationStation.KITCHEN,
    color: '#fb923c',
  });
  const platosFuertes = await upsertCategory({
    tenantId: tenant.id,
    name: 'Platos fuertes',
    parentId: platillosRoot.id,
    station: PreparationStation.KITCHEN,
    color: '#f97316',
  });
  const postres = await upsertCategory({
    tenantId: tenant.id,
    name: 'Postres',
    parentId: platillosRoot.id,
    station: PreparationStation.PASTRY,
    color: '#a855f7',
  });
  const bebidas = await upsertCategory({
    tenantId: tenant.id,
    name: 'Bebidas',
    parentId: productosRoot.id,
    station: PreparationStation.BAR,
    color: '#06b6d4',
  });
  const empaquetados = await upsertCategory({
    tenantId: tenant.id,
    name: 'Empaquetados',
    parentId: productosRoot.id,
    station: PreparationStation.BAR,
    color: '#64748b',
  });
  const salsasPicantes = await upsertCategory({
    tenantId: tenant.id,
    name: 'Picantes',
    parentId: salsasRoot.id,
    station: PreparationStation.KITCHEN,
    color: '#dc2626',
  });
  const salsasClasicas = await upsertCategory({
    tenantId: tenant.id,
    name: 'Clásicas',
    parentId: salsasRoot.id,
    station: PreparationStation.KITCHEN,
    color: '#f97316',
  });
  const aderezosCremosos = await upsertCategory({
    tenantId: tenant.id,
    name: 'Cremosos',
    parentId: aderezosRoot.id,
    station: PreparationStation.KITCHEN,
    color: '#16a34a',
  });

  const lomo = await upsertProduct({
    tenantId: tenant.id,
    categoryId: platosFuertes.id,
    name: 'Lomo saltado',
    sku: 'PLT-001',
    price: 52,
    isPrepared: true,
    imagePrompt: 'realistic food photo of lomo saltado with fries and rice, restaurant plating, high detail',
  });
  const hamburguesa = await upsertProduct({
    tenantId: tenant.id,
    categoryId: platosFuertes.id,
    name: 'Hamburguesa doble',
    sku: 'PLT-002',
    price: 48,
    isPrepared: true,
    imagePrompt: 'realistic food photo of double cheeseburger with fries, restaurant style, high detail',
  });
  const tacos = await upsertProduct({
    tenantId: tenant.id,
    categoryId: entradas.id,
    name: 'Tacos de birria',
    sku: 'PLT-003',
    price: 42,
    isPrepared: true,
    imagePrompt: 'realistic food photo of birria tacos with sauce, restaurant plating, high detail',
  });
  const pasta = await upsertProduct({
    tenantId: tenant.id,
    categoryId: platosFuertes.id,
    name: 'Pasta Alfredo',
    sku: 'PLT-004',
    price: 39,
    isPrepared: true,
    imagePrompt: 'realistic food photo of creamy alfredo pasta in a bowl, restaurant lighting, high detail',
  });
  const brownie = await upsertProduct({
    tenantId: tenant.id,
    categoryId: postres.id,
    name: 'Brownie con helado',
    sku: 'PLT-005',
    price: 28,
    isPrepared: true,
    imagePrompt: 'realistic dessert photo of brownie with vanilla ice cream, restaurant plating, high detail',
  });
  const cheesecake = await upsertProduct({
    tenantId: tenant.id,
    categoryId: postres.id,
    name: 'Cheesecake de fresa',
    sku: 'PLT-006',
    price: 26,
    isPrepared: true,
    imagePrompt: 'realistic dessert photo of strawberry cheesecake slice, high detail',
  });
  const limonada = await upsertProduct({
    tenantId: tenant.id,
    categoryId: bebidas.id,
    name: 'Limonada frozen',
    sku: 'PRD-001',
    price: 14,
    isPrepared: false,
    imagePrompt: 'realistic drink photo of frozen lemonade in a glass with mint, high detail',
  });
  const cola = await upsertProduct({
    tenantId: tenant.id,
    categoryId: bebidas.id,
    name: 'Gaseosa',
    sku: 'PRD-002',
    price: 9,
    isPrepared: false,
    imagePrompt: 'realistic drink photo of cola soda with ice, high detail',
  });
  const agua = await upsertProduct({
    tenantId: tenant.id,
    categoryId: empaquetados.id,
    name: 'Agua pura',
    sku: 'PRD-003',
    price: 7,
    isPrepared: false,
    imagePrompt: 'realistic bottle of pure water with clean label, high detail',
  });
  const cerveza = await upsertProduct({
    tenantId: tenant.id,
    categoryId: bebidas.id,
    name: 'Cerveza nacional',
    sku: 'PRD-004',
    price: 18,
    isPrepared: false,
    imagePrompt: 'realistic beer bottle and glass on bar counter, high detail',
  });
  const salsaPicante = await upsertProduct({
    tenantId: tenant.id,
    categoryId: salsasPicantes.id,
    name: 'Salsa picante roja',
    sku: 'SAL-001',
    price: 4,
    isPrepared: false,
    imagePrompt: 'realistic bowl of spicy red sauce, food styling, high detail',
  });
  const salsaBBQ = await upsertProduct({
    tenantId: tenant.id,
    categoryId: salsasClasicas.id,
    name: 'Salsa BBQ',
    sku: 'SAL-002',
    price: 4,
    isPrepared: false,
    imagePrompt: 'realistic bowl of barbecue sauce, glossy texture, high detail',
  });
  const ranch = await upsertProduct({
    tenantId: tenant.id,
    categoryId: aderezosCremosos.id,
    name: 'Aderezo ranch',
    sku: 'ADE-001',
    price: 4,
    isPrepared: false,
    imagePrompt: 'realistic bowl of ranch dressing, creamy texture, high detail',
  });
  const chipotle = await upsertProduct({
    tenantId: tenant.id,
    categoryId: aderezosCremosos.id,
    name: 'Aderezo chipotle',
    sku: 'ADE-002',
    price: 4,
    isPrepared: false,
    imagePrompt: 'realistic bowl of chipotle dressing, creamy orange texture, high detail',
  });

  const tableConfigs = [
    { area: 'Salón principal', prefix: 'SAL', count: 6, capacity: 4 },
    { area: 'Terraza', prefix: 'TER', count: 4, capacity: 4 },
    { area: 'Barra', prefix: 'BAR', count: 3, capacity: 2 },
    { area: 'VIP', prefix: 'VIP', count: 2, capacity: 6 },
  ];

  const createdTables = [];
  for (const area of tableConfigs) {
    for (let index = 1; index <= area.count; index += 1) {
      const code = `${area.prefix}-${String(index).padStart(2, '0')}`;
      const table = await upsertTable({
        tenantId: tenant.id,
        branchId: branch.id,
        code,
        area: area.area,
        capacity: area.capacity,
      });
      createdTables.push(table);
    }
  }

  await prisma.restaurantTable.updateMany({
    where: {
      branchId: branch.id,
      code: { in: ['SAL-01', 'SAL-02', 'BAR-01'] },
    },
    data: {
      status: TableStatus.OCCUPIED,
    },
  });

  await prisma.restaurantTable.updateMany({
    where: {
      branchId: branch.id,
      code: { in: ['VIP-01'] },
    },
    data: {
      status: TableStatus.RESERVED,
    },
  });

  const customer1 = await upsertCustomer({
    tenantId: tenant.id,
    name: 'Juan Pérez',
    phone: '5551-0001',
    email: 'juan@cliente.gt',
    points: 40,
    creditLimit: 250,
  });
  const customer2 = await upsertCustomer({
    tenantId: tenant.id,
    name: 'María López',
    phone: '5551-0002',
    email: 'maria@cliente.gt',
    points: 90,
    creditLimit: 500,
  });
  const customer3 = await upsertCustomer({
    tenantId: tenant.id,
    name: 'Carlos Ramírez',
    phone: '5551-0003',
    email: 'carlos@cliente.gt',
    points: 20,
    creditLimit: 0,
  });
  const customer4 = await upsertCustomer({
    tenantId: tenant.id,
    name: 'Ana García',
    phone: '5551-0004',
    email: 'ana@cliente.gt',
    points: 140,
    creditLimit: 300,
  });

  const tableByCode = new Map(createdTables.map((table) => [table.code, table]));

  await createOrderIfMissing({
    tenantId: tenant.id,
    branchId: branch.id,
    tableId: tableByCode.get('SAL-01')!.id,
    customerId: customer1.id,
    code: 'ORD-701',
    status: OrderStatus.IN_PREPARATION,
    channel: 'Salón',
    items: [
      {
        productId: lomo.id,
        quantity: 1,
        unitPrice: 52,
        notes: 'Sin cebolla',
        station: PreparationStation.KITCHEN,
        status: PreparationStatus.IN_PREPARATION,
      },
      {
        productId: limonada.id,
        quantity: 2,
        unitPrice: 14,
        station: PreparationStation.BAR,
        status: PreparationStatus.PENDING,
      },
      {
        productId: salsaPicante.id,
        quantity: 1,
        unitPrice: 4,
        station: PreparationStation.KITCHEN,
        status: PreparationStatus.PENDING,
      },
    ],
  });

  await createOrderIfMissing({
    tenantId: tenant.id,
    branchId: branch.id,
    tableId: tableByCode.get('SAL-02')!.id,
    customerId: customer2.id,
    code: 'ORD-702',
    status: OrderStatus.OPEN,
    channel: 'Salón',
    items: [
      {
        productId: hamburguesa.id,
        quantity: 2,
        unitPrice: 48,
        station: PreparationStation.KITCHEN,
        status: PreparationStatus.PENDING,
      },
      {
        productId: cola.id,
        quantity: 2,
        unitPrice: 9,
        station: PreparationStation.BAR,
        status: PreparationStatus.PENDING,
      },
      {
        productId: ranch.id,
        quantity: 2,
        unitPrice: 4,
        station: PreparationStation.KITCHEN,
        status: PreparationStatus.PENDING,
      },
    ],
  });

  await createOrderIfMissing({
    tenantId: tenant.id,
    branchId: branch.id,
    tableId: tableByCode.get('BAR-01')!.id,
    customerId: customer3.id,
    code: 'ORD-703',
    status: OrderStatus.READY,
    channel: 'Barra',
    items: [
      {
        productId: cerveza.id,
        quantity: 2,
        unitPrice: 18,
        station: PreparationStation.BAR,
        status: PreparationStatus.READY,
      },
      {
        productId: brownie.id,
        quantity: 1,
        unitPrice: 28,
        station: PreparationStation.PASTRY,
        status: PreparationStatus.READY,
      },
    ],
  });

  const counts = await Promise.all([
    prisma.category.count({ where: { tenantId: tenant.id } }),
    prisma.product.count({ where: { tenantId: tenant.id } }),
    prisma.customer.count({ where: { tenantId: tenant.id } }),
    prisma.restaurantTable.count({ where: { tenantId: tenant.id } }),
    prisma.order.count({ where: { tenantId: tenant.id } }),
  ]);

  console.log(
    JSON.stringify(
      {
        ok: true,
        tenant: tenant.name,
        branch: branch.name,
        resumen: {
          categorias: counts[0],
          productos: counts[1],
          clientes: counts[2],
          mesas: counts[3],
          ordenes: counts[4],
        },
        clientesDemo: [customer1.name, customer2.name, customer3.name, customer4.name],
        ordenesDemo: ['ORD-701', 'ORD-702', 'ORD-703'],
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
