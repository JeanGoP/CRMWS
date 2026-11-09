# 053 - Cartera configurable

## Objetivo

Cada negocio puede preparar en Hilora una conexión de solo lectura a su API de cartera, sus reglas de contacto y sus instrucciones de pago. La configuración es propia de la organización, empieza apagada y no inicia cobros por guardarse.

## Contrato recibido

`POST /api/ObtenerCarteraFianncieraIden?token=...` con `Identificacion` y `Fecha` (corte). La respuesta contiene `Error`, `Mensaje` y `Resultado[]`. Cada fila tiene `iden`, `cliente`, `celular`, `numfactura`, `cuota`, `vencimiento_cuota`, `dias` y las columnas `PorVencer`, `Treinta_Dias`, `sesenta_Dias`, `noventa_Dias`, `Mas_de_Noventa`. El saldo pendiente de la fila es la suma de esas cinco columnas. Una fila con saldo positivo está pendiente. `fechafac` puede ser un valor centinela y no gobierna la cobranza.

## Primer alcance

- Ajustes → Cartera, visible con `CARTERA=on`, con URL de API, token cifrado, valor de identificación usado para consulta completa y fecha de corte de prueba.
- Reglas editables de monto y antigüedad, horario, frecuencia máxima, canal, plantilla de WhatsApp, tono, escalamiento y verificación de identidad.
- Datos de pago de la empresa, editables. No se inventan números de cuenta, enlaces ni referencias.
- Guardar borrador y probar la consulta de solo lectura. La prueba devuelve únicamente conteos y totales; no devuelve identificaciones ni teléfonos.
- No hay envíos automáticos ni acceso del bot a deuda hasta validar la API real, el mecanismo de identidad y la autorización del canal. La UI debe decirlo expresamente.

## Pendiente para activar cobranza

- Confirmar cómo se solicita la cartera completa y la paginación, si existe.
- Confirmar manejo de pagos parciales, errores y saldo cero en la API.
- Implementar emparejamiento seguro del teléfono, verificación del titular, plantillas aprobadas, exclusiones, cola idempotente, vista previa y auditoría de envíos; verificar con datos ficticios antes de producción.

## Revisión constitucional

- I/III: credencial cifrada, ninguna respuesta de prueba revela datos de clientes, consultas delimitadas por `organization_id`.
- II: conector opcional tras `CARTERA=on`; el CRM funciona igual apagado y el proveedor está aislado tras un adaptador.
- IV: este primer alcance no recibe webhooks ni genera envíos. La futura cola requerirá claves de idempotencia.
- VII: los supuestos y pendientes se documentan aquí.
- VIII: mensajes individuales de cartera del negocio, sin envío masivo genérico.
- IX: prueba local de la interfaz y del camino de API con mock, incluyendo error; ninguna conexión real sin credencial del negocio.
