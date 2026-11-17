import 'dotenv/config';
import { PrismaClient, RoleCode } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const USERS = [
  {
    role: RoleCode.ADMIN,
    name: 'Administrador',
    email: 'admin@restaurante.gt',
    password: 'Admin123*',
  },
  {
    role: RoleCode.SUPERVISOR,
    name: 'Supervisor',
    email: 'supervisor@restaurante.gt',
    password: 'Supervisor123*',
  },
  {
    role: RoleCode.CASHIER,
    name: 'Cajero',
    email: 'cajero@restaurante.gt',
    password: 'Caja123*',
  },
  {
    role: RoleCode.WAITER,
    name: 'Mesero',
    email: 'mesero@restaurante.gt',
    password: 'Mesero123*',
  },
  {
    role: RoleCode.KITCHEN,
    name: 'Cocina',
    email: 'cocina@restaurante.gt',
    password: 'Cocina123*',
  },
  {
    role: RoleCode.BAR,
    name: 'Bar',
    email: 'bar@restaurante.gt',
    password: 'Bar123456*',
  },
  {
    role: RoleCode.PASTRY,
    name: 'Pastelería',
    email: 'pasteleria@restaurante.gt',
    password: 'Pastel123*',
  },
];

async function main() {
  const userCount = await prisma.user.count();
  const tenantCount = await prisma.tenant.count();

  if (userCount > 0 || tenantCount > 0) {
    throw new Error('La base ya no está vacía. Este bootstrap limpio espera una base sin datos previos.');
  }

  const tenant = await prisma.tenant.create({
    data: {
      name: 'Restaurante',
      currencyCode: 'GTQ',
      currencySymbol: 'Q',
      branches: {
        create: {
          name: 'Sucursal Principal',
          city: 'Guatemala',
          address: 'Dirección principal',
          phone: '+502 0000-0000',
        },
      },
    },
    include: {
      branches: true,
    },
  });

  const branch = tenant.branches[0];

  for (const user of USERS) {
    await prisma.user.create({
      data: {
        tenantId: tenant.id,
        branchId: branch.id,
        role: user.role,
        name: user.name,
        email: user.email,
        passwordHash: bcrypt.hashSync(user.password, 8),
        isActive: true,
      },
    });
  }

  console.log(
    JSON.stringify(
      {
        tenant: {
          id: tenant.id,
          name: tenant.name,
        },
        branch: {
          id: branch.id,
          name: branch.name,
        },
        users: USERS.map((user) => ({
          role: user.role,
          name: user.name,
          email: user.email,
          password: user.password,
        })),
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
