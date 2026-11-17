import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type TableNameRow = {
  TABLE_NAME: string;
};

type DatabaseRow = {
  databaseName: string | null;
};

type CreateTableRow = {
  Table: string;
  'Create Table': string;
};

async function main() {
  const backupDir = path.resolve(process.cwd(), 'backups');
  await fs.mkdir(backupDir, { recursive: true });

  const [databaseInfo] = await prisma.$queryRawUnsafe<DatabaseRow[]>('SELECT DATABASE() AS databaseName');
  const tables = await prisma.$queryRawUnsafe<TableNameRow[]>(
    `
      SELECT TABLE_NAME
      FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_NAME
    `,
  );

  const exportPayload: Record<string, unknown> = {
    createdAt: new Date().toISOString(),
    database: databaseInfo?.databaseName ?? null,
    tables: {},
  };

  for (const { TABLE_NAME } of tables) {
    const createResult = await prisma.$queryRawUnsafe<CreateTableRow[]>(`SHOW CREATE TABLE \`${TABLE_NAME}\``);
    const rows = await prisma.$queryRawUnsafe<unknown[]>(`SELECT * FROM \`${TABLE_NAME}\``);

    (exportPayload.tables as Record<string, unknown>)[TABLE_NAME] = {
      createTableSql: createResult[0]?.['Create Table'] ?? null,
      rowCount: rows.length,
      rows,
    };
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputPath = path.join(backupDir, `db-backup-${timestamp}.json`);

  await fs.writeFile(
    outputPath,
    JSON.stringify(
      exportPayload,
      (_key, value) => {
        if (typeof value === 'bigint') {
          return value.toString();
        }
        return value;
      },
      2,
    ),
    'utf8',
  );

  console.log(outputPath);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
