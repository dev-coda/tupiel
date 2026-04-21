export function ipMoney(v: number): string {
  return '$' + Number(v).toLocaleString('es-CO');
}

export function ipDateShort(v: string): string {
  return new Date(v + 'T00:00:00').toLocaleDateString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function ipDiasDesde(v: string): number {
  return Math.floor((Date.now() - new Date(v + 'T00:00:00').getTime()) / 86400000);
}

export function ipIniciales(nombre: string): string {
  return nombre
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
}

export function ipDateLong(v: string): string {
  return new Date(v + 'T00:00:00').toLocaleDateString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function ipDateMed(v: string): string {
  return new Date(v + 'T00:00:00').toLocaleDateString('es-CO', {
    day: '2-digit',
    month: 'short',
  });
}
