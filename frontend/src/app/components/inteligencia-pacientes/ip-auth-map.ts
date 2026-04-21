import { UserInfo } from '../../services/auth.service';
import { IpUser } from './ip.models';

/** Map TuPiel AuthService user into the shape expected by Inteligencia de Pacientes views. */
export function mapAuthUserToIpUser(u: UserInfo): IpUser {
  const parts = u.name.trim().split(/\s+/).filter(Boolean);
  const initials =
    parts
      .slice(0, 2)
      .map((p) => p[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || '??';
  const un = u.username.toLowerCase();
  const isAdmin =
    u.ipRol === 'admin' || (u.ipRol == null && un === 'admin');
  const cargo =
    (u.ipCargo && String(u.ipCargo).trim()) ||
    (isAdmin ? 'Administrador' : 'Usuario');
  return {
    username: u.username,
    nombre: u.name,
    rol: isAdmin ? 'admin' : 'operario',
    avatar: initials,
    cargo,
  };
}
