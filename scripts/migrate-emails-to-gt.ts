import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type MigrationPlanRow = {
  id: number;
  tenantId: number;
  name: string;
  fromEmail: string;
  toEmail: string;
};

function readFlag(name: string) {
  return process.argv.includes(name);
}

function readArgValue(name: string) {
  const raw = process.argv.find((item) => item === name || item.startsWith(`${name}=`));
  if (!raw) {
    return null;
  }
  if (raw.includes('=')) {
    return raw.split('=').slice(1).join('=') || null;
  }
  const index = process.argv.indexOf(raw);
  return process.argv[index + 1] ?? null;
}

function buildTargetEmail(sourceEmail: string, fromDomain: string, toDomain: string) {
  const trimmed = sourceEmail.trim().toLowerCase();
  const suffix = `@${fromDomain.toLowerCase()}`;
  if (!trimmed.endsWith(suffix)) {
    return null;
  }
  const localPart = trimmed.slice(0, -suffix.length);
  if (!localPart) {
    return null;
  }
  return `${localPart}@${toDomain.toLowerCase()}`;
}

async function main() {
  const fromDomain = readArgValue('--from') ?? 'restaurante.pe';
  const toDomain = readArgValue('--to') ?? 'restaurante.gt';
  const apply = readFlag('--apply');
  const tenantIdValue = readArgValue('--tenant');
  const tenantId = tenantIdValue ? Number(tenantIdValue) : null;
  const dryRun = !apply;

  if (tenantIdValue && (!Number.isFinite(tenantId) || tenantId <= 0)) {
    throw new Error('El parámetro --tenant debe ser un número válido.');
  }

  const where = {
    email: { endsWith: `@${fromDomain}` },
    ...(tenantId ? { tenantId } : {}),
  };

  const users = await prisma.user.findMany({
    where,
    select: { id: true, tenantId: true, name: true, email: true },
    orderBy: { id: 'asc' },
  });

  const plan: MigrationPlanRow[] = users
    .map((user) => {
      const target = buildTargetEmail(user.email, fromDomain, toDomain);
      if (!target) {
        return null;
      }
      return { id: user.id, tenantId: user.tenantId, name: user.name, fromEmail: user.email, toEmail: target };
    })
    .filter((row): row is MigrationPlanRow => Boolean(row));

  if (!plan.length) {
    console.log(`No se encontraron usuarios con dominio @${fromDomain} para migrar.`);
    return;
  }

  const collisions: Array<MigrationPlanRow & { collisionUserId: number }> = [];
  for (const row of plan) {
    const existing = await prisma.user.findUnique({ where: { email: row.toEmail }, select: { id: true } });
    if (existing && existing.id !== row.id) {
      collisions.push({ ...row, collisionUserId: existing.id });
    }
  }

  console.log(`Plan de migración (${dryRun ? 'DRY RUN' : 'APLICAR'}): ${plan.length} usuarios`);
  for (const row of plan) {
    console.log(`[${row.id}] ${row.fromEmail} -> ${row.toEmail}`);
  }

  if (collisions.length) {
    console.log('\nConflictos detectados (emails destino ya existen):');
    for (const collision of collisions) {
      console.log(`[${collision.id}] ${collision.fromEmail} -> ${collision.toEmail} (ya existe en userId=${collision.collisionUserId})`);
    }
    if (apply) {
      throw new Error('Abortado: existen conflictos de emails. Resuélvelos antes de aplicar.');
    }
  }

  if (dryRun) {
    console.log('\nPara aplicar:');
    console.log('  npx tsx scripts/migrate-emails-to-gt.ts --apply');
    console.log('Opcional: filtrar por tenant:');
    console.log('  npx tsx scripts/migrate-emails-to-gt.ts --apply --tenant 1');
    return;
  }

  const runnable = collisions.length ? plan.filter((row) => !collisions.some((c) => c.id === row.id)) : plan;

  await prisma.$transaction(async (tx) => {
    for (const row of runnable) {
      await tx.user.update({ where: { id: row.id }, data: { email: row.toEmail } });
    }
  });

  console.log(`\nMigración aplicada: ${runnable.length} usuarios actualizados.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

