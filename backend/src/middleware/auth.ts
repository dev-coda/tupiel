import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'tupiel-jwt-secret-2025';

export type InteligenciaRol = 'admin' | 'operario';

export interface AuthPayload {
  id: number;
  username: string;
  /** Inteligencia de Pacientes role; omitted in legacy JWTs (treat as operario). */
  ipRol?: InteligenciaRol;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

/**
 * Middleware that verifies JWT token from Authorization header.
 * Blocks unauthenticated requests with 401.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthPayload;
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Only Inteligencia admins (ip_rol = admin) may manage CRM users. Use after requireAuth.
 */
export function requireInteligenciaAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  if (req.user.ipRol !== 'admin') {
    res.status(403).json({ error: 'Se requiere rol administrador de Inteligencia' });
    return;
  }
  next();
}

/**
 * Generate a JWT token for a user.
 */
export function generateToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}
