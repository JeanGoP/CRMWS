# 054 — Preparación del negocio en la guía

**Carril:** ligero; documento registrado después de iniciar la corrección de una guía que seguía viéndose igual.

## Problema

La guía conserva cinco pasos técnicos y no deja ver las tareas de salida a producción que se prepararon para el consultorio. Cuando hay dos canales seleccionados, dice «pendiente» sin mostrar cuál falta. Puede decir que el agente ya atiende aunque un canal siga pendiente.

## Comportamiento verificable

1. El paso de canales indica el canal concreto desconectado y lleva a su configuración. Cuando ambos faltan, lleva a Ajustes → Canales.
2. En instalaciones con Agenda, la guía añade una sección «Preparación de tu negocio» con estado del aviso de datos y del recordatorio de 24 horas. También muestra si se completó alguna prueba del Laboratorio.
3. Las recomendaciones adicionales no cuentan en los cinco pasos necesarios, no bloquean la Bandeja y no activan nada automáticamente.
4. Cuando el agente está encendido pero falta un canal, la tarjeta final lo explica sin afirmar que todos los canales atienden.

## Fuera de alcance

La guía no crea un aviso legal ni activa recordatorios. El negocio debe completar esas decisiones en Agenda. No se añade un asistente obligatorio para cada organización: una instancia sigue siendo un negocio y el equipo puede configurar en el orden que necesite.
