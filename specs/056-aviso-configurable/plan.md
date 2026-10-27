# Plan

1. Añadir una tabla por organización con borrador JSON, versión publicada JSON
   y fecha de publicación. Migración aditiva; los avisos externos existentes
   permanecen en `calendar_settings`.
2. Exponer GET/PUT autenticados para leer y guardar el borrador, y POST
   autenticado para publicar tras validar los seis campos y la confirmación.
3. Mostrar la versión publicada en `/aviso-datos`; ofrecer vista previa
   autenticada del borrador y conservar el texto de ejemplo sin valores privados
   cuando aún no hay versión publicada.
4. Integrar formulario en Ajustes → Agenda. Probar aislamiento, validación,
   publicación y renderización; ejecutar typecheck, lint, tests y build.

## Riesgos

- El documento y los contactos pasan a ser públicos al publicar. El formulario
  debe avisarlo y la publicación requiere una acción expresa.
- Una edición no debe cambiar silenciosamente el aviso ya comunicado a
  pacientes. Se mantienen borrador y versión publicada separados.
