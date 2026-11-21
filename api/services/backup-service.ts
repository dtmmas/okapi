import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { ZipArchive } from 'archiver';
import { prisma } from '../lib/prisma.js';
import { uploadsStaticDir } from '../lib/uploads.js';

export type BackupMode = 'database' | 'full';

export type BackupJobStatus = 'queued' | 'running' | 'completed' | 'failed';

export type DatabaseExportMethod = 'mysqldump' | 'generated-sql';

export type BackupJob = {
  id: string;
  mode: BackupMode;
  status: BackupJobStatus;
  progress: number;
  message: string;
  fileName?: string;
  filePath?: string;
  error?: string;
  databaseExportMethod?: DatabaseExportMethod;
  databaseExportNote?: string;
  createdAt: string;
  completedAt?: string;
  requestedByUserId: number;
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

type CreateTableRow = {
  Table: string;
  'Create Table': string;
};

const jobs = new Map<string, BackupJob>();
let activeJobId: string | null = null;

const backupRoot = path.resolve(process.cwd(), 'backups', 'generated');

function setJobProgress(job: BackupJob, progress: number, message: string) {
  job.progress = Math.min(100, Math.max(0, Math.round(progress)));
  job.message = message;
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

    const createResult = await prisma.$queryRawUnsafe<CreateTableRow[]>(`SHOW CREATE TABLE \`${TABLE_NAME}\``);
    const createSql = createResult[0]?.['Create Table'];
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