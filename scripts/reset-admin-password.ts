import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = (process.argv[2] ?? '').trim().toLowerCase();
  const password = process.argv[3] ?? '';

  if (!email || password.length < 8) {
    throw new Error('Uso: npx tsx scripts/reset-admin-password.ts <email> <password-min-8>');
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new Error(`No existe el usuario ${email}.`);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: bcrypt.hashSync(password, 10),
      isActive: true,
    },
  });

  console.log(`Contrasena actualizada para ${email} (id ${user.id}, rol ${user.role}).`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });