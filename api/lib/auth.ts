import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import type { AuthUser, PermissionCode, RoleCode } from '../types.js';
import { findAuthUserById, sanitizeSessionUser } from '../services/restaurant-service.js';

const JWT_SECRET = process.env.JWT_SECRET || 'restaurante-gt-dev-secret';

export type AuthPayload = {
  sub: number;
  tenantId: number;
  branchId: number;
  role: RoleCode;
  permissions: PermissionCode[];
};

export type ApiRequest = Request & {
  authUser?: Awaited<ReturnType<typeof findAuthUserById>> extends infer T
    ? T extends null
      ? never
      : ReturnType<typeof sanitizeSessionUser>
    : never;
  authJwt?: AuthPayload;
};

export function signAccessToken(user: AuthUser) {
  return jwt.sign(
    {
      sub: user.id,
      tenantId: user.tenantId,
      branchId: user.branchId,
      role: user.role,
      permissions: user.permissions,
    } satisfies AuthPayload,
    JWT_SECRET,
    { expiresIn: '8h' },
  );
}

export function verifyAccessToken(token: string) {
  return jwt.verify(token, JWT_SECRET) as unknown as AuthPayload;
}

/** Valida JWT sin consultar la base (necesario mientras una restauración vacía las tablas). */
export function requireAuthJwt(req: ApiRequest, res: Response, next: NextFunction) {
  const authorization = req.headers.authorization;

  if (!authorization?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Token no proporcionado.' });
  }

  try {
    const token = authorization.replace('Bearer ', '');
    req.authJwt = verifyAccessToken(token);
    return next();
  } catch {
    return res.status(401).json({ success: false, message: 'Token expirado o invalido.' });
  }
}

export async function requireAuth(req: ApiRequest, res: Response, next: NextFunction) {
  const authorization = req.headers.authorization;

  if (!authorization?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Token no proporcionado.' });
  }

  try {
    const token = authorization.replace('Bearer ', '');
    const payload = verifyAccessToken(token);
    const user = await findAuthUserById(payload.sub);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Sesion no valida. Cierre sesion e ingrese de nuevo (comun despues de restaurar un respaldo).',
      });
    }

    req.authUser = sanitizeSessionUser(user);
    if (user.permissions.includes('KIOSK_ONLY')) {
      const route = `${req.method} ${req.baseUrl}${req.route.path}`;
      if (!kioskRoutes.has(route)) {
        return res.status(403).json({ success: false, message: 'Cuenta exclusiva de autoservicio.' });
      }
    }
    return next();
  } catch {
    return res.status(401).json({ success: false, message: 'Token expirado o invalido.' });
  }
}

const kioskRoutes = new Set([
  'GET /api/auth/me', 'GET /api/v1/bootstrap',
  'POST /api/v1/orders', 'PUT /api/v1/tables/:tableId/reservation',
]);

export function requirePermissions(permissions: PermissionCode[], allowKiosk = false) {
  return (req: ApiRequest, res: Response, next: NextFunction) => {
    const currentPermissions = req.authUser?.permissions ?? [];
    const hasAccess = currentPermissions.includes('KIOSK_ONLY')
      ? allowKiosk
      : permissions.every((permission) => currentPermissions.includes(permission));

    if (!hasAccess) {
      return res.status(403).json({ success: false, message: 'No tienes permisos para esta accion.' });
    }

    return next();
  };
}
