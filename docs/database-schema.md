# TuPiel Database Schema Documentation

**Database:** MySQL 8.0.45 (DigitalOcean Managed)
**Total Tables:** 200+
**Domain:** Dermatology clinic management system (ERP/EMR)

---

## Core Domain Areas

```
1. Patients & Medical Records
2. Consultations & Procedures (CUPS)
3. Appointments (Agenda)
4. Billing & Invoicing (Facturas)
5. Cash & Payments (Caja, Transacciones)
6. Commissions (Comisiones)
7. Inventory & Products (Articulos)
8. Staff (Personal)
```

---

## 1. Patients & Medical Records

### `paciente` (~5,635 rows)
Core patient registry.

| Column | Type | Description |
|--------|------|-------------|
| id | int PK | Patient ID |
| tipo_documento | varchar | Document type (CC, TI, CE, etc.) |
| numero_documento | varchar | Document number |
| nombres | varchar | First names |
| apellidos | varchar | Last names |
| fecha_nacimiento | date | Birth date |
| genero | int | Gender (1=M, 2=F) |
| municipio_id | int FK | City (FK to municipio) |
| telefono / celular | varchar | Phone numbers |
| correo_electronico | varchar | Email |
| grupo / rh | varchar | Blood type |
| estadio_id | int FK | Skin stage (FK to estadio) |
| recomendacion_id | int FK | Referral source |

### `historia` (~7,198 rows)
Medical history per patient. One patient can have multiple historias.

| Column | Type | Description |
|--------|------|-------------|
| id | int PK | History ID |
| paciente_id | int FK | FK to paciente |
| (medical history fields) | | Antecedents, notes, etc. |

### `historia_antecedentes` (~13,963 rows)
Medical antecedents linked to historias.

### `diagnostico` (~12,387 rows)
ICD-10 diagnosis catalog (CIE-10).

| Column | Type | Description |
|--------|------|-------------|
| id | int PK | Diagnosis ID |
| codigo | varchar | ICD-10 code (e.g. A000) |
| descripcion | varchar | Diagnosis description |
| codigo_rips | varchar | RIPS code |

---

## 2. Consultations & Procedures

### `consulta` (~11,451 rows)
Medical consultations / appointments.

| Column | Type | Description |
|--------|------|-------------|
| id | int PK | Consultation ID |
| paciente_id | int FK | FK to paciente |
| personal_user_id | int FK | Doctor (FK to personal) |
| prestador_id | int FK | Healthcare provider |
| entidad_id | int FK | Insurance/entity (FK to entidad) |
| consultorio_id | int FK | Office/room |
| servicio_id | int FK | Service type |
| cups_id | int FK | CUPS procedure code |
| plan_id | int FK | Insurance plan |
| fecha | date | Consultation date |
| hora / hora_fin | time | Start/end time |
| estado | int | Status (0=pending, 1=in_progress, 2=completed, 3=cancelled) |
| valor_consulta | decimal | Consultation value |
| particular | tinyint | Private (1) vs insured (0) |
| autorizacion | varchar | Authorization number |
| facturado | tinyint | Invoiced flag |

### `consulta_cups` (~23,578 rows)
Procedures performed during a consultation (CUPS = Clasificacion Unica de Procedimientos en Salud).

| Column | Type | Description |
|--------|------|-------------|
| id | int PK | Record ID |
| consulta_id | int FK | FK to consulta |
| cups_id | int FK | FK to cups (procedure catalog) |
| personal_id | int FK | Doctor who performed it |
| fecha_realizacion | datetime | When performed |
| valor | decimal | Procedure value |
| valor_entidad | decimal | Value billed to entity/insurer |
| estado | int | Status |
| diagnostico_principal_id | int FK | Primary diagnosis |
| cantidad | int | Quantity |

### `cups` (~333 rows)
CUPS procedure catalog.

| Column | Type | Description |
|--------|------|-------------|
| id | int PK | CUPS ID |
| codigo | varchar | CUPS code (e.g. 890242) |
| descripcion | varchar | Description |
| tipo | int | Type (consultation, procedure, etc.) |
| sesiones | int | Number of sessions |

### `consulta_articulo` (~11,997 rows)
Products/supplies used during consultations.

| Column | Type | Description |
|--------|------|-------------|
| id | int PK | Record ID |
| consulta_id | int FK | FK to consulta |
| consulta_cups_id | int FK | FK to consulta_cups |
| articulo_id | int FK | FK to articulo (product) |
| cantidad | decimal | Quantity used |

### `consulta_cancelacion` (~1,005 rows)
Consultation cancellation records.

### `consulta_inatencion` (~204 rows)
No-show records.

---

## 3. Appointments / Scheduling

### `agenda` (~19,327 rows)
Appointment slots.

| Column | Type | Description |
|--------|------|-------------|
| id | int PK | Slot ID |
| fecha | date | Date |
| hora | time | Time |
| medico_id | int FK | Doctor (FK to personal) |
| consultorio_id | int FK | Room |
| consulta_id | int FK | Linked consultation (null if open) |
| fecha_registro | datetime | When registered |

---

## 4. Billing & Invoicing

### `factura` (~11,169 rows)
Invoices.

| Column | Type | Description |
|--------|------|-------------|
| id | int PK | Invoice ID |
| numero_factura | bigint | Invoice number |
| fecha_factura | datetime | Invoice date |
| empresa_id | int FK | Company |
| punto_venta_id | int FK | Point of sale |
| tercero_id | int FK | Client (FK to tercero) |
| plan_id | int FK | Plan |
| resolucion_id | int FK | Resolution |
| total_bruto | decimal | Gross total |
| total_descuento | decimal | Total discount |
| total_iva | decimal | Total tax |
| total | decimal | Final total |
| estado | int | Status |
| prestador_id | int FK | Provider |
| consulta_id | int FK | Related consultation |
| saldo | decimal | Balance due |

### `factura_actividad` (~13,349 rows)
Invoice line items (activities/procedures billed).

| Column | Type | Description |
|--------|------|-------------|
| id | int PK | Line item ID |
| factura_id | int FK | FK to factura |
| actividad_id | int FK | FK to actividad (service/product) |
| consulta_cups_id | int FK | FK to consulta_cups |
| cantidad | int | Quantity |
| precio_unitario | decimal | Unit price |
| descuento | decimal | Discount % |
| total_descuento | decimal | Discount amount |
| iva | decimal | Tax % |
| total_iva | decimal | Tax amount |
| anular | tinyint | Voided flag |

### `factura_pago` (~10,613 rows)
Invoice payments.

| Column | Type | Description |
|--------|------|-------------|
| id | int PK | Payment ID |
| factura_id | int FK | FK to factura |
| modalidad_pago_id | int FK | Payment method (cash, card, etc.) |
| valor | decimal | Amount paid |
| caja_transaccion_id | int FK | FK to caja_transaccion |
| fecha_recibido | date | Payment date |
| personal_user_id | int FK | Received by |

### `envio_factura` (~11,171 rows)
Electronic invoice submissions (DIAN).

---

## 5. Cash & Transactions

### `caja` (~1,818 rows)
Cash registers / sessions.

| Column | Type | Description |
|--------|------|-------------|
| id | int PK | Cash register ID |
| empresa_id | int FK | Company |
| personal_user_id | int FK | Operator |

### `caja_transaccion` (~20,832 rows)
Cash register transactions (income/expenses).

| Column | Type | Description |
|--------|------|-------------|
| id | int PK | Transaction ID |
| caja_id | int FK | FK to caja |
| tipo | int | Type (1=income, 2=expense) |
| concepto_id | int FK | Concept |
| tercero_id | int FK | Third party |
| valor | decimal | Amount |
| modalidad_pago_id | int FK | Payment method |
| transaccion_contable_id | int FK | Accounting transaction |

### `transaccion_contable` (~19,292 rows)
Accounting journal entries.

### `transaccion` (~15,675 rows)
Inventory transactions (stock in/out).

---

## 6. Commissions

### `comision` (~239 rows)
Commission batches paid to staff.

| Column | Type | Description |
|--------|------|-------------|
| id | int PK | Commission ID |
| fecha_registro | datetime | Date |
| valor_base | decimal | Base amount |
| valor | decimal | Commission amount |
| costo | decimal | Cost |
| comision_user_id | int FK | Staff receiving commission |
| registra_user_id | int FK | Registered by |

### `comision_consulta_cups` (~18,250 rows)
Commission details per procedure.

| Column | Type | Description |
|--------|------|-------------|
| id | int PK | ID |
| consulta_cups_id | int FK | FK to consulta_cups |
| factura_actividad_id | int FK | FK to factura_actividad |
| comision_id | int FK | FK to comision |

### `personal_comision` (~434 rows)
Commission rules per staff member.

---

## 7. Reference / Lookup Tables

### `entidad` (~39 rows)
Insurance companies / entities (EPS, prepaid medicine).

| Key Entities | Description |
|---|---|
| PARTICULAR | Self-pay patients |
| SALUD COOMEVA | Prepaid medicine |
| EPS SOS | Health insurance |

### `actividad` (~309 rows)
Billable services/activities catalog.

### `personal` (~78 rows)
Staff members (doctors, admins, etc.).

| Column | Type | Description |
|--------|------|-------------|
| user_id | int PK | User ID |
| nombre | varchar | Full name |
| cargo | varchar | Role/title |
| tipo_documento / numero_documento | varchar | ID document |
| especialidad | varchar | Medical specialty |
| registro_medico | varchar | Medical license number |

### `tercero` (~4,588 rows)
Third parties (clients, suppliers, insurers).

### `modalidad_pago` (~9 rows)
Payment methods: EFECTIVO, ANTICIPADO, CONSIGNACION, TARJETA, etc.

### `municipio` (~1,125 rows) / `departamento` (~33 rows) / `pais` (~249 rows)
Geographic catalogs (Colombian cities, departments, countries).

### `consultorio` (~6 rows)
Physical rooms/offices.

### `servicio` (~2 rows)
Service categories: CONSULTA EXTERNA, CAJA.

---

## Key Relationships (ERD Summary)

```
paciente (1) ─── (N) historia
paciente (1) ─── (N) consulta
consulta (1) ─── (N) consulta_cups         (procedures per visit)
consulta (1) ─── (N) consulta_articulo     (products used)
consulta (1) ─── (1) agenda                (appointment slot)
consulta (N) ─── (1) personal              (doctor)
consulta (N) ─── (1) entidad               (insurer)
consulta_cups (1) ─ (N) comision_consulta_cups (commissions)
factura (1) ─── (N) factura_actividad      (line items)
factura (1) ─── (N) factura_pago           (payments)
factura_actividad (N) ─ (1) consulta_cups  (procedure billed)
caja (1) ─── (N) caja_transaccion         (cash movements)
comision (1) ─── (N) comision_consulta_cups (detail)
comision (N) ─── (1) personal              (staff paid)
```

---

## Potential Report Domains

1. **Revenue / Sales**: factura + factura_actividad + factura_pago (by date, doctor, entity, payment method)
2. **Doctor Productivity**: consulta + consulta_cups + personal (procedures per doctor per period)
3. **Patient Analytics**: paciente + consulta (new vs returning, demographics, top diagnoses)
4. **Commissions**: comision + comision_consulta_cups (commissions per doctor per period)
5. **Appointments**: agenda (utilization, no-shows, cancellations)
6. **Accounts Receivable**: factura where saldo > 0 (unpaid invoices by entity)
7. **Inventory**: transaccion + articulo + consulta_articulo (stock movements, consumption)
8. **Cash Flow**: caja_transaccion (daily cash register summary)
