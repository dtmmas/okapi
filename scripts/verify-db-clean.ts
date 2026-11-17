import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type TableNameRow = {
  TABLE_NAME: string;
};

type CountRow = {
  total: bigint | number;
};

async function main() {
  const tables = await prisma.$queryRawUnsafe<TableNameRow[]>(
    `
      SELECT TABLE_NAME
      FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_NAME
    `,
  );

  if (!tables.length) {
    throw new Error('No se encontraron tablas después de la limpieza. La estructura no quedó disponible.');
  }

  const counts: Array<{ table: string; total: number }> = [];

  for (const { TABLE_NAME } of tables) {
    const [result] = await prisma.$queryRawUnsafe<CountRow[]>(`SELECT COUNT(*) AS total FROM \`${TABLE_NAME}\``);
    counts.push({
      table: TABLE_NAME,
      total: Number(result?.total ?? 0),
    });
  }

  const nonEmptyTables = counts.filter((entry) => entry.total > 0);

  console.log(
    JSON.stringify(
      {
        tableCount: counts.length,
        empty: nonEmptyTables.length === 0,
        nonEmptyTables,
        counts,
      },
      null,
      2,
    ),
  );

  if (nonEmptyTables.length > 0) {
    throw new Error(`La limpieza no fue completa. Quedaron registros en ${nonEmptyTables.length} tabla(s).`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
