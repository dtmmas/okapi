import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = 'admin@restaurante.gt';
  const password = 'Admin123*';
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.log('NO_USER');
    return;
  }
  console.log(JSON.stringify({ ok: bcrypt.compareSync(password, user.passwordHash), email: user.email, isActive: user.isActive }));
}

void main().finally(() => prisma.$disconnect());