/**
 * Parse Excel exports for Inteligencia de Pacientes (pacientes + agenda).
 * Header row (row 1) is matched flexibly (Spanish labels, accents ignored).
 */
import ExcelJS from 'exceljs';

function normalizeHeader(v: unknown): string {
  if (v == null) return '';
  const s = typeof v === 'object' && v !== null && 'text' in v ? String((v as { text: string }).text) : String(v);
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function strVal(v: unknown): string {
  if (v == null || v === '') return '';
  if (typeof v === 'object' && v !== null && 'text' in v) return String((v as { text: string }).text).trim();
  if (typeof v === 'object' && v !== null && 'result' in v) return String((v as { result: unknown }).result ?? '').trim();
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

function numVal(v: unknown): number {
  if (v == null || v === '') return 0;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const s = strVal(v).replace(/,/g, '').replace(/\s/g, '');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function intVal(v: unknown): number {
  return Math.round(numVal(v));
}

/** Match first column index (1-based) whose header matches any pattern. */
function findCol(
  headers: string[],
  patterns: RegExp[]
): number | undefined {
  for (let i = 1; i < headers.length; i++) {
    const h = headers[i] ?? '';
    if (!h) continue;
    for (const p of patterns) {
      if (p.test(h)) return i;
    }
  }
  return undefined;
}

function splitList(v: unknown): string[] {
  const s = strVal(v);
  if (!s) return [];
  return s
    .split(/[,;|]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export interface PacienteImportJson {
  doc: string;
  nombre: string;
  celular: string;
  edad: number;
  procedencia: string;
  valor_total: number;
  visitas: number;
  ultima: string;
  subcategorias: string[];
  profesional: string;
  historial: Array<{
    fecha: string;
    cups: string;
    subcategoria: string;
    profesional: string;
    valor: number;
  }>;
}

export async function parsePacientesExcel(buffer: Buffer): Promise<{
  pacientes: PacienteImportJson[];
  errors: string[];
}> {
  const errors: string[] = [];
  const wb = new ExcelJS.Workbook();
  // exceljs typings expect Node Buffer; multer provides a compatible Uint8Array-backed Buffer
  await wb.xlsx.load(buffer as never);
  const ws = wb.worksheets[0];
  if (!ws) {
    return { pacientes: [], errors: ['No hay hojas en el archivo'] };
  }

  const headers: string[] = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col] = normalizeHeader(cell.value);
  });

  const cDoc = findCol(headers, [/doc/, /documento/, /cedula/, /identifica/]);
  const cNombre = findCol(headers, [/nombre/, /paciente/, /name/]);
  if (!cDoc || !cNombre) {
    return {
      pacientes: [],
      errors: [
        'Fila 1: se requieren columnas reconocibles para Documento (doc, cédula, documento) y Nombre.',
      ],
    };
  }

  const cCel = findCol(headers, [/celular/, /telefono/, /tel/, /movil/, /phone/]);
  const cEdad = findCol(headers, [/edad/]);
  const cProc = findCol(headers, [/procedencia/, /origen/, /fuente/]);
  const cValor = findCol(headers, [/valor.*total/, /^valor$/, /total/]);
  const cVisitas = findCol(headers, [/visitas/, /visits/]);
  const cUltima = findCol(headers, [/ultima/, /fecha.*ultima/, /last/]);
  const cSub = findCol(headers, [/subcategor/]);
  const cProf = findCol(headers, [/profesional/, /doctor/, /dr/, /especialista/]);

  const out: PacienteImportJson[] = [];

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const doc = strVal(row.getCell(cDoc).value).replace(/\s/g, '');
    const nombre = strVal(row.getCell(cNombre).value);
    if (!doc && !nombre) continue;
    if (!doc || !nombre) {
      errors.push(`Fila ${r}: Documento y Nombre son obligatorios`);
      continue;
    }

    const celular = cCel ? strVal(row.getCell(cCel).value) : '';
    const edad = cEdad ? intVal(row.getCell(cEdad).value) : 0;
    const procedencia = cProc ? strVal(row.getCell(cProc).value) : '';
    const valor_total = cValor ? numVal(row.getCell(cValor).value) : 0;
    const visitas = cVisitas ? intVal(row.getCell(cVisitas).value) : 0;
    let ultima = cUltima ? strVal(row.getCell(cUltima).value) : '';
    const cellUlt = cUltima ? row.getCell(cUltima).value : null;
    if (cellUlt instanceof Date) ultima = cellUlt.toISOString().slice(0, 10);
    const subcategorias = cSub ? splitList(row.getCell(cSub).value) : [];
    const profesional = cProf ? strVal(row.getCell(cProf).value) : '';

    out.push({
      doc,
      nombre,
      celular,
      edad,
      procedencia: procedencia || '—',
      valor_total,
      visitas,
      ultima: ultima || new Date().toISOString().slice(0, 10),
      subcategorias,
      profesional: profesional || '—',
      historial: [],
    });
  }

  return { pacientes: out, errors };
}

export interface AgendaImportJson {
  id: number;
  fecha: string;
  hora: string;
  doc: string;
  nombre: string;
  profesional: string;
  cups: string;
  subcategoria: string;
  valor: number;
}

/** Row from Excel before DB id assignment (optional id column). */
export type AgendaImportRow = Omit<AgendaImportJson, 'id'> & { id?: number };

export async function parseAgendaExcel(buffer: Buffer): Promise<{
  citas: AgendaImportRow[];
  errors: string[];
}> {
  const errors: string[] = [];
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as never);
  const ws = wb.worksheets[0];
  if (!ws) {
    return { citas: [] as AgendaImportRow[], errors: ['No hay hojas en el archivo'] };
  }

  const headers: string[] = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col] = normalizeHeader(cell.value);
  });

  const cId = findCol(headers, [/^id$/, /#/]);
  const cFecha = findCol(headers, [/fecha/, /date/]);
  const cHora = findCol(headers, [/hora/, /time/, /hora.*cita/]);
  const cDoc = findCol(headers, [/doc/, /documento/, /cedula/]);
  const cNombre = findCol(headers, [/nombre/, /paciente/]);
  const cProf = findCol(headers, [/profesional/, /doctor/, /especialista/]);
  const cCups = findCol(headers, [/cups/, /codigo/, /código/]);
  const cSub = findCol(headers, [/subcategor/, /subcat/]);
  const cValor = findCol(headers, [/valor/, /precio/, /monto/]);

  if (!cFecha || !cHora || !cDoc || !cNombre) {
    return {
      citas: [] as AgendaImportRow[],
      errors: [
        'Fila 1: se requieren columnas Fecha, Hora, Documento y Nombre (nombres flexibles).',
      ],
    };
  }

  const citas: AgendaImportRow[] = [];

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const fechaRaw = row.getCell(cFecha).value;
    let fecha = strVal(fechaRaw);
    if (fechaRaw instanceof Date) fecha = fechaRaw.toISOString().slice(0, 10);
    const hora = strVal(row.getCell(cHora).value);
    const doc = strVal(row.getCell(cDoc).value).replace(/\s/g, '');
    const nombre = strVal(row.getCell(cNombre).value);
    if (!fecha && !hora && !doc && !nombre) continue;
    if (!fecha || !hora || !doc || !nombre) {
      errors.push(`Fila ${r}: Fecha, Hora, Documento y Nombre son obligatorios`);
      continue;
    }

    let id: number | undefined;
    if (cId) {
      const idRaw = row.getCell(cId).value;
      id = intVal(idRaw);
      if (!id) id = undefined;
    }

    const profesional = cProf ? strVal(row.getCell(cProf).value) : '—';
    const cups = cCups ? strVal(row.getCell(cCups).value) : '—';
    const subcategoria = cSub ? strVal(row.getCell(cSub).value) : '—';
    const valor = cValor ? numVal(row.getCell(cValor).value) : 0;

    citas.push({
      id,
      fecha,
      hora,
      doc,
      nombre,
      profesional,
      cups,
      subcategoria,
      valor,
    });
  }

  return { citas, errors };
}
