# Cambios de datos

`calendar_settings`: `privacy_notice_url` nullable; `reminder_enabled` booleano, falso por defecto; `reminder_template_id` nullable. El identificador de plantilla se valida por organización al activar.

`booking`: `reminder_attempted_at`, `reminder_sent_at`, `reminder_error`, todos nullable. Los valores iniciales nulos hacen que el despliegue sea compatible con citas existentes. La reprogramación vuelve a ponerlos en null.

No se guardan diagnósticos ni motivos clínicos en los recordatorios.
