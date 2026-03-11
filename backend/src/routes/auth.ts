import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { appQuery } from '../config/app-database';
import { generateToken, requireAuth } from '../middleware/auth';

const router = Router();

/**
 * POST /api/auth/login
 * Body: { username, password }
 * Returns: { token, user: { id, username, name } }
 */
router.post('/login', async (req: Request, res: Response) => {
  const { username, password } = req.body;

  if (!username || !password) {
    res.status(400).json({ error: 'Username and password are required' });
    return;
  }

  try {
    const { rows } = await appQuery(
      'SELECT id, username, name, password_hash FROM users WHERE username = ?',
      [username]
    );

    if (!rows || rows.length === 0) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const user = rows[0] as { id: number; username: string; name: string; password_hash: string };
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const token = generateToken({ id: user.id, username: user.username });

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Login error:', msg);
    res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * GET /api/auth/me
 * Returns the current authenticated user's info.
 */
router.get('/me', requireAuth, async (req: Request, res: Response) => {
  try {
    const { rows } = await appQuery(
      'SELECT id, username, name FROM users WHERE id = ?',
      [req.user!.id]
    );

    if (!rows || rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const user = rows[0] as { id: number; username: string; name: string };
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get user info' });
  }
});

export default router;
