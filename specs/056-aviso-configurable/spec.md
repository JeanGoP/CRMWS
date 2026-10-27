# 056 — Aviso de datos configurable por el negocio

## Problema

El aviso del consultorio tiene campos pendientes que hoy exigen editar código.
El responsable debe poder completarlos desde Hilora y revisar el texto antes
de entregarlo a pacientes. Los datos de salud requieren especial cuidado.

## Comportamiento observable

- Ajustes → Agenda pide nombre o razón social, NIT o documento, correo y
  teléfono para privacidad, plazo o criterio de conservación y URL HTTPS de la
  política completa. El formulario dice que nombre, documento y contactos se
  verán en la página pública cuando se publique.
- Se puede guardar un borrador incompleto. La vista previa con los datos del
  borrador exige sesión de propietario o administrador. La URL pública muestra
  la última versión publicada; si no existe, muestra un borrador sin datos
  guardados privados y con indicación clara de pendiente.
- Publicar exige todos los campos válidos y confirmación explícita de revisión.
  Al hacerlo se copia el borrador a una versión publicada y se enlaza la URL
  interna HTTPS en la configuración de Agenda. El aviso no se envía ni se toma
  como autorización del paciente.
- Editar y guardar un nuevo borrador no modifica la versión publicada ni
  desactiva recordatorios que usan un aviso ya publicado. Una nueva publicación
  actualiza el texto visible.
- La información se aísla por organización. La ruta pública usa la organización
  de esta instancia, como la marca de la pantalla de inicio. Conserva
  `noindex,nofollow` y no aparece en el menú.
- El enlace externo de aviso ya existente permanece disponible para negocios
  que alojan su política en otro sitio.

## Fuera de alcance

- Hilora no valida jurídicamente el contenido ni gestiona el consentimiento
  individual de cada paciente. Eso requiere un flujo aparte.
- No se inventan plazos de conservación ni identidad del responsable.

## Referencias y supuestos

El propietario pidió que Hilora solicite los datos; «plazo de conversación» se
interpreta como **plazo de conservación** por el contexto del borrador actual.
La dirección del consultorio (CR 68 D 1-6, Cartagena) proviene de la sesión.

- [Decreto 1377 de 2013, contenido mínimo del aviso](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=53646)
- [SIC, tratamiento de datos sensibles de salud](https://sedeelectronica.sic.gov.co/publicaciones/boletin-juridico/concepto/tratamiento-de-datos-sensibles-relativos-la-salud)
