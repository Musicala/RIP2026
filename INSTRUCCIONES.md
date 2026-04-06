# RIP 2026 — Instrucciones de implementación

## Archivos entregados

| Archivo | Tipo | Para qué |
|---|---|---|
| `ui.dashboard.js` | Reemplazo | "Por revisar" dividido por sub-estados |
| `ui.table.js` | Reemplazo | Filtros acumulativos (servicios + profes según estudiante) |
| `ui.editor.js` | **Nuevo módulo** | Edición del registro 2026 desde la UI |
| `rip.editor.gs` | **Apps Script** | Backend de edición (escribe en el Sheet) |
| `rip.programacion.gs` | **Apps Script** | Backend de programación (lee/escribe fechas en el Sheet) |

---

## 1. Por revisar dividido por sub-estado

**Archivo:** `ui.dashboard.js` (reemplaza el actual)

Ahora el dashboard de Clasificación muestra:
- 🟦 Activos netos — igual que antes
- 🟨 Por cada sub-estado ("Sin registro (8-15 días)", "En pausa (15-30 días)", etc.) → **una tarjeta separada**
- Si solo hay 1 sub-estado: una sola tarjeta directa
- Si hay varios: tarjeta resumen total + tarjetas por sub-estado
- ⬛ Inactivos — igual que antes

**Ajuste si tus clasificaciones tienen nombres distintos:** edita la función `getPorRevisarSubLabel()` al tope del archivo.

---

## 2. Filtros acumulativos

**Archivo:** `ui.table.js` (reemplaza el actual)

**Comportamiento nuevo:**
- Al escribir/seleccionar un estudiante → el desplegable de **Servicios** muestra solo sus servicios y el de **Profesores** solo sus profesores
- Al borrar el estudiante → ambos listas vuelven al universo completo
- Todos los filtros siguen siendo acumulativos entre sí (AND)
- Los filtros de servicio y profesor también funcionan solos sin estudiante

---

## 3. Edición del registro (ui.editor.js + rip.editor.gs)

### Paso A: Despliega el Apps Script

1. Abre tu Google Spreadsheet → **Extensiones → Apps Script**
2. Crea un archivo nuevo llamado `rip.editor.gs`
3. Pega el contenido de `rip.editor.gs`
4. Configura las constantes:
   ```javascript
   const SPREADSHEET_ID = ''; // vacío = hoja activa
   const SHEET_NAME = 'Registro 2026'; // nombre exacto de tu hoja
   const TOKEN = 'MUSICALA-EDITOR-2026'; // cámbialo si quieres
   ```
5. **Despliega → Nueva implementación → App web**
   - Ejecutar como: **Yo**
   - Acceso: **Cualquier usuario**
6. Copia la URL de deployment (tipo `https://script.google.com/macros/s/...`)

### Paso B: Configura ui.editor.js

Antes del `<script src="./ui.editor.js">` en tu index.html, agrega:
```html
<script>
  window.RIP_EDITOR_API_URL = 'PEGA_AQUÍ_LA_URL_DEL_DEPLOYMENT';
  window.RIP_EDITOR_TOKEN   = 'MUSICALA-EDITOR-2026';
</script>
```

### Paso C: Carga el módulo

En `index.html`, después de `app.js`:
```html
<script src="./ui.editor.js?v=2026.5"></script>
```

### Paso D: Actívalo desde app.js

Al final de tu función `boot()` (o justo después del `RIPUI.table.init()`), agrega:
```javascript
if (RIPUI.editor) {
  RIPUI.editor.autoWireNewRowButton(ctx, state);
}
```

Y para que aparezca el botón de edición en cada fila de la tabla, al final de `applyAndRender` en tu app.js o después de cada render:
```javascript
if (RIPUI.editor) {
  RIPUI.editor.wireEditButtons(ctx, state);
}
```

**Columnas que edita:** Tipo, Estudiante, Fecha, Hora, Servicio, Profesor, Pago, Comentario, Clasificación, Clasif. pagos, Movimiento.

**Nota de seguridad:** el Apps Script escribe directamente en tu Sheet. Restringe el acceso a "Solo usuarios de tu dominio" si necesitas más seguridad.

---

## 4. Apps Script de Programación (rip.programacion.gs)

Este script conecta el cuadro interactivo de clases con el Sheet. **Si ya tienes un Apps Script de programación desplegado**, este lo reemplaza con uno más completo.

### Formato de la hoja "Programación 2026"

```
| Estudiante | Última actualización | Fecha 1 | Fecha 2 | ... | Fecha 24 |
|------------|---------------------|---------|---------|-----|----------|
| Ana García | 2026-04-01 10:30   | 2026-04-05 | 2026-04-12 | ... |
```

La hoja se **crea automáticamente** si no existe cuando se llama `getAllData`.
También puedes ejecutar la función `setupSheet()` desde el editor de Apps Script para crearla manualmente.

### Instalación

1. Abre el mismo Apps Script del spreadsheet
2. Crea un archivo nuevo `rip.programacion.gs`
3. Pega el contenido
4. Configura:
   ```javascript
   const PROG_SPREADSHEET_ID = ''; // vacío = hoja activa
   const PROG_SHEET_NAME = 'Programación 2026';
   const PROG_TOKEN = 'MUSICALA-PROGRAMACION-2026';
   ```
5. Despliega como App Web (mismas instrucciones que el editor)
6. Reemplaza `API_URL` en `rip.programacion.js` con la nueva URL

### Diferencias con lo que tenías

| Antes | Ahora |
|---|---|
| Datos de programación solo en memoria/sessionStorage | Se persisten en el Sheet "Programación 2026" |
| `saveSchedule` guardaba en... ¿dónde? | `saveSchedule` escribe directamente en el Sheet |
| `getAllData` venía de API externa | `getAllData` se calcula dinámicamente desde el Sheet |

---

## PDF con clases tomadas

El PDF actual captura lo que esté visible en pantalla (`fichaView` o el dashboard activo). Para asegurarte de que capture las clases:

1. Primero abre la ficha del estudiante (aparece la tabla de clases)
2. Luego haz clic en **📄 PDF** o **📄 PDF** del botón superior

La captura incluye todo lo visible en `fichaView`: resumen de saldo, programación y tabla de registros (clases + pagos). Si quieres **solo las clases**, agrega el filtro Tipo=Clase antes de exportar.

---

## Orden de carga en index.html (referencia)

```html
<script src="./rip.core.js?v=2026.5"></script>
<script src="./ui.shared.js?v=2026.5"></script>
<script src="./ui.dashboard.js?v=2026.5"></script>  <!-- reemplazado -->
<script src="./ui.ficha.js?v=2026.5"></script>
<script src="./ui.table.js?v=2026.5"></script>       <!-- reemplazado -->
<script src="./rip.programacion.js?v=2026.5"></script>
<script src="./app.js?v=2026.5"></script>
<script src="./ui.editor.js?v=2026.5"></script>      <!-- NUEVO -->
```
