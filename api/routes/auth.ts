import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, signAccessToken, type ApiRequest } from '../lib/auth.js';
import { findAuthUserByEmail, getDemoAccounts, getSafeCurrentUser, sanitizeSessionUser } from '../services/restaurant-service.js';

const router = Router();

const loginSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  password: z.string().trim().min(8),
});

router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: 'Credenciales invalidas.',
      errors: parsed.error.flatten(),
    });
  }

  try {
    const user = await findAuthUserByEmail(parsed.data.email);

    if (!user || !bcrypt.compareSync(parsed.data.password, user.passwordHash)) {
      return res.status(401).json({
        success: false,
        message: 'Correo o contrasena incorrectos.',
      });
    }

    return res.json({
      success: true,
      message: 'Sesion iniciada correctamente.',
      data: {
        accessToken: signAccessToken(user),
        user: sanitizeSessionUser(user),
        demoAccounts: getDemoAccounts(),
      },
    });
  } catch (error) {
    console.error('login failed', error);
    return res.status(500).json({
      success: false,
      message:
        error instanceof Error
          ? error.message
          : 'No fue posible iniciar sesion. Verifica que la base de datos este disponible.',
    });
  }
});

router.get('/me', requireAuth, async (req: ApiRequest, res) => {
  const currentUser = await getSafeCurrentUser(req.authUser.id);

  return res.json({
    success: true,
    data: currentUser,
  });
});

router.get('/demo-accounts', (_req, res) => {
  return res.json({
    success: true,
    data: getDemoAccounts(),
  });
});

router.post('/logout', (_req, res) => {
  return res.json({
    success: true,
    message: 'Sesion cerrada.',
  });
});

export default router;
