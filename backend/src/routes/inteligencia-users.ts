import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { appQuery } from '../config/app-database';

const router = Router();

type Row = {
  id: number;
  username: string;
  name: string;
  ip_rol: string;
  ip_cargo: string | null;
};

function mapUser(r: Row) {
  return {
    id: r.id,
    username: r.username,
    name: r.name,
    ipRol: r.ip_rol === 'admin' ? 'admin' : 'operario',
    ipCargo: r.ip_cargo ?? '',
  };
}

/** GET / — list CRM users (no passwords) */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const { rows } = await appQuery(
      `SELECT id, username, name, ip_rol, ip_cargo FROM users ORDER BY username ASC`
    );
    const list = (rows as Row[]).map(mapUser);
    res.json({ users: list });
  } catch (err) {
    console.error('inteligencia-users list:', err);
    res.status(500).json({ error: 'No se pudo listar usuarios' });
  }
});

/** POST / — create user */
router.post('/', async (req: Request, res: Response) => {
  const { username, name, password, ipRol, ipCargo } = req.body ?? {};
  const u = typeof username === 'string' ? username.trim() : '';
  const n = typeof name === 'string' ? name.trim() : '';
  const pwd = typeof password === 'string' ? password : '';
  const rol = ipRol === 'admin' ? 'admin' : 'operario';
  const cargo =
    typeof ipCargo === 'string' ? ipCargo.trim() : ipCargo == null ? '' : String(ipCargo);

  if (!u || !n) {
    res.status(400).json({ error: 'Usuario y nombre son obligatorios' });
    return;
  }
  if (pwd.length < 6) {
    res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    return;
  }

  try {
    const { rows: dup } = await appQuery('SELECT id FROM users WHERE username = ?', [u]);
    if (dup.length > 0) {
      res.status(409).json({ error: 'Ese nombre de usuario ya existe' });
      return;
    }

    const hash = await bcrypt.hash(pwd, 10);
    const displayCargo =
      cargo ||
      (rol === 'admin' ? 'Administrador' : 'Usuario');

    await appQuery(
      `INSERT INTO users (username, name, password_hash, ip_rol, ip_cargo) VALUES (?, ?, ?, ?, ?)`,
      [u, n, hash, rol, displayCargo || null]
    );

    const { rows } = await appQuery(
      `SELECT id, username, name, ip_rol, ip_cargo FROM users WHERE username = ?`,
      [u]
    );
    const row = rows[0] as Row;
    res.status(201).json({ user: mapUser(row) });
  } catch (err) {
    console.error('inteligencia-users create:', err);
    res.status(500).json({ error: 'No se pudo crear el usuario' });
  }
});

/** PATCH /:id — update user */
router.patch('/:id', async (req: Request, res: Response) => {
  const rawId = req.params['id'];
  const id = parseInt(Array.isArray(rawId) ? rawId[0] : rawId, 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: 'ID inválido' });
    return;
  }

  const body = req.body ?? {};
  const name = body.name !== undefined ? String(body.name).trim() : undefined;
  const ipRol = body.ipRol;
  const ipCargo = body.ipCargo;
  const password = body.password;

  try {
    const { rows: curRows } = await appQuery(
      `SELECT id, username, name, ip_rol, ip_cargo FROM users WHERE id = ?`,
      [id]
    );
    if (curRows.length === 0) {
      res.status(404).json({ error: 'Usuario no encontrado' });
      return;
    }
    const current = curRows[0] as Row;

    const nextName = name !== undefined ? name : current.name;
    const nextRol: 'admin' | 'operario' =
      ipRol === 'admin' || ipRol === 'operario'
        ? ipRol
        : current.ip_rol === 'admin'
          ? 'admin'
          : 'operario';
    let nextCargo: string | null =
      ipCargo !== undefined
        ? String(ipCargo).trim() || null
        : current.ip_cargo;

    if (nextCargo == null || nextCargo === '') {
      nextCargo = nextRol === 'admin' ? 'Administrador' : 'Usuario';
    }

    if (current.ip_rol === 'admin' && nextRol === 'operario') {
      const { rows: ac } = await appQuery(
        `SELECT COUNT(*) AS c FROM users WHERE ip_rol = 'admin'`
      );
      const adminCount = (ac[0] as { c: number }).c;
      if (adminCount <= 1) {
        res.status(400).json({ error: 'Debe existir al menos un administrador de Inteligencia' });
        return;
      }
    }

    const pwd = password !== undefined ? String(password) : '';
    if (pwd !== '') {
      if (pwd.length < 6) {
        res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
        return;
      }
      const hash = await bcrypt.hash(pwd, 10);
      await appQuery(
        `UPDATE users SET name = ?, ip_rol = ?, ip_cargo = ?, password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [nextName, nextRol, nextCargo, hash, id]
      );
    } else {
      await appQuery(
        `UPDATE users SET name = ?, ip_rol = ?, ip_cargo = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [nextName, nextRol, nextCargo, id]
      );
    }

    const { rows } = await appQuery(
      `SELECT id, username, name, ip_rol, ip_cargo FROM users WHERE id = ?`,
      [id]
    );
    res.json({ user: mapUser(rows[0] as Row) });
  } catch (err) {
    console.error('inteligencia-users patch:', err);
    res.status(500).json({ error: 'No se pudo actualizar el usuario' });
  }
});

/** DELETE /:id */
router.delete('/:id', async (req: Request, res: Response) => {
  const rawId = req.params['id'];
  const id = parseInt(Array.isArray(rawId) ? rawId[0] : rawId, 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: 'ID inválido' });
    return;
  }

  if (id === req.user!.id) {
    res.status(400).json({ error: 'No puede eliminar su propio usuario' });
    return;
  }

  try {
    const { rows: curRows } = await appQuery(`SELECT id, ip_rol FROM users WHERE id = ?`, [id]);
    if (curRows.length === 0) {
      res.status(404).json({ error: 'Usuario no encontrado' });
      return;
    }
    const cur = curRows[0] as { id: number; ip_rol: string };
    if (cur.ip_rol === 'admin') {
      const { rows: ac } = await appQuery(`SELECT COUNT(*) AS c FROM users WHERE ip_rol = 'admin'`);
      if ((ac[0] as { c: number }).c <= 1) {
        res.status(400).json({ error: 'No puede eliminar el único administrador de Inteligencia' });
        return;
      }
    }

    await appQuery(`DELETE FROM users WHERE id = ?`, [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('inteligencia-users delete:', err);
    res.status(500).json({ error: 'No se pudo eliminar el usuario' });
  }
});

export default router;
