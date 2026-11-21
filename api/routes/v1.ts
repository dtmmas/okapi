import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import multer from 'multer';
import { Router } from 'express';
import { z } from 'zod';
import { layouts } from '../lib/station-groups.js';
import { requireAuth, requirePermissions, type ApiRequest } from '../lib/auth.js';
import { buildMenuUploadUrl, menuUploadsDir } from '../lib/uploads.js';
import {
  adjustInventoryStockForUser,
  createCashMovementForUser,
  createBranchForUser,
  createCategoryForUser,
  createCustomerForUser,
  createInventoryItemForUser,
  createPurchaseReceiptForUser,
  createUser,
  suggestUserEmail,
  createWasteRecordForUser,
  createProductForUser,
  createOrderForUser,
  createTableForUser,
  deleteCategoryForUser,
  deleteBranchForUser,
  deleteCustomerForUser,
  deleteProductForUser,
  deleteTableForUser,
  getBrandForUser,
  getBootstrapSnapshot,
  getDashboardSummary,
  getMenu,
  getProductRecipeForUser,
  getSubRecipeFormulaForUser,
  getPublicBrand,
  getRolesConfiguration,
  getReportsSummary,
  listBranches,
  listBarOrders,
  listCashMovements,
  listCashShiftsForControl,
  listCustomers,
  listUsers,
  listDeliveryOrders,
  listInventoryItems,
  listInventoryMovementsForUser,
  listKitchenOrders,
  listOrders,
  openCashShift,
  closeCashShift,
  closeCashShiftForControl,
  payOrderForUser,
  listPastryOrders,
  listTables,
  reorderTablesForUser,
  createTableAreaForUser,
  deleteTableAreaForUser,
  renameTableAreaForUser,
  reorderTableAreasForUser,
  updateCategoryForUser,
  updateCustomerForUser,
  updateInventoryItemForUser,
  updateProductForUser,
  updateTableStatusForUser,
  updateTableForUser,
  moveOpenOrderToTable,
  mergeOpenOrdersToTable,
  updateStationOrderStatus,
  updateStationOrderItemStatus,
  updateBrandForUser,
  updateBranchForUser,
  updateRoleProfileForUser,
  updateUser,
  updateUserPassword,
  saveProductRecipeForUser,
  saveSubRecipeFormulaForUser,
  produceSubRecipeForUser,
  requestOrderBillForUser,
} from '../services/restaurant-service.js';
import { getBackupDownloadPath, getBackupJob, startBackupJob } from '../services/backup-service.js';

const router = Router();
const roleCodeValues = ['ADMIN', 'SUPERVISOR', 'CASHIER', 'WAITER', 'KITCHEN', 'BAR', 'PASTRY', 'DELIVERY', 'KIOSK'] as const;
const permissionCodeValues = [
  'DASHBOARD_VIEW',
  'POS_USE',
  'TABLES_MANAGE',
  'KITCHEN_UPDATE',
  'CASH_MANAGE',
  'INVENTORY_MANAGE',
  'CUSTOMERS_MANAGE',
  'DELIVERY_MANAGE',
  'REPORTS_VIEW',
  'SETTINGS_MANAGE',
] as const;
const allowedImageMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function parseDataImageUrl(value: string) {
  const match = value.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    return null;
  }

  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], 'base64'),
  };
}

const menuImageUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => {
      fs.mkdirSync(menuUploadsDir, { recursive: true });
      callback(null, menuUploadsDir);
    },
    filename: (_req, file, callback) => {
      const extension = path.extname(file.originalname).toLowerCase() || '.jpg';
      callback(null, `${Date.now()}-${randomUUID()}${extension}`);
    },
  }),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (_req, file, callback) => {
    if (!allowedImageMimeTypes.has(file.mimetype)) {
      callback(new Error('Solo se permiten imágenes JPG, PNG, WEBP o GIF.'));
      return;
    }

    callback(null, true);
  },
});

router.get('/public/brand', async (_req, res) => {
  res.json({ success: true, data: await getPublicBrand() });
});

router.get('/public/favicon', async (_req, res) => {
  const brand = await getPublicBrand();
  const parsed = brand.logoData ? parseDataImageUrl(brand.logoData) : null;

  if (parsed) {
    res.setHeader('Content-Type', parsed.mimeType);
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.send(parsed.buffer);
    return;
  }

  return res.redirect('/favicon.svg');
});

router.post('/uploads/menu-image', requireAuth, requirePermissions(['INVENTORY_MANAGE']), (req: ApiRequest, res) => {
  menuImageUpload.single('image')(req, res, (error: unknown) => {
    if (error) {
      const message =
        error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE'
          ? 'La imagen excede el límite de 5 MB.'
          : error instanceof Error
            ? error.message
            : 'No fue posible subir la imagen.';

      res.status(400).json({ success: false, message });
      return;
    }

    if (!req.file) {
      res.status(400).json({ success: false, message: 'Debes seleccionar una imagen.' });
      return;
    }

    res.status(201).json({
      success: true,
      data: {
        url: buildMenuUploadUrl(req.file.filename),
        fileName: req.file.filename,
      },
    });
  });
});

router.get('/bootstrap', requireAuth, async (req: ApiRequest, res) => {
  try {
    const snapshot = await getBootstrapSnapshot(req.authUser);
    if (req.authUser.permissions.includes('KIOSK_ONLY')) {
      const { brand, menuCategories, menuProducts } = snapshot;
      const tables = snapshot.tables.filter(t => t.branchId === req.authUser.branchId)
        .map(({ id, code, area, capacity, status }) => ({ id, code, area, capacity, status }));
      return res.json({ success: true, data: { brand, menuCategories, menuProducts, tables } });
    }
    res.json({
      success: true,
      data: snapshot,
    });
  } catch (error) {
    console.error('bootstrap failed', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'No fue posible cargar el entorno.',
    });
  }
});

router.get('/settings/brand', requireAuth, requirePermissions(['SETTINGS_MANAGE']), async (req: ApiRequest, res) => {
  res.json({ success: true, data: await getBrandForUser(req.authUser) });
});

const backupModeSchema = z.object({
  mode: z.enum(['database', 'full']),
});

router.post('/settings/backups', requireAuth, requirePermissions(['SETTINGS_MANAGE']), async (req: ApiRequest, res) => {
  try {
    const payload = backupModeSchema.parse(req.body);
    const job = startBackupJob(payload.mode, req.authUser.id);
    res.status(202).json({
      success: true,
      data: {
        jobId: job.id,
        mode: job.mode,
        status: job.status,
        progress: job.progress,
        message: job.message,
      },
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'No fue posible iniciar el respaldo.',
    });
  }
});

router.get('/settings/backups/:jobId', requireAuth, requirePermissions(['SETTINGS_MANAGE']), async (req: ApiRequest, res) => {
  const job = getBackupJob(String(req.params.jobId), req.authUser.id);
  if (!job) {
    res.status(404).json({ success: false, message: 'Respaldo no encontrado.' });
    return;
  }

  res.json({
    success: true,
    data: {
      jobId: job.id,
      mode: job.mode,
      status: job.status,
      progress: job.progress,
      message: job.message,
      fileName: job.fileName ?? null,
      error: job.error ?? null,
      databaseExportMethod: job.databaseExportMethod ?? null,
      databaseExportNote: job.databaseExportNote ?? null,
      completedAt: job.completedAt ?? null,
    },
  });
});

router.get('/settings/backups/:jobId/download', requireAuth, requirePermissions(['SETTINGS_MANAGE']), async (req: ApiRequest, res) => {
  const asset = getBackupDownloadPath(String(req.params.jobId), req.authUser.id);
  if (!asset) {
    res.status(404).json({ success: false, message: 'El archivo de respaldo no está disponible.' });
    return;
  }

  res.download(asset.filePath, asset.fileName);
});

router.put('/settings/brand', requireAuth, requirePermissions(['SETTINGS_MANAGE']), async (req: ApiRequest, res) => {
  try {
    const schema = z.object({
      name: z.string(),
      currencyCode: z.string(),
      currencySymbol: z.string(),
      address: z.string().trim().max(250).optional(),
      phone: z.string().trim().max(40).optional(),
      slogan: z.string().trim().max(160).optional(),
      stationLayout: z.enum(layouts).optional(),
      logoData: z.string().nullable().optional(),
    });
    const payload = schema.parse(req.body) as Parameters<typeof updateBrandForUser>[1];
    const brand = await updateBrandForUser(req.authUser, payload);
    return res.json({ success: true, data: brand });
  } catch (error) {
    return res.status(400).json({ success: false, message: error instanceof Error ? error.message : 'No fue posible guardar la configuración.' });
  }
});

router.get('/roles', requireAuth, requirePermissions(['SETTINGS_MANAGE']), async (req: ApiRequest, res) => {
  res.json({ success: true, data: await getRolesConfiguration(req.authUser) });
});

router.put('/roles/:role', requireAuth, requirePermissions(['SETTINGS_MANAGE']), async (req: ApiRequest, res) => {
  const role = String(req.params.role || '').toUpperCase();
  if (!roleCodeValues.includes(role as (typeof roleCodeValues)[number])) {
    return res.status(400).json({ success: false, message: 'Rol inválido.' });
  }

  try {
    const schema = z.object({
      name: z.string().min(2).max(60),
      description: z.string().max(180).optional().default(''),
      sortOrder: z.number().int().min(0).max(999),
      permissions: z.array(z.enum(permissionCodeValues)).min(1),
    });
    const payload = schema.parse(req.body);
    const updated = await updateRoleProfileForUser(req.authUser, {
      role: role as (typeof roleCodeValues)[number],
      name: payload.name,
      description: payload.description,
      sortOrder: payload.sortOrder,
      permissions: payload.permissions,
    });
    return res.json({ success: true, data: updated, message: 'Rol actualizado.' });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'No fue posible actualizar el rol.',
    });
  }
});

router.get(
  '/dashboard/summary',
  requireAuth,
  requirePermissions(['DASHBOARD_VIEW']),
  async (req: ApiRequest, res) => {
    res.json({
      success: true,
      data: await getDashboardSummary(req.authUser),
    });
  },
);

router.get('/orders', requireAuth, requirePermissions(['POS_USE']), async (req: ApiRequest, res) => {
  const branchId = Number(req.query.branchId || req.authUser?.branchId || 1);

  res.json({
    success: true,
    data: await listOrders(req.authUser, branchId),
  });
});

router.post('/orders/:orderId/pay', requireAuth, requirePermissions(['CASH_MANAGE']), async (req: ApiRequest, res) => {
  try {
    const orderId = Number(req.params.orderId);
    const methodRaw = String(req.body?.method ?? '').toUpperCase();
    const amount = typeof req.body?.amount === 'number' ? req.body.amount : Number(req.body?.amount ?? 0);
    const receivedAmount =
      typeof req.body?.receivedAmount === 'number' ? req.body.receivedAmount : Number(req.body?.receivedAmount ?? NaN);
    const reference = typeof req.body?.reference === 'string' ? req.body.reference : null;
    const proofImage = typeof req.body?.proofImage === 'string' ? req.body.proofImage : null;
    const appliedItemIds = Array.isArray(req.body?.appliedItemIds)
      ? req.body.appliedItemIds
          .map((itemId: unknown) => (typeof itemId === 'number' ? itemId : Number(itemId)))
          .filter((itemId: number) => Number.isInteger(itemId) && itemId > 0)
      : null;
    const method = methodRaw === 'CARD' ? 'CARD' : methodRaw === 'TRANSFER' ? 'TRANSFER' : methodRaw === 'MIXED' ? 'MIXED' : 'CASH';

    if (!orderId || !Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Parámetros inválidos.' });
    }

    const result = await payOrderForUser(req.authUser, {
      orderId,
      method,
      amount,
      receivedAmount: Number.isFinite(receivedAmount) ? receivedAmount : null,
      reference,
      proofImage,
      appliedItemIds,
    });
    return res.json({ success: true, data: result });
  } catch (error) {
    return res.status(400).json({ success: false, message: error instanceof Error ? error.message : 'No fue posible cobrar.' });
  }
});

router.post('/orders/:orderId/request-bill', requireAuth, requirePermissions(['POS_USE']), async (req: ApiRequest, res) => {
  try {
    const orderId = Number(req.params.orderId);
    if (!orderId) {
      return res.status(400).json({ success: false, message: 'orderId inválido.' });
    }

    const result = await requestOrderBillForUser(req.authUser, { orderId });
    return res.json({ success: true, data: result, message: 'Cuenta solicitada correctamente.' });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'No fue posible solicitar cuenta.',
    });
  }
});

router.get('/tables', requireAuth, requirePermissions(['TABLES_MANAGE']), async (req: ApiRequest, res) => {
  res.json({
    success: true,
    data: await listTables(req.authUser),
  });
});

const tableSchema = z.object({
  branchId: z.number().int().positive().nullable().optional(),
  code: z.string().min(1),
  area: z.string().min(1),
  capacity: z.number().int().positive(),
});

router.post('/tables', requireAuth, requirePermissions(['TABLES_MANAGE']), async (req: ApiRequest, res) => {
  const parsed = tableSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Datos inválidos.', errors: parsed.error.flatten() });
  }

  try {
    const payload = {
      branchId: parsed.data.branchId ?? null,
      code: parsed.data.code,
      area: parsed.data.area,
      capacity: parsed.data.capacity,
    };
    const created = await createTableForUser(req.authUser, payload);
    return res.status(201).json({ success: true, data: created });
  } catch (error) {
    return res.status(400).json({ success: false, message: error instanceof Error ? error.message : 'No fue posible crear la mesa.' });
  }
});

router.post('/table-areas', requireAuth, requirePermissions(['TABLES_MANAGE']), async (req: ApiRequest, res) => {
  const parsed = z.object({ name: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Datos inválidos.', errors: parsed.error.flatten() });
  }

  try {
    const created = await createTableAreaForUser(req.authUser, { name: parsed.data.name });
    return res.status(201).json({ success: true, data: created });
  } catch (error) {
    return res.status(400).json({ success: false, message: error instanceof Error ? error.message : 'No fue posible crear el área.' });
  }
});

router.patch('/table-areas/rename', requireAuth, requirePermissions(['TABLES_MANAGE']), async (req: ApiRequest, res) => {
  const parsed = z
    .object({
      previousName: z.string().min(1),
      nextName: z.string().min(1),
    })
    .safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Datos inválidos.', errors: parsed.error.flatten() });
  }

  try {
    await renameTableAreaForUser(req.authUser, {
      previousName: parsed.data.previousName,
      nextName: parsed.data.nextName,
    });
    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(400).json({ success: false, message: error instanceof Error ? error.message : 'No fue posible renombrar el área.' });
  }
});

router.delete('/table-areas', requireAuth, requirePermissions(['TABLES_MANAGE']), async (req: ApiRequest, res) => {
  const parsed = z.object({ name: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Datos inválidos.', errors: parsed.error.flatten() });
  }

  try {
    await deleteTableAreaForUser(req.authUser, { name: parsed.data.name });
    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(400).json({ success: false, message: error instanceof Error ? error.message : 'No fue posible eliminar el área.' });
  }
});

router.put('/table-areas/reorder', requireAuth, requirePermissions(['TABLES_MANAGE']), async (req: ApiRequest, res) => {
  const parsed = z
    .object({
      areaNames: z.array(z.string().min(1)).min(1),
    })
    .safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Datos inválidos.', errors: parsed.error.flatten() });
  }

  try {
    await reorderTableAreasForUser(req.authUser, { areaNames: parsed.data.areaNames });
    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(400).json({ success: false, message: error instanceof Error ? error.message : 'No fue posible ordenar las áreas.' });
  }
});

router.put('/tables/reorder', requireAuth, requirePermissions(['TABLES_MANAGE']), async (req: ApiRequest, res) => {
  const parsed = z
    .object({
      area: z.string().min(1),
      tableIds: z.array(z.number().int().positive()).min(1),
    })
    .safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Datos inválidos.', errors: parsed.error.flatten() });
  }

  try {
    await reorderTablesForUser(req.authUser, {
      area: parsed.data.area,
      tableIds: parsed.data.tableIds,
    });
    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(400).json({ success: false, message: error instanceof Error ? error.message : 'No fue posible ordenar las mesas.' });
  }
});

router.patch('/tables/:tableId', requireAuth, requirePermissions(['TABLES_MANAGE']), async (req: ApiRequest, res) => {
  const tableId = Number(req.params.tableId);
  if (!tableId) {
    return res.status(400).json({ success: false, message: 'tableId inválido.' });
  }

  const parsed = tableSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Datos inválidos.', errors: parsed.error.flatten() });
  }

  try {
    const payload = {
      tableId,
      branchId: parsed.data.branchId ?? null,
      code: parsed.data.code,
      area: parsed.data.area,
      capacity: parsed.data.capacity,
    };
    const updated = await updateTableForUser(req.authUser, payload);
    return res.json({ success: true, data: updated });
  } catch (error) {
    return res.status(400).json({ success: false, message: error instanceof Error ? error.message : 'No fue posible actualizar la mesa.' });
  }
});

router.delete('/tables/:tableId', requireAuth, requirePermissions(['TABLES_MANAGE']), async (req: ApiRequest, res) => {
  const tableId = Number(req.params.tableId);
  if (!tableId) {
    return res.status(400).json({ success: false, message: 'tableId inválido.' });
  }

  try {
    await deleteTableForUser(req.authUser, tableId);
    return res.json({ success: true, data: { success: true } });
  } catch (error) {
    return res.status(400).json({ success: false, message: error instanceof Error ? error.message : 'No fue posible eliminar la mesa.' });
  }
});

const reservationChangeSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('FREE'),
    reason: z.string().trim().max(250).optional(),
  }),
  z.object({ status: z.literal('RESERVED'), reservation: z.object({
    name: z.string().trim().min(1, 'Ingresa el nombre.').max(150),
    phone: z.string().trim().max(40).optional(),
    address: z.string().trim().max(250).default(''),
    guests: z.number().int().positive('Indica para cuántas personas es la reserva.'),
    observations: z.string().trim().max(500).optional(),
  }) }),
]).transform((change): import('../../shared/table-reservation.js').ReservationChange => {
  if (change.status === 'FREE') {
    const reason = change.reason?.trim();
    return reason ? { status: 'FREE', reason } : { status: 'FREE' };
  }
  const { name, address, guests, phone, observations } = change.reservation;
  const notes = observations?.trim();
  const phoneNumber = phone?.trim();
  return {
    status: 'RESERVED',
    reservation: {
      name,
      address,
      guests,
      ...(phoneNumber ? { phone: phoneNumber } : {}),
      ...(notes ? { observations: notes } : {}),
    },
  };
});
const kioskKeySchema = z.string().regex(/^[a-f0-9]{32}$/);

router.put('/tables/:tableId/status', requireAuth, requirePermissions(['TABLES_MANAGE']), async (req: ApiRequest, res) => {
  try {
    const tableId = Number(req.params.tableId);
    const payload = reservationChangeSchema.parse(req.body);

    if (!tableId) {
      return res.status(400).json({ success: false, message: 'tableId inválido.' });
    }

    await updateTableStatusForUser(req.authUser, { tableId, ...payload, source: 'ADMIN' });
    return res.json({ success: true, data: { success: true } });
  } catch (error) {
    return res.status(400).json({ success: false, message: error instanceof Error ? error.message : 'No fue posible actualizar la mesa.' });
  }
});

router.put('/tables/:tableId/reservation', requireAuth, requirePermissions(['POS_USE'], true), async (req: ApiRequest, res) => {
  try {
    const tableId = Number(req.params.tableId);
    const payload = reservationChangeSchema.parse(req.body);
    const kioskKey = kioskKeySchema.parse(req.body.kioskKey);

    if (!tableId) {
      return res.status(400).json({ success: false, message: 'tableId inválido.' });
    }

    await updateTableStatusForUser(req.authUser, { tableId, ...payload, source: 'KIOSK', kioskKey });
    return res.json({ success: true, data: { success: true } });
  } catch (error) {
    return res.status(400).json({ success: false, message: error instanceof Error ? error.message : 'No fue posible actualizar la reserva.' });
  }
});

router.post('/tables/move', requireAuth, requirePermissions(['TABLES_MANAGE']), async (req: ApiRequest, res) => {
  try {
    const fromTableId = Number(req.body?.fromTableId);
    const toTableId = Number(req.body?.toTableId);

    if (!fromTableId || !toTableId) {
      return res.status(400).json({ success: false, message: 'fromTableId y toTableId son obligatorios.' });
    }

    await moveOpenOrderToTable(req.authUser, { fromTableId, toTableId });
    return res.json({ success: true, message: 'Cuenta movida correctamente.' });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'No fue posible mover la cuenta.',
    });
  }
});

router.post('/tables/merge', requireAuth, requirePermissions(['TABLES_MANAGE']), async (req: ApiRequest, res) => {
  try {
    const hostTableId = Number(req.body?.hostTableId);
    const joinTableId = Number(req.body?.joinTableId);

    if (!hostTableId || !joinTableId) {
      return res.status(400).json({ success: false, message: 'hostTableId y joinTableId son obligatorios.' });
    }

    await mergeOpenOrdersToTable(req.authUser, { hostTableId, joinTableId });
    return res.json({ success: true, message: 'Cuentas unidas correctamente.' });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'No fue posible unir las mesas.',
    });
  }
});

router.get('/kitchen/orders', requireAuth, requirePermissions(['KITCHEN_UPDATE']), async (req: ApiRequest, res) => {
  res.json({
    success: true,
    data: await listKitchenOrders(req.authUser),
  });
});

router.get('/bar/orders', requireAuth, requirePermissions(['KITCHEN_UPDATE']), async (req: ApiRequest, res) => {
  res.json({
    success: true,
    data: await listBarOrders(req.authUser),
  });
});

router.get('/pastry/orders', requireAuth, requirePermissions(['KITCHEN_UPDATE']), async (req: ApiRequest, res) => {
  res.json({
    success: true,
    data: await listPastryOrders(req.authUser),
  });
});

router.patch('/stations/:station/orders/:orderId/status', requireAuth, requirePermissions(['KITCHEN_UPDATE']), async (req: ApiRequest, res) => {
  try {
    const stationRaw = String(req.params.station || '').toUpperCase();
    const orderId = Number(req.params.orderId);
    const statusRaw = String(req.body?.status || '').toUpperCase();

    const station = stationRaw === 'BAR' ? 'BAR' : stationRaw === 'PASTRY' ? 'PASTRY' : stationRaw === 'KITCHEN' ? 'KITCHEN' : null;
    const status =
      statusRaw === 'PENDING'
        ? 'PENDING'
        : statusRaw === 'IN_PREPARATION'
          ? 'IN_PREPARATION'
          : statusRaw === 'READY'
            ? 'READY'
            : statusRaw === 'DELIVERED'
              ? 'DELIVERED'
              : null;

    if (!station || !orderId || !status) {
      return res.status(400).json({ success: false, message: 'Parámetros inválidos.' });
    }

    await updateStationOrderStatus(req.authUser, { station, orderId, status });
    return res.json({ success: true, message: 'Estado actualizado.' });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'No fue posible actualizar el estado.',
    });
  }
});

router.patch('/stations/:station/items/:orderItemId/status', requireAuth, requirePermissions(['KITCHEN_UPDATE']), async (req: ApiRequest, res) => {
  try {
    const stationRaw = String(req.params.station || '').toUpperCase();
    const orderItemId = Number(req.params.orderItemId);
    const statusRaw = String(req.body?.status || '').toUpperCase();

    const station = stationRaw === 'BAR' ? 'BAR' : stationRaw === 'PASTRY' ? 'PASTRY' : stationRaw === 'KITCHEN' ? 'KITCHEN' : null;
    const status =
      statusRaw === 'PENDING'
        ? 'PENDING'
        : statusRaw === 'IN_PREPARATION'
          ? 'IN_PREPARATION'
          : statusRaw === 'READY'
            ? 'READY'
            : statusRaw === 'DELIVERED'
              ? 'DELIVERED'
              : null;

    if (!station || !orderItemId || !status) {
      return res.status(400).json({ success: false, message: 'Parámetros inválidos.' });
    }

    await updateStationOrderItemStatus(req.authUser, { station, orderItemId, status });
    return res.json({ success: true, message: 'Estado del platillo actualizado.' });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'No fue posible actualizar el estado del platillo.',
    });
  }
});

router.get('/cash/movements', requireAuth, requirePermissions(['CASH_MANAGE']), async (req: ApiRequest, res) => {
  res.json({
    success: true,
    data: await listCashMovements(req.authUser),
  });
});

router.post('/cash/movements', requireAuth, requirePermissions(['CASH_MANAGE']), async (req: ApiRequest, res) => {
  try {
    const schema = z.object({
      type: z.enum(['ENTRY', 'EXPENSE', 'WITHDRAWAL']),
      amount: z.number().positive(),
      reference: z.string().min(1),
      notes: z.string().nullable().optional(),
    });
    const payload = schema.parse(req.body) as {
      type: 'ENTRY' | 'EXPENSE' | 'WITHDRAWAL';
      amount: number;
      reference: string;
      notes?: string | null;
    };

    await createCashMovementForUser(req.authUser, payload);
    return res.status(201).json({ success: true, data: { success: true } });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'No fue posible registrar el movimiento de caja.',
    });
  }
});

router.post('/cash/open', requireAuth, requirePermissions(['CASH_MANAGE']), async (req: ApiRequest, res) => {
  try {
    const openingAmount = typeof req.body?.openingAmount === 'number' ? req.body.openingAmount : Number(req.body?.openingAmount ?? 0);
    if (!Number.isFinite(openingAmount) || openingAmount < 0) {
      return res.status(400).json({ success: false, message: 'openingAmount inválido.' });
    }

    await openCashShift(req.authUser, { openingAmount });
    return res.json({ success: true, data: { success: true } });
  } catch (error) {
    return res.status(400).json({ success: false, message: error instanceof Error ? error.message : 'No fue posible abrir caja.' });
  }
});

router.post('/cash/close', requireAuth, requirePermissions(['CASH_MANAGE']), async (req: ApiRequest, res) => {
  try {
    const closingAmount = typeof req.body?.closingAmount === 'number' ? req.body.closingAmount : Number(req.body?.closingAmount ?? 0);
    if (!Number.isFinite(closingAmount) || closingAmount < 0) {
      return res.status(400).json({ success: false, message: 'closingAmount inválido.' });
    }

    await closeCashShift(req.authUser, { closingAmount });
    return res.json({ success: true, data: { success: true } });
  } catch (error) {
    return res.status(400).json({ success: false, message: error instanceof Error ? error.message : 'No fue posible cerrar caja.' });
  }
});

router.get('/cash/shifts', requireAuth, requirePermissions(['CASH_MANAGE']), async (req: ApiRequest, res) => {
  try {
    const branchId = req.query.branchId ? Number(req.query.branchId) : null;
    const openOnly = String(req.query.openOnly ?? '').toLowerCase() === 'true';
    const dateFromRaw = typeof req.query.dateFrom === 'string' ? req.query.dateFrom.trim() : '';
    const dateToRaw = typeof req.query.dateTo === 'string' ? req.query.dateTo.trim() : '';

    const dateFrom = dateFromRaw ? new Date(`${dateFromRaw}T00:00:00`) : null;
    const dateTo = dateToRaw ? new Date(`${dateToRaw}T23:59:59.999`) : null;

    if (req.query.branchId && (!Number.isInteger(branchId) || Number(branchId) <= 0)) {
      return res.status(400).json({ success: false, message: 'branchId inválido.' });
    }

    if (dateFromRaw && Number.isNaN(dateFrom?.getTime())) {
      return res.status(400).json({ success: false, message: 'dateFrom inválido.' });
    }

    if (dateToRaw && Number.isNaN(dateTo?.getTime())) {
      return res.status(400).json({ success: false, message: 'dateTo inválido.' });
    }

    return res.json({
      success: true,
      data: await listCashShiftsForControl(req.authUser, {
        branchId,
        openOnly,
        dateFrom,
        dateTo,
      }),
    });
  } catch (error) {
    return res.status(403).json({
      success: false,
      message: error instanceof Error ? error.message : 'No fue posible consultar el control de cajas.',
    });
  }
});

router.post('/cash/shifts/:cashShiftId/close', requireAuth, requirePermissions(['CASH_MANAGE']), async (req: ApiRequest, res) => {
  try {
    const cashShiftId = Number(req.params.cashShiftId);
    const closingAmount = typeof req.body?.closingAmount === 'number' ? req.body.closingAmount : Number(req.body?.closingAmount ?? 0);

    if (!Number.isInteger(cashShiftId) || cashShiftId <= 0) {
      return res.status(400).json({ success: false, message: 'cashShiftId inválido.' });
    }

    if (!Number.isFinite(closingAmount) || closingAmount < 0) {
      return res.status(400).json({ success: false, message: 'closingAmount inválido.' });
    }

    await closeCashShiftForControl(req.authUser, { cashShiftId, closingAmount });
    return res.json({ success: true, data: { success: true } });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'No fue posible cerrar la caja seleccionada.',
    });
  }
});

router.get('/inventory/items', requireAuth, requirePermissions(['INVENTORY_MANAGE']), async (req: ApiRequest, res) => {
  res.json({
    success: true,
    data: await listInventoryItems(req.authUser),
  });
});

const inventoryItemSchema = z.object({
  branchId: z.number().int().positive().nullable().optional(),
  name: z.string().min(1),
  itemType: z.enum(['RAW', 'SUBRECIPE']).optional(),
  unit: z.string().min(1),
  stock: z.number().nonnegative().optional(),
  minStock: z.number().nonnegative().optional(),
  unitCost: z.number().nonnegative().optional(),
  supplier: z.string().nullable().optional(),
});

const inventoryAdjustmentSchema = z.object({
  type: z.enum(['ADJUSTMENT_IN', 'ADJUSTMENT_OUT']),
  quantity: z.number().positive(),
  reference: z.string().min(1),
  notes: z.string().nullable().optional(),
});

const subRecipeSchema = z.object({
  branchId: z.number().int().positive().nullable().optional(),
  components: z.array(
    z.object({
      inventoryItemId: z.number().int().positive(),
      quantity: z.number().positive(),
    }),
  ),
});

const subRecipeProductionSchema = z.object({
  outputQuantity: z.number().positive(),
  reference: z.string().min(1),
  notes: z.string().nullable().optional(),
});

const purchaseReceiptSchema = z.object({
  branchId: z.number().int().positive().nullable().optional(),
  supplier: z.string().min(1),
  reference: z.string().min(1),
  invoiceNo: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  lines: z.array(
    z.object({
      inventoryItemId: z.number().int().positive(),
      quantity: z.number().positive(),
      unitCost: z.number().nonnegative(),
    }),
  ).min(1),
});

const wasteRecordSchema = z.object({
  inventoryItemId: z.number().int().positive(),
  quantity: z.number().positive(),
  reasonType: z.enum(['PRODUCTION', 'KITCHEN', 'EXPIRED', 'DAMAGE', 'OTHER']),
  reference: z.string().min(1),
  notes: z.string().nullable().optional(),
});

const recipeSchema = z.object({
  branchId: z.number().int().positive().nullable().optional(),
  ingredients: z.array(
    z.object({
      inventoryItemId: z.number().int().positive(),
      quantity: z.number().positive(),
    }),
  ),
});

router.post('/inventory/items', requireAuth, requirePermissions(['INVENTORY_MANAGE']), async (req: ApiRequest, res) => {
  const parsed = inventoryItemSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Datos inválidos.', errors: parsed.error.flatten() });
  }

  try {
    const created = await createInventoryItemForUser(req.authUser, {
      branchId: parsed.data.branchId ?? null,
      name: parsed.data.name,
      itemType: parsed.data.itemType ?? 'RAW',
      unit: parsed.data.unit,
      stock: parsed.data.stock ?? 0,
      minStock: parsed.data.minStock ?? 0,
      unitCost: parsed.data.unitCost ?? 0,
      supplier: parsed.data.supplier ?? null,
    });
    return res.status(201).json({ success: true, data: created });
  } catch (error) {
    return res.status(400).json({ success: false, message: error instanceof Error ? error.message : 'No fue posible crear el insumo.' });
  }
});

router.patch('/inventory/items/:inventoryItemId', requireAuth, requirePermissions(['INVENTORY_MANAGE']), async (req: ApiRequest, res) => {
  const inventoryItemId = Number(req.params.inventoryItemId);
  if (!inventoryItemId) {
    return res.status(400).json({ success: false, message: 'inventoryItemId inválido.' });
  }

  const parsed = inventoryItemSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Datos inválidos.', errors: parsed.error.flatten() });
  }

  try {
    const updated = await updateInventoryItemForUser(req.authUser, {
      inventoryItemId,
      branchId: parsed.data.branchId ?? null,
      name: parsed.data.name,
      itemType: parsed.data.itemType ?? 'RAW',
      unit: parsed.data.unit,
      minStock: parsed.data.minStock ?? 0,
      unitCost: parsed.data.unitCost ?? 0,
      supplier: parsed.data.supplier ?? null,
    });
    return res.json({ success: true, data: updated });
  } catch (error) {
    return res.status(400).json({ success: false, message: error instanceof Error ? error.message : 'No fue posible actualizar el insumo.' });
  }
});

router.post('/inventory/purchases', requireAuth, requirePermissions(['INVENTORY_MANAGE']), async (req: ApiRequest, res) => {
  const parsed = purchaseReceiptSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Datos inválidos.', errors: parsed.error.flatten() });
  }

  try {
    const receipt = await createPurchaseReceiptForUser(req.authUser, {
      branchId: parsed.data.branchId ?? null,
      supplier: parsed.data.supplier,
      reference: parsed.data.reference,
      invoiceNo: parsed.data.invoiceNo ?? null,
      notes: parsed.data.notes ?? null,
      lines: parsed.data.lines.map((line) => ({
        inventoryItemId: line.inventoryItemId,
        quantity: line.quantity,
        unitCost: line.unitCost,
      })),
    });
    return res.status(201).json({ success: true, data: receipt });
  } catch (error) {
    return res.status(400).json({ success: false, message: error instanceof Error ? error.message : 'No fue posible registrar la compra.' });
  }
});

router.post('/inventory/waste', requireAuth, requirePermissions(['INVENTORY_MANAGE']), async (req: ApiRequest, res) => {
  const parsed = wasteRecordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Datos inválidos.', errors: parsed.error.flatten() });
  }

  try {
    const record = await createWasteRecordForUser(req.authUser, {
      inventoryItemId: parsed.data.inventoryItemId,
      quantity: parsed.data.quantity,
      reasonType: parsed.data.reasonType,
      reference: parsed.data.reference,
      notes: parsed.data.notes ?? null,
    });
    return res.status(201).json({ success: true, data: record });
  } catch (error) {
    return res.status(400).json({ success: false, message: error instanceof Error ? error.message : 'No fue posible registrar la merma.' });
  }
});

router.post('/inventory/items/:inventoryItemId/adjust', requireAuth, requirePermissions(['INVENTORY_MANAGE']), async (req: ApiRequest, res) => {
  const inventoryItemId = Number(req.params.inventoryItemId);
  if (!inventoryItemId) {
    return res.status(400).json({ success: false, message: 'inventoryItemId inválido.' });
  }

  const parsed = inventoryAdjustmentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Datos inválidos.', errors: parsed.error.flatten() });
  }

  try {
    const movement = await adjustInventoryStockForUser(req.authUser, {
      inventoryItemId,
      type: parsed.data.type,
      quantity: parsed.data.quantity,
      reference: parsed.data.reference,
      notes: parsed.data.notes ?? null,
    });
    return res.status(201).json({ success: true, data: movement });
  } catch (error) {
    return res.status(400).json({ success: false, message: error instanceof Error ? error.message : 'No fue posible ajustar el stock.' });
  }
});

router.get('/inventory/movements', requireAuth, requirePermissions(['INVENTORY_MANAGE']), async (req: ApiRequest, res) => {
  const branchId = req.query.branchId ? Number(req.query.branchId) : null;
  if (req.query.branchId && (!Number.isInteger(branchId) || Number(branchId) <= 0)) {
    return res.status(400).json({ success: false, message: 'branchId inválido.' });
  }

  res.json({
    success: true,
    data: await listInventoryMovementsForUser(req.authUser, { branchId }),
  });
});

router.get('/menu/products/:productId/recipe', requireAuth, requirePermissions(['INVENTORY_MANAGE']), async (req: ApiRequest, res) => {
  const productId = Number(req.params.productId);
  const branchId = req.query.branchId ? Number(req.query.branchId) : null;

  if (!productId) {
    return res.status(400).json({ success: false, message: 'productId inválido.' });
  }
  if (req.query.branchId && (!Number.isInteger(branchId) || Number(branchId) <= 0)) {
    return res.status(400).json({ success: false, message: 'branchId inválido.' });
  }

  try {
    const recipe = await getProductRecipeForUser(req.authUser, { productId, branchId });
    return res.json({ success: true, data: recipe });
  } catch (error) {
    return res.status(400).json({ success: false, message: error instanceof Error ? error.message : 'No fue posible consultar la receta.' });
  }
});

router.get('/inventory/items/:inventoryItemId/subrecipe', requireAuth, requirePermissions(['INVENTORY_MANAGE']), async (req: ApiRequest, res) => {
  const inventoryItemId = Number(req.params.inventoryItemId);
  const branchId = req.query.branchId ? Number(req.query.branchId) : null;

  if (!inventoryItemId) {
    return res.status(400).json({ success: false, message: 'inventoryItemId inválido.' });
  }
  if (req.query.branchId && (!Number.isInteger(branchId) || Number(branchId) <= 0)) {
    return res.status(400).json({ success: false, message: 'branchId inválido.' });
  }

  try {
    const formula = await getSubRecipeFormulaForUser(req.authUser, { inventoryItemId, branchId });
    return res.json({ success: true, data: formula });
  } catch (error) {
    return res.status(400).json({ success: false, message: error instanceof Error ? error.message : 'No fue posible consultar la subreceta.' });
  }
});

router.put('/inventory/items/:inventoryItemId/subrecipe', requireAuth, requirePermissions(['INVENTORY_MANAGE']), async (req: ApiRequest, res) => {
  const inventoryItemId = Number(req.params.inventoryItemId);
  if (!inventoryItemId) {
    return res.status(400).json({ success: false, message: 'inventoryItemId inválido.' });
  }

  const parsed = subRecipeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Datos inválidos.', errors: parsed.error.flatten() });
  }

  try {
    const formula = await saveSubRecipeFormulaForUser(req.authUser, {
      inventoryItemId,
      branchId: parsed.data.branchId ?? null,
      components: parsed.data.components.map((component) => ({
        inventoryItemId: component.inventoryItemId,
        quantity: component.quantity,
      })),
    });
    return res.json({ success: true, data: formula });
  } catch (error) {
    return res.status(400).json({ success: false, message: error instanceof Error ? error.message : 'No fue posible guardar la subreceta.' });
  }
});

router.post('/inventory/items/:inventoryItemId/produce', requireAuth, requirePermissions(['INVENTORY_MANAGE']), async (req: ApiRequest, res) => {
  const inventoryItemId = Number(req.params.inventoryItemId);
  if (!inventoryItemId) {
    return res.status(400).json({ success: false, message: 'inventoryItemId inválido.' });
  }

  const parsed = subRecipeProductionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Datos inválidos.', errors: parsed.error.flatten() });
  }

  try {
    const movement = await produceSubRecipeForUser(req.authUser, {
      inventoryItemId,
      outputQuantity: parsed.data.outputQuantity,
      reference: parsed.data.reference,
      notes: parsed.data.notes ?? null,
    });
    return res.status(201).json({ success: true, data: movement });
  } catch (error) {
    return res.status(400).json({ success: false, message: error instanceof Error ? error.message : 'No fue posible producir la subreceta.' });
  }
});

router.put('/menu/products/:productId/recipe', requireAuth, requirePermissions(['INVENTORY_MANAGE']), async (req: ApiRequest, res) => {
  const productId = Number(req.params.productId);
  if (!productId) {
    return res.status(400).json({ success: false, message: 'productId inválido.' });
  }

  const parsed = recipeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Datos inválidos.', errors: parsed.error.flatten() });
  }

  try {
    const recipe = await saveProductRecipeForUser(req.authUser, {
      productId,
      branchId: parsed.data.branchId ?? null,
      ingredients: parsed.data.ingredients.map((ingredient) => ({
        inventoryItemId: ingredient.inventoryItemId,
        quantity: ingredient.quantity,
      })),
    });
    return res.json({ success: true, data: recipe });
  } catch (error) {
    return res.status(400).json({ success: false, message: error instanceof Error ? error.message : 'No fue posible guardar la receta.' });
  }
});

const categorySchema = z.object({
  parentId: z.number().int().positive().nullable().optional(),
  name: z.string().min(1),
  color: z.string().nullable().optional(),
  showInPos: z.boolean().nullable().optional(),
  station: z.enum(['KITCHEN', 'BAR', 'PASTRY']),
});

const productSchema = z.object({
  categoryId: z.number().int().positive().nullable().optional(),
  name: z.string().min(1),
  sku: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  price: z.number().nonnegative(),
  isPrepared: z.boolean(),
});

router.post('/menu/categories', requireAuth, requirePermissions(['INVENTORY_MANAGE']), async (req: ApiRequest, res) => {
  const parsed = categorySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Datos inválidos.', errors: parsed.error.flatten() });
  }

  try {
    const payload = {
      parentId: parsed.data.parentId ?? null,
      name: parsed.data.name,
      color: parsed.data.color ?? null,
      showInPos: parsed.data.showInPos ?? null,
      station: parsed.data.station,
    };
    const created = await createCategoryForUser(req.authUser, payload);
    return res.status(201).json({ success: true, data: created });
  } catch (error) {
    return res.status(400).json({ success: false, message: error instanceof Error ? error.message : 'No fue posible crear la categoría.' });
  }
});

router.patch('/menu/categories/:categoryId', requireAuth, requirePermissions(['INVENTORY_MANAGE']), async (req: ApiRequest, res) => {
  const categoryId = Number(req.params.categoryId);
  if (!categoryId) {
    return res.status(400).json({ success: false, message: 'categoryId inválido.' });
  }

  const parsed = categorySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Datos inválidos.', errors: parsed.error.flatten() });
  }

  try {
    const payload = {
      categoryId,
      parentId: parsed.data.parentId ?? null,
      name: parsed.data.name,
      color: parsed.data.color ?? null,
      showInPos: parsed.data.showInPos ?? null,
      station: parsed.data.station,
    };
    const updated = await updateCategoryForUser(req.authUser, payload);
    return res.json({ success: true, data: updated });
  } catch (error) {
    return res.status(400).json({ success: false, message: error instanceof Error ? error.message : 'No fue posible actualizar la categoría.' });
  }
});

router.delete('/menu/categories/:categoryId', requireAuth, requirePermissions(['INVENTORY_MANAGE']), async (req: ApiRequest, res) => {
  const categoryId = Number(req.params.categoryId);
  if (!categoryId) {
    return res.status(400).json({ success: false, message: 'categoryId inválido.' });
  }

  try {
    await deleteCategoryForUser(req.authUser, categoryId);
    return res.json({ success: true, data: { success: true } });
  } catch (error) {
    return res.status(400).json({ success: false, message: error instanceof Error ? error.message : 'No fue posible eliminar la categoría.' });
  }
});

router.post('/menu/products', requireAuth, requirePermissions(['INVENTORY_MANAGE']), async (req: ApiRequest, res) => {
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Datos inválidos.', errors: parsed.error.flatten() });
  }

  try {
    const payload = {
      categoryId: parsed.data.categoryId ?? null,
      name: parsed.data.name,
      sku: parsed.data.sku ?? null,
      imageUrl: parsed.data.imageUrl ?? null,
      price: parsed.data.price,
      isPrepared: parsed.data.isPrepared,
    };
    const created = await createProductForUser(req.authUser, payload);
    return res.status(201).json({ success: true, data: created });
  } catch (error) {
    return res.status(400).json({ success: false, message: error instanceof Error ? error.message : 'No fue posible crear el producto.' });
  }
});

router.patch('/menu/products/:productId', requireAuth, requirePermissions(['INVENTORY_MANAGE']), async (req: ApiRequest, res) => {
  const productId = Number(req.params.productId);
  if (!productId) {
    return res.status(400).json({ success: false, message: 'productId inválido.' });
  }

  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Datos inválidos.', errors: parsed.error.flatten() });
  }

  try {
    const payload = {
      productId,
      categoryId: parsed.data.categoryId ?? null,
      name: parsed.data.name,
      sku: parsed.data.sku ?? null,
      imageUrl: parsed.data.imageUrl ?? null,
      price: parsed.data.price,
      isPrepared: parsed.data.isPrepared,
    };
    const updated = await updateProductForUser(req.authUser, payload);
    return res.json({ success: true, data: updated });
  } catch (error) {
    return res.status(400).json({ success: false, message: error instanceof Error ? error.message : 'No fue posible actualizar el producto.' });
  }
});

router.delete('/menu/products/:productId', requireAuth, requirePermissions(['INVENTORY_MANAGE']), async (req: ApiRequest, res) => {
  const productId = Number(req.params.productId);
  if (!productId) {
    return res.status(400).json({ success: false, message: 'productId inválido.' });
  }

  try {
    await deleteProductForUser(req.authUser, productId);
    return res.json({ success: true, data: { success: true } });
  } catch (error) {
    return res.status(400).json({ success: false, message: error instanceof Error ? error.message : 'No fue posible eliminar el producto.' });
  }
});

router.get('/customers', requireAuth, requirePermissions(['CUSTOMERS_MANAGE']), async (req: ApiRequest, res) => {
  res.json({
    success: true,
    data: await listCustomers(req.authUser),
  });
});

const customerSchema = z.object({
  name: z.string().min(1),
  phone: z.string().nullable().optional(),
  email: z.union([z.string().email(), z.literal(''), z.null()]).optional(),
  points: z.number().int().nonnegative().optional(),
  creditLimit: z.number().nonnegative().optional(),
});

router.post('/customers', requireAuth, requirePermissions(['CUSTOMERS_MANAGE']), async (req: ApiRequest, res) => {
  const parsed = customerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Datos inválidos.', errors: parsed.error.flatten() });
  }

  try {
    const payload = {
      name: parsed.data.name,
      phone: parsed.data.phone ?? null,
      email: parsed.data.email || null,
      points: parsed.data.points ?? 0,
      creditLimit: parsed.data.creditLimit ?? 0,
    };
    const created = await createCustomerForUser(req.authUser, payload);
    return res.status(201).json({ success: true, data: created });
  } catch (error) {
    return res.status(400).json({ success: false, message: error instanceof Error ? error.message : 'No fue posible crear el cliente.' });
  }
});

router.patch('/customers/:customerId', requireAuth, requirePermissions(['CUSTOMERS_MANAGE']), async (req: ApiRequest, res) => {
  const customerId = Number(req.params.customerId);
  if (!customerId) {
    return res.status(400).json({ success: false, message: 'customerId inválido.' });
  }

  const parsed = customerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Datos inválidos.', errors: parsed.error.flatten() });
  }

  try {
    const payload = {
      customerId,
      name: parsed.data.name,
      phone: parsed.data.phone ?? null,
      email: parsed.data.email || null,
      points: parsed.data.points ?? 0,
      creditLimit: parsed.data.creditLimit ?? 0,
    };
    const updated = await updateCustomerForUser(req.authUser, payload);
    return res.json({ success: true, data: updated });
  } catch (error) {
    return res.status(400).json({ success: false, message: error instanceof Error ? error.message : 'No fue posible actualizar el cliente.' });
  }
});

router.delete('/customers/:customerId', requireAuth, requirePermissions(['CUSTOMERS_MANAGE']), async (req: ApiRequest, res) => {
  const customerId = Number(req.params.customerId);
  if (!customerId) {
    return res.status(400).json({ success: false, message: 'customerId inválido.' });
  }

  try {
    await deleteCustomerForUser(req.authUser, customerId);
    return res.json({ success: true, data: { success: true } });
  } catch (error) {
    return res.status(400).json({ success: false, message: error instanceof Error ? error.message : 'No fue posible eliminar el cliente.' });
  }
});

router.get('/delivery/orders', requireAuth, requirePermissions(['DELIVERY_MANAGE']), async (req: ApiRequest, res) => {
  res.json({
    success: true,
    data: await listDeliveryOrders(req.authUser),
  });
});

router.get('/reports/sales', requireAuth, requirePermissions(['REPORTS_VIEW']), async (req: ApiRequest, res) => {
  const branchId = req.query.branchId ? Number(req.query.branchId) : null;
  const userId = req.query.userId ? Number(req.query.userId) : null;
  const dateFromRaw = typeof req.query.dateFrom === 'string' ? req.query.dateFrom.trim() : '';
  const dateToRaw = typeof req.query.dateTo === 'string' ? req.query.dateTo.trim() : '';

  const dateFrom = dateFromRaw ? new Date(`${dateFromRaw}T00:00:00.000`) : null;
  const dateTo = dateToRaw ? new Date(`${dateToRaw}T23:59:59.999`) : null;

  if (req.query.branchId && (!Number.isInteger(branchId) || Number(branchId) <= 0)) {
    return res.status(400).json({ success: false, message: 'branchId inválido.' });
  }

  if (req.query.userId && (!Number.isInteger(userId) || Number(userId) <= 0)) {
    return res.status(400).json({ success: false, message: 'userId inválido.' });
  }

  if (dateFromRaw && Number.isNaN(dateFrom?.getTime())) {
    return res.status(400).json({ success: false, message: 'dateFrom inválido.' });
  }

  if (dateToRaw && Number.isNaN(dateTo?.getTime())) {
    return res.status(400).json({ success: false, message: 'dateTo inválido.' });
  }

  if (dateFrom && dateTo && dateFrom.getTime() > dateTo.getTime()) {
    return res.status(400).json({ success: false, message: 'El rango de fechas es inválido.' });
  }

  res.json({
    success: true,
    data: await getReportsSummary(req.authUser, {
      branchId,
      userId,
      dateFrom,
      dateTo,
    }),
  });
});

router.get('/branches', requireAuth, async (req: ApiRequest, res) => {
  res.json({
    success: true,
    data: await listBranches(req.authUser),
  });
});

const branchSchema = z.object({
  name: z.string().min(2),
  city: z.string().min(2),
  address: z.string().min(4),
  phone: z.string().min(4),
  isActive: z.boolean().optional(),
});

router.post('/branches', requireAuth, requirePermissions(['SETTINGS_MANAGE']), async (req: ApiRequest, res) => {
  const parsed = branchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Datos inválidos.', errors: parsed.error.flatten() });
  }

  try {
    const { name, city, address, phone, isActive } = parsed.data;
    const created = await createBranchForUser(req.authUser, { name, city, address, phone, isActive });
    return res.status(201).json({ success: true, message: 'Sucursal creada.', data: created });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'No fue posible crear la sucursal.',
    });
  }
});

router.patch('/branches/:id', requireAuth, requirePermissions(['SETTINGS_MANAGE']), async (req: ApiRequest, res) => {
  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ success: false, message: 'Id inválido.' });
  }

  const parsed = branchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Datos inválidos.', errors: parsed.error.flatten() });
  }

  try {
    const { name, city, address, phone, isActive } = parsed.data;
    const updated = await updateBranchForUser(req.authUser, { id, name, city, address, phone, isActive });
    return res.json({ success: true, message: 'Sucursal actualizada.', data: updated });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'No fue posible actualizar la sucursal.',
    });
  }
});

router.delete('/branches/:id', requireAuth, requirePermissions(['SETTINGS_MANAGE']), async (req: ApiRequest, res) => {
  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ success: false, message: 'Id inválido.' });
  }

  try {
    await deleteBranchForUser(req.authUser, id);
    return res.json({ success: true, message: 'Sucursal eliminada.', data: { success: true } });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'No fue posible eliminar la sucursal.',
    });
  }
});

router.get('/menu', requireAuth, requirePermissions(['POS_USE']), async (req: ApiRequest, res) => {
  res.json({
    success: true,
    data: await getMenu(req.authUser),
  });
});

const userCreateSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(roleCodeValues),
  branchId: z.number().int().positive().nullable().optional(),
  isActive: z.boolean().optional(),
  permissionMode: z.enum(['ROLE', 'CUSTOM']).optional(),
  customPermissions: z.array(z.enum(permissionCodeValues)).optional(),
}).superRefine((value, ctx) => {
  if (value.permissionMode === 'CUSTOM' && (!value.customPermissions || value.customPermissions.length === 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'customPermissions es obligatorio cuando permissionMode=CUSTOM.',
      path: ['customPermissions'],
    });
  }
});

const userUpdateSchema = z.object({
  name: z.string().min(2).optional(),
  role: z.enum(roleCodeValues).optional(),
  branchId: z.number().int().positive().nullable().optional(),
  isActive: z.boolean().optional(),
  permissionMode: z.enum(['ROLE', 'CUSTOM']).optional(),
  customPermissions: z.array(z.enum(permissionCodeValues)).optional(),
}).superRefine((value, ctx) => {
  if (value.permissionMode === 'CUSTOM' && (!value.customPermissions || value.customPermissions.length === 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'customPermissions es obligatorio cuando permissionMode=CUSTOM.',
      path: ['customPermissions'],
    });
  }
});

const userPasswordSchema = z.object({
  password: z.string().min(8),
});

router.get('/users', requireAuth, requirePermissions(['SETTINGS_MANAGE']), async (req: ApiRequest, res) => {
  res.json({
    success: true,
    data: await listUsers(req.authUser),
  });
});

router.post('/users/email-suggestion', requireAuth, requirePermissions(['SETTINGS_MANAGE']), async (req: ApiRequest, res) => {
  const parsed = z.object({
    names: z.string().trim().min(1).max(100), firstSurname: z.string().trim().min(1).max(100),
    secondSurname: z.string().trim().max(100),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Revisa los nombres y apellidos.' });
  try {
    const { names, firstSurname, secondSurname } = parsed.data;
    return res.json({ success: true, data: await suggestUserEmail(names, firstSurname, secondSurname) });
  } catch {
    return res.status(503).json({ success: false, message: 'No se pudo comprobar la disponibilidad del correo.' });
  }
});

router.post('/users', requireAuth, requirePermissions(['SETTINGS_MANAGE']), async (req: ApiRequest, res) => {
  const parsed = userCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Datos inválidos.', errors: parsed.error.flatten() });
  }

  try {
    const created = await createUser(req.authUser, {
      name: parsed.data.name,
      email: parsed.data.email,
      password: parsed.data.password,
      role: parsed.data.role,
      branchId: parsed.data.branchId ?? null,
      isActive: parsed.data.isActive,
      permissionMode: parsed.data.permissionMode,
      customPermissions: parsed.data.customPermissions,
    });
    return res.status(201).json({ success: true, message: 'Usuario creado.', data: created });
  } catch (error) {
    if ((error as { code?: string })?.code === 'P2002') {
      return res.status(409).json({ success: false, message: 'El correo ya está en uso.' });
    }
    return res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'No fue posible crear el usuario.',
    });
  }
});

router.patch('/users/:id', requireAuth, requirePermissions(['SETTINGS_MANAGE']), async (req: ApiRequest, res) => {
  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ success: false, message: 'Id inválido.' });
  }

  const parsed = userUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Datos inválidos.', errors: parsed.error.flatten() });
  }

  try {
    const updated = await updateUser(req.authUser, { id, ...parsed.data });
    return res.json({ success: true, message: 'Usuario actualizado.', data: updated });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'No fue posible actualizar el usuario.',
    });
  }
});

router.patch('/users/:id/password', requireAuth, requirePermissions(['SETTINGS_MANAGE']), async (req: ApiRequest, res) => {
  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ success: false, message: 'Id inválido.' });
  }

  const parsed = userPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Datos inválidos.', errors: parsed.error.flatten() });
  }

  try {
    await updateUserPassword(req.authUser, { id, password: parsed.data.password });
    return res.json({ success: true, message: 'Contraseña actualizada.', data: { success: true } });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'No fue posible actualizar la contraseña.',
    });
  }
});

router.post('/orders', requireAuth, requirePermissions(['POS_USE'], true), async (req: ApiRequest, res) => {
  try {
    if (req.authUser.permissions.includes('KIOSK_ONLY')) {
      const payload = z.object({
        type: z.enum(['DINE_IN', 'TAKE_OUT']),
        kioskKey: kioskKeySchema.optional(),
        tableId: z.number().int().positive().optional(),
        customer: z.object({ name: z.string().trim().min(1).max(150), phone: z.string().max(40).optional() }).optional(),
        items: z.array(z.object({ productId: z.number().int().positive(), quantity: z.number().int().positive().max(999), notes: z.string().max(2000).optional() })).min(1).max(200),
      }).parse(req.body);
      if ((payload.type === 'DINE_IN') !== Boolean(payload.tableId)) throw new Error('Selección de mesa inválida.');
      req.body = { ...payload, channel: 'Kiosko autoservicio' };
    }
    const createdOrder = await createOrderForUser(req.authUser, req.body);

    res.status(201).json({
      success: true,
      message: 'Pedido registrado correctamente.',
      data: createdOrder,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'No fue posible registrar el pedido.',
    });
  }
});

export default router;
