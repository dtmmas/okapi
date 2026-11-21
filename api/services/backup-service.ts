import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { ZipArchive } from 'archiver';
import AdmZip from 'adm-zip';
import { prisma, reconnectPrismaClient } from '../lib/prisma.js';
import { uploadsStaticDir } from '../lib/uploads.js';

export type BackupMode = 'database' | 'full';

export type BackupJobStatus = 'queued' | 'running' | 'completed' | 'failed';

export type BackupJobOperation = 'backup' | 'restore';

export type DatabaseExportMethod = 'mysqldump' | 'generated-sql';

export type BackupArchiveSource = 'system' | 'import';

export type BackupArchiveRecord = {
  id: string;
  mode: BackupMode;
  fileName: string;
  storageName: string;
  sizeBytes: number;
  createdAt: string;
  createdByUserId: number;
  databaseExportMethod?: DatabaseExportMethod;
  source: BackupArchiveSource;
};

export type BackupJob = {
  id: string;
  operation: BackupJobOperation;
  mode: BackupMode;
  status: BackupJobStatus;
  progress: number;
  message: string;
  fileName?: string;
  filePath?: string;
  error?: string;
  databaseExportMethod?: DatabaseExportMethod;
  databaseExportNote?: string;
  archiveId?: string;
  createdAt: string;
  completedAt?: string;
  requestedByUserId: number;
  loginHints?: string[];
};

type DatabaseUrlParts = {
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
};

type TableNameRow = {
  TABLE_NAME: string;
};

const jobs = new Map<string, BackupJob>();
let activeJobId: string | null = null;

const backupRoot = path.resolve(process.cwd(), 'backups', 'generated');
const backupArchiveDir = path.join(backupRoot, 'archive');
const backupArchiveIndexPath = path.join(backupArchiveDir, 'index.json');
const MAX_ARCHIVED_BACKUPS = 40;

function setJobProgress(job: BackupJob, progress: number, message: string) {
  job.progress = Math.min(100, Math.max(0, Math.round(progress)));
  job.message = message;
}

function inferBackupMode(fileName: string): BackupMode {
  return fileName.toLowerCase().endsWith('.zip') ? 'full' : 'database';
}

function formatArchiveSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function readArchiveIndex(): Promise<BackupArchiveRecord[]> {
  try {
    const raw = await fsPromises.readFile(backupArchiveIndexPath, 'utf8');
    const parsed = JSON.parse(raw) as BackupArchiveRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeArchiveIndex(records: BackupArchiveRecord[]) {
  await fsPromises.mkdir(backupArchiveDir, { recursive: true });
  await fsPromises.writeFile(backupArchiveIndexPath, JSON.stringify(records, null, 2), 'utf8');
}

async function pruneArchiveRecords(records: BackupArchiveRecord[]) {
  if (records.length <= MAX_ARCHIVED_BACKUPS) {
    return records;
  }

  const sorted = [...records].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const keep = sorted.slice(0, MAX_ARCHIVED_BACKUPS);
  const remove = sorted.slice(MAX_ARCHIVED_BACKUPS);

  for (const entry of remove) {
    const filePath = path.join(backupArchiveDir, entry.storageName);
    await fsPromises.rm(filePath, { force: true }).catch(() => undefined);
  }

  return keep;
}

export async function listBackupArchives() {
  const records = await readArchiveIndex();
  return records
    .slice()
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .map((record) => ({
      ...record,
      sizeLabel: formatArchiveSize(record.sizeBytes),
    }));
}

export function getBackupArchiveById(archiveId: string) {
  return readArchiveIndex().then((records) => records.find((record) => record.id === archiveId) ?? null);
}

export function getBackupArchiveDownloadPath(archiveId: string) {
  return getBackupArchiveById(archiveId).then((record) => {
    if (!record) {
      return null;
    }

    const filePath = path.join(backupArchiveDir, record.storageName);
    if (!fs.existsSync(filePath)) {
      return null;
    }

    return { filePath, fileName: record.fileName };
  });
}

async function registerArchiveRecord(
  input: Omit<BackupArchiveRecord, 'id' | 'createdAt' | 'sizeBytes'> & { sizeBytes?: number },
  sourcePath: string,
) {
  await fsPromises.mkdir(backupArchiveDir, { recursive: true });

  const id = randomUUID();
  const storageName = `${id}_${input.fileName}`;
  const destPath = path.join(backupArchiveDir, storageName);
  await fsPromises.copyFile(sourcePath, destPath);
  const stats = await fsPromises.stat(destPath);

  const record: BackupArchiveRecord = {
    id,
    mode: input.mode,
    fileName: input.fileName,
    storageName,
    sizeBytes: input.sizeBytes ?? stats.size,
    createdAt: new Date().toISOString(),
    createdByUserId: input.createdByUserId,
    databaseExportMethod: input.databaseExportMethod,
    source: input.source,
  };

  const records = await readArchiveIndex();
  records.push(record);
  await writeArchiveIndex(await pruneArchiveRecords(records));

  return record;
}

async function registerArchiveFromJob(job: BackupJob) {
  if (!job.filePath || !job.fileName) {
    return null;
  }

  return registerArchiveRecord(
    {
      mode: job.mode,
      fileName: job.fileName,
      storageName: '',
      createdByUserId: job.requestedByUserId,
      databaseExportMethod: job.databaseExportMethod,
      source: 'system',
    },
    job.filePath,
  );
}

export async function importBackupArchiveFile(
  sourcePath: string,
  originalFileName: string,
  requestedByUserId: number,
) {
  const safeName = path.basename(originalFileName);
  const mode = inferBackupMode(safeName);

  if (!/\.(sql|zip)$/i.test(safeName)) {
    throw new Error('Solo se permiten archivos .sql o .zip.');
  }

  return registerArchiveRecord(
    {
      mode,
      fileName: safeName,
      storageName: '',
      createdByUserId: requestedByUserId,
      source: 'import',
    },
    sourcePath,
  );
}

function resolveMysqlClientExecutable(): string | null {
  const configured = process.env.MYSQL_CLIENT_PATH?.trim() || process.env.MYSQL_PATH?.trim();
  if (configured) {
    return fs.existsSync(configured) ? configured : null;
  }

  try {
    if (process.platform === 'win32') {
      const located = execFileSync('where.exe', ['mysql'], { encoding: 'utf8', windowsHide: true }).trim();
      const first = located.split(/\r?\n/).find((line) => line.trim().length > 0);
      if (first && fs.existsSync(first.trim())) {
        return first.trim();
      }
    } else {
      const located = execFileSync('which', ['mysql'], { encoding: 'utf8' }).trim();
      if (located && fs.existsSync(located)) {
        return located;
      }
    }
  } catch {
    // not on PATH
  }

  const mysqldump = resolveMysqldumpExecutable();
  if (mysqldump && fs.existsSync(mysqldump)) {
    const mysqlPath = mysqldump.replace(/mysqldump(\.exe)?$/i, 'mysql$1');
    if (fs.existsSync(mysqlPath)) {
      return mysqlPath;
    }
  }

  const programFiles = process.env.ProgramFiles ?? 'C:\\Program Files';
  const programFilesX86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)';
  const windowsCandidates = [
    path.join(programFiles, 'MySQL', 'MySQL Server 8.4', 'bin', 'mysql.exe'),
    path.join(programFiles, 'MySQL', 'MySQL Server 8.0', 'bin', 'mysql.exe'),
    path.join(programFiles, 'MySQL', 'MySQL Server 5.7', 'bin', 'mysql.exe'),
    path.join(programFilesX86, 'MySQL', 'MySQL Server 8.0', 'bin', 'mysql.exe'),
    'C:\\xampp\\mysql\\bin\\mysql.exe',
    'C:\\laragon\\bin\\mysql\\mysql-8.4.3-winx64\\bin\\mysql.exe',
    'C:\\laragon\\bin\\mysql\\mysql-8.0.30-winx64\\bin\\mysql.exe',
  ];

  for (const candidate of windowsCandidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function normalizeSqlStatement(statement: string): string {
  let rest = statement.trim();

  for (;;) {
    if (rest.startsWith('--') || rest.startsWith('#')) {
      const newline = rest.indexOf('\n');
      if (newline === -1) {
        return '';
      }
      rest = rest.slice(newline + 1).trim();
      continue;
    }

    if (rest.startsWith('/*')) {
      const end = rest.indexOf('*/');
      if (end === -1) {
        return '';
      }
      rest = rest.slice(end + 2).trim();
      continue;
    }

    return rest;
  }
}

function readCreateTableSql(row: Record<string, unknown> | undefined): string | null {
  if (!row) {
    return null;
  }

  for (const value of Object.values(row)) {
    if (typeof value === 'string' && /^\s*CREATE\s+TABLE\b/i.test(value)) {
      return value;
    }
  }

  return null;
}

function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  let escape = false;

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];

    if (escape) {
      current += char;
      escape = false;
      continue;
    }

    if (char === '\\') {
      current += char;
      escape = true;
      continue;
    }

    if (char === "'" && !inDouble && !inBacktick) {
      inSingle = !inSingle;
      current += char;
      continue;
    }

    if (char === '"' && !inSingle && !inBacktick) {
      inDouble = !inDouble;
      current += char;
      continue;
    }

    if (char === '`' && !inSingle && !inDouble) {
      inBacktick = !inBacktick;
      current += char;
      continue;
    }

    if (char === ';' && !inSingle && !inDouble && !inBacktick) {
      const statement = current.trim();
      if (statement && !/^DELIMITER\b/i.test(statement) && !statement.startsWith('--')) {
        statements.push(statement);
      }
      current = '';
      continue;
    }

    current += char;
  }

  const tail = current.trim();
  if (tail && !/^DELIMITER\b/i.test(tail) && !tail.startsWith('--')) {
    statements.push(tail);
  }

  return statements.filter((statement) => statement.length > 0);
}

async function prepareDatabaseForRestore(onProgress: (message: string) => void) {
  onProgress('Vaciando tablas actuales antes de restaurar...');
  await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');

  const tables = await prisma.$queryRawUnsafe<TableNameRow[]>(
    `
      SELECT TABLE_NAME
      FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_NAME
    `,
  );

  for (const { TABLE_NAME } of tables) {
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS \`${TABLE_NAME}\``);
  }

  await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
}

async function importSqlFileWithPrisma(sqlPath: string, onProgress: (message: string) => void): Promise<void> {
  await prepareDatabaseForRestore(onProgress);

  const sql = await fsPromises.readFile(sqlPath, 'utf8');
  const statements = splitSqlStatements(sql).map(normalizeSqlStatement).filter((statement) => statement.length > 0);
  const hasCreateTable = statements.some((statement) => /^CREATE\s+TABLE\b/i.test(statement));
  const executableStatements = hasCreateTable
    ? statements
    : statements.filter((statement) => !/^DROP\s+TABLE\b/i.test(statement));
  const total = executableStatements.length || 1;

  if (!hasCreateTable) {
    onProgress('El respaldo no trae CREATE TABLE. Recreando las tablas de esta versión...');
    await runPrismaDbPush(onProgress);
    await reconnectPrismaClient();
  }

  onProgress('Aplicando sentencias del respaldo...');
  await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');

  for (let index = 0; index < executableStatements.length; index += 1) {
    const statement = executableStatements[index];
    onProgress(`Ejecutando SQL (${index + 1}/${total})...`);

    try {
      await prisma.$executeRawUnsafe(statement);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al ejecutar SQL.';
      const preview = statement.replace(/\s+/g, ' ').slice(0, 140);
      throw new Error(`${message} (sentencia ${index + 1}/${total}: ${preview}).`);
    }
  }

  await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
}

async function runMysqlCliImport(executable: string, sqlPath: string, parts: DatabaseUrlParts): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const args = ['-h', parts.host, '-P', parts.port, '-u', parts.user, parts.database];
    const child = spawn(executable, args, {
      env: {
        ...process.env,
        MYSQL_PWD: parts.password,
      },
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    const input = createReadStream(sqlPath);
    input.on('error', reject);
    child.on('error', reject);
    input.pipe(child.stdin);

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(stderr.trim() || `mysql salió con código ${code ?? 'desconocido'}.`));
    });
  });
}

async function assertSqlBackupLooksValid(sqlPath: string): Promise<void> {
  const handle = await fsPromises.open(sqlPath, 'r');
  try {
    const buffer = Buffer.alloc(4 * 1024 * 1024);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const sample = buffer.subarray(0, bytesRead).toString('utf8');
    if (!/`User`|INSERT INTO `User`|CREATE TABLE `User`|CREATE TABLE User/i.test(sample)) {
      throw new Error(
        'El archivo SQL no contiene la tabla User. No se vació la base para evitar quedarte sin acceso.',
      );
    }
  } finally {
    await handle.close();
  }
}

async function runPrismaDbPush(onProgress: (message: string) => void): Promise<void> {
  onProgress('Alineando esquema de la base con esta versión de la app...');
  await new Promise<void>((resolve, reject) => {
    const child = spawn('npx', ['prisma', 'db', 'push', '--skip-generate'], {
      cwd: process.cwd(),
      env: process.env,
      windowsHide: true,
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';
    let stdout = '';
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr.trim() || stdout.trim() || `prisma db push salió con código ${code ?? 'desconocido'}.`));
    });
  });
}

async function collectLoginHints(): Promise<string[]> {
  const admins = await prisma.user.findMany({
    where: { isActive: true, role: 'ADMIN' },
    select: { email: true },
    orderBy: { id: 'asc' },
    take: 3,
  });
  if (admins.length) {
    return admins.map((item) => item.email);
  }

  const fallback = await prisma.user.findMany({
    where: { isActive: true },
    select: { email: true },
    orderBy: { id: 'asc' },
    take: 3,
  });
  return fallback.map((item) => item.email);
}

async function finalizeRestoredDatabase(onProgress: (message: string) => void): Promise<string[]> {
  await applyPostRestoreSchemaPatches(onProgress);
  await reconnectPrismaClient();
  try {
    await runPrismaDbPush(onProgress);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    onProgress(`No se pudo ejecutar prisma db push (${message}). Se aplicaron parches SQL manuales.`);
  }
  await reconnectPrismaClient();

  const userCount = await prisma.user.count();
  if (userCount === 0) {
    throw new Error(
      'La restauración terminó sin usuarios. El respaldo puede estar dañado. Restaura otro archivo o, en local, ejecuta scripts/bootstrap-clean-access.ts.',
    );
  }

  return collectLoginHints();
}

async function runMysqlImport(sqlPath: string, onProgress: (message: string) => void): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL no está configurada.');
  }

  await assertSqlBackupLooksValid(sqlPath);

  const parts = parseDatabaseUrl(databaseUrl);
  if (!parts) {
    throw new Error('No fue posible interpretar DATABASE_URL.');
  }

  const executable = resolveMysqlClientExecutable();
  if (executable) {
    onProgress(`Restaurando base de datos con ${path.basename(executable)}...`);
    try {
      await prepareDatabaseForRestore(onProgress);
      await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await runMysqlCliImport(executable, sqlPath, parts);
      await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
      return;
    } catch (error) {
      const spawnError = error as NodeJS.ErrnoException;
      if (spawnError?.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  await importSqlFileWithPrisma(sqlPath, onProgress);
}

async function findSqlFileInDirectory(directory: string): Promise<string | null> {
  const entries = await fsPromises.readdir(directory, { withFileTypes: true });
  const sqlFiles = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.sql'))
    .map((entry) => entry.name)
    .sort((left, right) => {
      const leftScore = left.startsWith('okapi-backup-db') || left.startsWith('database-') ? 0 : 1;
      const rightScore = right.startsWith('okapi-backup-db') || right.startsWith('database-') ? 0 : 1;
      if (leftScore !== rightScore) {
        return leftScore - rightScore;
      }
      return left.localeCompare(right);
    });

  if (!sqlFiles.length) {
    return null;
  }

  return path.join(directory, sqlFiles[0]);
}

async function restoreUploadsFromDirectory(directory: string) {
  const uploadsDir = path.join(directory, 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    return;
  }

  await fsPromises.mkdir(uploadsStaticDir, { recursive: true });
  await fsPromises.cp(uploadsDir, uploadsStaticDir, { recursive: true, force: true });
}

function isIgnorableSchemaPatchError(message: string) {
  return /duplicate column|duplicate key name|already exists|1060|1061|1050|1826/i.test(message);
}

async function applyPostRestoreSchemaPatches(onProgress: (message: string) => void) {
  const scriptNames = [
    'table-sort-order.sql',
    'table-areas.sql',
    'table-reservation-observations.sql',
    'table-reservation-phone.sql',
  ];

  for (const scriptName of scriptNames) {
    const filePath = path.join(process.cwd(), 'scripts', scriptName);
    if (!fs.existsSync(filePath)) {
      continue;
    }

    onProgress(`Ajustando esquema post-restauración: ${scriptName}...`);
    const sql = await fsPromises.readFile(filePath, 'utf8');
    const statements = splitSqlStatements(sql);

    for (const statement of statements) {
      try {
        await prisma.$executeRawUnsafe(statement);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (isIgnorableSchemaPatchError(message)) {
          continue;
        }
        throw new Error(`No fue posible aplicar ${scriptName}: ${message}`);
      }
    }
  }
}

async function runRestoreJob(job: BackupJob, archive: BackupArchiveRecord) {
  const workDir = path.join(backupRoot, job.id);
  await fsPromises.mkdir(workDir, { recursive: true });

  const archivePath = path.join(backupArchiveDir, archive.storageName);

  try {
    job.status = 'running';
    setJobProgress(job, 5, 'Preparando restauración...');

    let sqlPath: string | null = null;
    let extractDir: string | null = null;

    if (archive.mode === 'full') {
      setJobProgress(job, 15, 'Descomprimiendo respaldo completo...');
      extractDir = path.join(workDir, 'extracted');
      await fsPromises.mkdir(extractDir, { recursive: true });

      const zip = new AdmZip(archivePath);
      zip.extractAllTo(extractDir, true);

      sqlPath = await findSqlFileInDirectory(extractDir);
      if (!sqlPath) {
        throw new Error('No se encontró un archivo .sql dentro del respaldo.');
      }

      setJobProgress(job, 35, 'Restaurando base de datos...');
      await runMysqlImport(sqlPath, (message) => setJobProgress(job, 55, message));

      setJobProgress(job, 75, 'Restaurando imágenes del menú...');
      await restoreUploadsFromDirectory(extractDir);
      setJobProgress(job, 92, 'Archivos del menú restaurados.');
    } else {
      sqlPath = archivePath;
      setJobProgress(job, 25, 'Restaurando base de datos...');
      await runMysqlImport(sqlPath, (message) => setJobProgress(job, 65, message));
    }

    setJobProgress(job, 92, 'Finalizando restauración (esquema y verificación)...');
    job.loginHints = await finalizeRestoredDatabase((message) => setJobProgress(job, 95, message));

    setJobProgress(job, 100, 'Restauración completada. Vuelve a iniciar sesión.');
    job.status = 'completed';
    job.completedAt = new Date().toISOString();
  } catch (error) {
    job.status = 'failed';
    job.error = error instanceof Error ? error.message : 'No fue posible restaurar el respaldo.';
    setJobProgress(job, job.progress, job.error);
    await fsPromises.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  } finally {
    activeJobId = null;
  }
}

function resolveMysqldumpExecutable(): string | null {
  const configured = process.env.MYSQLDUMP_PATH?.trim();
  if (configured) {
    if (fs.existsSync(configured)) {
      return configured;
    }
    return configured;
  }

  try {
    if (process.platform === 'win32') {
      const located = execFileSync('where.exe', ['mysqldump'], { encoding: 'utf8', windowsHide: true }).trim();
      const first = located.split(/\r?\n/).find((line) => line.trim().length > 0);
      if (first && fs.existsSync(first.trim())) {
        return first.trim();
      }
    } else {
      const located = execFileSync('which', ['mysqldump'], { encoding: 'utf8' }).trim();
      if (located) {
        return located;
      }
    }
  } catch {
    // not on PATH
  }

  const programFiles = process.env.ProgramFiles ?? 'C:\\Program Files';
  const programFilesX86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)';
  const windowsCandidates = [
    path.join(programFiles, 'MySQL', 'MySQL Server 8.4', 'bin', 'mysqldump.exe'),
    path.join(programFiles, 'MySQL', 'MySQL Server 8.0', 'bin', 'mysqldump.exe'),
    path.join(programFiles, 'MySQL', 'MySQL Server 5.7', 'bin', 'mysqldump.exe'),
    path.join(programFilesX86, 'MySQL', 'MySQL Server 8.0', 'bin', 'mysqldump.exe'),
    'C:\\xampp\\mysql\\bin\\mysqldump.exe',
    'C:\\laragon\\bin\\mysql\\mysql-8.4.3-winx64\\bin\\mysqldump.exe',
    'C:\\laragon\\bin\\mysql\\mysql-8.0.30-winx64\\bin\\mysqldump.exe',
  ];

  for (const candidate of windowsCandidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return process.platform === 'win32' ? 'mysqldump.exe' : 'mysqldump';
}

function formatSqlValue(value: unknown): string {
  if (value === null || value === undefined) {
    return 'NULL';
  }

  if (typeof value === 'boolean') {
    return value ? '1' : '0';
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : 'NULL';
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (value instanceof Date) {
    return `'${value.toISOString().slice(0, 23).replace('T', ' ')}'`;
  }

  if (Buffer.isBuffer(value)) {
    return `X'${value.toString('hex')}'`;
  }

  if (typeof value === 'object') {
    const decimalText = typeof (value as { toString?: () => string }).toString === 'function'
      ? (value as { toString: () => string }).toString()
      : '';
    if (/^-?\d+(\.\d+)?$/.test(decimalText)) {
      return decimalText;
    }

    return `'${JSON.stringify(value).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
  }

  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "''").replace(/\u0000/g, '')}'`;
}

function parseDatabaseUrl(databaseUrl: string): DatabaseUrlParts | null {
  try {
    const parsed = new URL(databaseUrl);
    const database = parsed.pathname.replace(/^\//, '');
    if (!database) {
      return null;
    }

    return {
      host: parsed.hostname || '127.0.0.1',
      port: parsed.port || '3306',
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      database,
    };
  } catch {
    return null;
  }
}

async function runMysqldump(outputPath: string, onProgress: (message: string) => void): Promise<boolean> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return false;
  }

  const parts = parseDatabaseUrl(databaseUrl);
  if (!parts) {
    return false;
  }

  const executable = resolveMysqldumpExecutable();
  if (!executable) {
    throw new Error('No se encontró mysqldump en el servidor.');
  }

  onProgress(`Generando volcado SQL con ${path.basename(executable)}...`);

  await new Promise<void>((resolve, reject) => {
    const args = [
      '-h',
      parts.host,
      '-P',
      parts.port,
      '-u',
      parts.user,
      '--single-transaction',
      '--routines',
      '--triggers',
      '--set-gtid-purged=OFF',
      parts.database,
    ];

    const output = createWriteStream(outputPath);
    const child = spawn(executable, args, {
      env: {
        ...process.env,
        MYSQL_PWD: parts.password,
      },
      windowsHide: true,
    });

    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.stdout.pipe(output);

    const fail = (error: Error) => {
      output.destroy();
      reject(error);
    };

    child.on('error', fail);
    output.on('error', fail);

    child.on('close', (code) => {
      output.end(() => {
        if (code === 0) {
          resolve();
          return;
        }

        reject(new Error(stderr.trim() || `mysqldump salió con código ${code ?? 'desconocido'}.`));
      });
    });
  });

  return true;
}

async function exportDatabaseSql(
  outputPath: string,
  onTableProgress: (current: number, total: number) => void,
): Promise<void> {
  const tables = await prisma.$queryRawUnsafe<TableNameRow[]>(
    `
      SELECT TABLE_NAME
      FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_NAME
    `,
  );

  const header = [
    '-- Okapi SQL backup (generado sin mysqldump)',
    `-- Fecha: ${new Date().toISOString()}`,
    'SET NAMES utf8mb4;',
    'SET FOREIGN_KEY_CHECKS=0;',
    '',
  ].join('\n');

  await fsPromises.writeFile(outputPath, header, 'utf8');

  const total = tables.length || 1;
  let index = 0;

  for (const { TABLE_NAME } of tables) {
    index += 1;
    onTableProgress(index, total);

    const createResult = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(`SHOW CREATE TABLE \`${TABLE_NAME}\``);
    const createSql = readCreateTableSql(createResult[0]);
    if (!createSql) {
      throw new Error(`No fue posible leer la estructura de la tabla ${TABLE_NAME}.`);
    }
    const rows = (await prisma.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT * FROM \`${TABLE_NAME}\``)) ?? [];

    const chunks: string[] = ['', `-- Tabla: ${TABLE_NAME}`, `DROP TABLE IF EXISTS \`${TABLE_NAME}\`;`];
    if (createSql) {
      chunks.push(`${createSql};`);
    }

    if (rows.length) {
      const columns = Object.keys(rows[0]);
      const columnList = columns.map((column) => `\`${column}\``).join(', ');
      const batchSize = 80;

      for (let offset = 0; offset < rows.length; offset += batchSize) {
        const slice = rows.slice(offset, offset + batchSize);
        const values = slice
          .map((row) => `(${columns.map((column) => formatSqlValue(row[column])).join(', ')})`)
          .join(',\n  ');
        chunks.push(`INSERT INTO \`${TABLE_NAME}\` (${columnList}) VALUES\n  ${values};`);
      }
    }

    await fsPromises.appendFile(outputPath, `${chunks.join('\n')}\n`, 'utf8');
  }

  await fsPromises.appendFile(outputPath, '\nSET FOREIGN_KEY_CHECKS=1;\n', 'utf8');
}

async function createDatabaseArtifact(
  workDir: string,
  timestamp: string,
  onProgress: (progress: number, message: string) => void,
): Promise<{ filePath: string; fileName: string; method: DatabaseExportMethod; note?: string }> {
  const sqlPath = path.join(workDir, `database-${timestamp}.sql`);

  onProgress(8, 'Preparando respaldo de base de datos...');

  try {
    onProgress(12, 'Intentando volcado SQL con mysqldump...');
    await runMysqldump(sqlPath, (message) => onProgress(20, message));
    const stats = await fsPromises.stat(sqlPath);
    if (stats.size > 0) {
      onProgress(55, 'Volcado SQL listo.');
      return { filePath: sqlPath, fileName: path.basename(sqlPath), method: 'mysqldump' };
    }
  } catch (error) {
    await fsPromises.rm(sqlPath, { force: true });
    const reason = error instanceof Error ? error.message : 'mysqldump no disponible';

    onProgress(18, 'mysqldump no disponible; generando archivo .sql desde las tablas...');
    await exportDatabaseSql(sqlPath, (current, total) => {
      const span = 40;
      const base = 20;
      onProgress(base + (current / total) * span, `Exportando tablas a SQL (${current}/${total})...`);
    });

    onProgress(62, 'Archivo SQL generado.');
    return {
      filePath: sqlPath,
      fileName: path.basename(sqlPath),
      method: 'generated-sql',
      note: `${reason} Se generó un .sql compatible; para respaldos oficiales instala el cliente MySQL o define MYSQLDUMP_PATH en el servidor.`,
    };
  }

  throw new Error('No fue posible generar el respaldo de base de datos.');
}

function collectFiles(dir: string, files: string[] = []): string[] {
  if (!fs.existsSync(dir)) {
    return files;
  }

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(entryPath, files);
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }

  return files;
}

async function zipFullBackup(
  zipPath: string,
  databasePath: string,
  onProgress: (progress: number, message: string) => void,
): Promise<void> {
  const uploadFiles = collectFiles(uploadsStaticDir);
  const totalSteps = uploadFiles.length + 2;
  let completedSteps = 1;

  onProgress(65, 'Empaquetando base de datos y archivos del menú...');

  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(zipPath);
    const archive = new ZipArchive({ zlib: { level: 9 } });

    output.on('close', () => resolve());
    output.on('error', reject);
    archive.on('error', reject);

    archive.on('progress', (event) => {
      const entries = event.entries;
      if (!entries?.total) {
        return;
      }
      const ratio = entries.processed / entries.total;
      onProgress(65 + ratio * 30, `Comprimiendo archivos (${entries.processed}/${entries.total})...`);
    });

    archive.pipe(output);
    archive.file(databasePath, { name: path.basename(databasePath) });

    const manifest = {
      createdAt: new Date().toISOString(),
      kind: 'okapi-full-backup-v1',
      includesDatabase: true,
      includesUploads: fs.existsSync(uploadsStaticDir),
      uploadsRoot: 'uploads',
    };
    archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });

    if (fs.existsSync(uploadsStaticDir)) {
      archive.directory(uploadsStaticDir, 'uploads');
    }

    archive.on('entry', () => {
      completedSteps += 1;
      const progress = 65 + (completedSteps / Math.max(totalSteps, 1)) * 28;
      onProgress(progress, 'Agregando imágenes de platillos, bebidas y catálogo...');
    });

    void archive.finalize();
  });

  onProgress(96, 'Archivo ZIP generado.');
}

async function runBackupJob(job: BackupJob) {
  const workDir = path.join(backupRoot, job.id);
  await fsPromises.mkdir(workDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  try {
    job.status = 'running';
    setJobProgress(job, 2, 'Iniciando respaldo...');

    const databaseArtifact = await createDatabaseArtifact(workDir, timestamp, (progress, message) => {
      setJobProgress(job, progress, message);
    });
    job.databaseExportMethod = databaseArtifact.method;
    job.databaseExportNote = databaseArtifact.note;

    if (job.mode === 'database') {
      const finalPath = path.join(workDir, `okapi-backup-db-${timestamp}${path.extname(databaseArtifact.fileName)}`);
      await fsPromises.rename(databaseArtifact.filePath, finalPath);
      job.filePath = finalPath;
      job.fileName = path.basename(finalPath);
      const archived = await registerArchiveFromJob(job);
      job.archiveId = archived?.id;
      setJobProgress(job, 100, 'Respaldo de base de datos listo para descargar.');
      job.status = 'completed';
      job.completedAt = new Date().toISOString();
      return;
    }

    const zipName = `okapi-backup-full-${timestamp}.zip`;
    const zipPath = path.join(workDir, zipName);
    await zipFullBackup(zipPath, databaseArtifact.filePath, (progress, message) => {
      setJobProgress(job, progress, message);
    });

    job.filePath = zipPath;
    job.fileName = zipName;
    const archived = await registerArchiveFromJob(job);
    job.archiveId = archived?.id;
    setJobProgress(job, 100, 'Respaldo completo listo para descargar.');
    job.status = 'completed';
    job.completedAt = new Date().toISOString();
  } catch (error) {
    job.status = 'failed';
    job.error = error instanceof Error ? error.message : 'No fue posible generar el respaldo.';
    setJobProgress(job, job.progress, job.error);
    await fsPromises.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  } finally {
    activeJobId = null;
  }
}

export function startBackupJob(mode: BackupMode, requestedByUserId: number) {
  if (activeJobId) {
    throw new Error('Ya hay un respaldo en ejecución. Espera a que termine.');
  }

  const job: BackupJob = {
    id: randomUUID(),
    operation: 'backup',
    mode,
    status: 'queued',
    progress: 0,
    message: 'En cola...',
    createdAt: new Date().toISOString(),
    requestedByUserId,
  };

  jobs.set(job.id, job);
  activeJobId = job.id;

  void runBackupJob(job);

  return job;
}

export function getBackupJob(jobId: string, requestedByUserId: number) {
  const job = jobs.get(jobId);
  if (!job || job.requestedByUserId !== requestedByUserId) {
    return null;
  }

  return job;
}

export async function startRestoreJob(archiveId: string, requestedByUserId: number) {
  if (activeJobId) {
    throw new Error('Ya hay una tarea de respaldo o restauración en ejecución.');
  }

  const archive = await getBackupArchiveById(archiveId);
  if (!archive) {
    throw new Error('Respaldo no encontrado en el historial.');
  }

  const filePath = path.join(backupArchiveDir, archive.storageName);
  if (!fs.existsSync(filePath)) {
    throw new Error('El archivo de respaldo ya no está disponible en el servidor.');
  }

  const job: BackupJob = {
    id: randomUUID(),
    operation: 'restore',
    mode: archive.mode,
    status: 'queued',
    progress: 0,
    message: 'Restauración en cola...',
    archiveId: archive.id,
    fileName: archive.fileName,
    createdAt: new Date().toISOString(),
    requestedByUserId,
  };

  jobs.set(job.id, job);
  activeJobId = job.id;

  void runRestoreJob(job, archive);

  return job;
}

export function getBackupDownloadPath(jobId: string, requestedByUserId: number) {
  const job = getBackupJob(jobId, requestedByUserId);
  if (!job || job.status !== 'completed' || !job.filePath || !job.fileName) {
    return null;
  }

  if (!fs.existsSync(job.filePath)) {
    return null;
  }

  return {
    filePath: job.filePath,
    fileName: job.fileName,
  };
}