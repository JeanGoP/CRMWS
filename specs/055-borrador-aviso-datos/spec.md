# 055 — Borrador de aviso de tratamiento de datos

## Problema

El consultorio quiere redactar y revisar un aviso de tratamiento de datos en el
mismo dominio de Hilora antes de contar con la identidad y contacto definitivos
del responsable. Las citas pueden involucrar información de salud, que es dato
sensible. El enlace todavía no puede presentarse como un aviso aprobado.

## Comportamiento observable

- Existe una página pública HTTPS en `/aviso-datos`, accesible directamente por
  enlace y ausente del menú público y del menú principal. Pide a buscadores que
  no la indexen; el enlace no se considera secreto ni control de acceso.
- La página muestra un borrador en español para un consultorio psicológico de
  Cartagena: finalidades, datos tratados, carácter facultativo de los datos
  sensibles, derechos, canales para consultas y referencia a la política
  completa. Los datos desconocidos aparecen señalados como pendientes.
- La página deja visible que el texto no está aprobado ni se debe presentar
  como autorización del paciente. Un enlace de revisión aparece en Ajustes →
  Agenda y en la guía para el propietario.
- La URL no se guarda automáticamente como `privacyNoticeUrl` y el estado de
  recordatorios no cambia.

## Fuera de alcance

- No se inventa el nombre, documento, correo, teléfono, plazo de conservación
  ni política completa del responsable. Faltan datos del negocio y su revisión.
- No se crea un mecanismo de consentimiento ni se entrega automáticamente el
  aviso a pacientes. Esas acciones requieren un flujo de autorización aparte.

## Decisión pendiente

El propietario eligió **borrador por ahora**. Debe proporcionar la identidad y
contacto del responsable y aprobar el texto antes de usar el enlace con
pacientes. El aviso de privacidad no sustituye la política completa ni la
autorización que corresponda al tratar datos sensibles.

Referencias: [Ley 1581 de 2012](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=49981),
[Decreto 1377 de 2013](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=53646),
[criterio SIC sobre datos de salud](https://sedeelectronica.sic.gov.co/publicaciones/boletin-juridico/concepto/tratamiento-de-datos-sensibles-relativos-la-salud).
