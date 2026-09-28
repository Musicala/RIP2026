# Activación automática de planes Wix

`activateWixSubscriptions` se ejecuta al crear un documento en
`clientesB2C`. El pago y las filas de RIP ya existen antes de la llamada a
Wix; por eso un problema externo nunca borra ni bloquea el registro del pago.

## Despliegue inicial

1. Cambia el proyecto `rip-musicala` al plan Blaze y configura una alerta de
   presupuesto en Google Cloud/Firebase.
2. Desde la raíz de este repositorio ejecuta `firebase login` si la sesión no
   está activa.
3. Guarda la llave sin añadirla a ningún archivo:

   ```powershell
   firebase functions:secrets:set WIX_API_KEY --project rip-musicala
   ```

   Cuando la consola solicite el valor, pégalo allí y pulsa Enter. Nunca lo
   pegues en este repositorio ni en una pantalla de RIP.
4. Instala y despliega:

   ```powershell
   npm install --prefix functions
   firebase deploy --project rip-musicala --only functions:activateWixSubscriptions,firestore:rules
   ```

## Operación

La función usa primero el correo Wix digitado en el pago. Si está vacío, lo
toma de la ficha relacionada del estudiante (`wixEmail`, `email` o `emails`).
Luego busca el miembro, localiza un plan cuyo nombre coincide exactamente con
el servicio de RIP y crea una orden offline marcada como pagada.

El resultado queda en `clientesB2C/{pagoId}.wixActivation`:

- `active`: todos los planes fueron activados.
- `partial`: al menos un usuario se activó y otro necesita revisión.
- `failed`: no se activó ningún usuario; RIP conserva el pago.

Al encontrar un servicio por primera vez, se guarda su `planId` en
`wixPlanMappings`. Esto evita depender de búsquedas posteriores y permite
corregir explícitamente una equivalencia no exacta desde Firestore.

La función nunca reintenta automáticamente una activación fallida. Es una
protección contra suscripciones duplicadas: Wix no ofrece una clave de
idempotencia para esta operación.
