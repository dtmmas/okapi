import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

let databaseAvailable: boolean | null = null;
let lastDatabaseCheckAt: number | null = null;

export async function canUseDatabase() {
  if (!process.env.DATABASE_URL) {
    return false;
  }

  const now = Date.now();
  if (databaseAvailable === true) {
    return true;
  }

  if (databaseAvailable === false && lastDatabaseCheckAt !== null && now - lastDatabaseCheckAt < 5000) {
    return false;
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
    databaseAvailable = true;
    lastDatabaseCheckAt = now;
  } catch {
    databaseAvailable = false;
    lastDatabaseCheckAt = now;
  }

  return databaseAvailable;
}

export function resetDatabaseAvailability() {
  databaseAvailable = null;
  lastDatabaseCheckAt = null;
}

export async function reconnectPrismaClient() {
  resetDatabaseAvailability();
  await prisma.$disconnect();
  await prisma.$connect();
}
