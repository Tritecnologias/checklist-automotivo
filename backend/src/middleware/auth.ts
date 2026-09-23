import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export const JWT_SECRET = process.env.JWT_SECRET ?? 'checklist-jwt-secret-change-in-prod';

export interface JwtPayload {
  userId: number;
  email: string;
  role: 'owner' | 'manager' | 'operator';
  tenantId: number | null;
  tenantIds: number[];
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ message: 'Token de autenticação obrigatório' });
    return;
  }
  try {
    const token = header.slice(7);
    req.user = jwt.verify(token, JWT_SECRET) as JwtPayload;
    next();
  } catch {
    res.status(401).json({ message: 'Token inválido ou expirado' });
  }
}

export function requireRole(...roles: JwtPayload['role'][]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ message: 'Permissão insuficiente' });
      return;
    }
    next();
  };
}

/** Retorna os tenant IDs que o usuário pode acessar.
 *  owner → null (sem filtro)
 *  outros → array de IDs permitidos
 */
export function allowedTenants(user: JwtPayload): number[] | null {
  if (user.role === 'owner') return null;
  return user.tenantIds;
}
