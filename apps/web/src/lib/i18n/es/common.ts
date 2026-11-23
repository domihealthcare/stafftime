/**
 * Words on many staff screens: navigation, menus, buttons, days.
 *
 * Glossary, to keep every screen saying the same thing:
 * clock in / out - marcar entrada / salida · shift - turno · schedule -
 * horario · timesheet - hoja de horas · time off - tiempo libre · PTO - PTO
 * (días pagados) · sick - enfermedad · office - oficina · job role - puesto ·
 * availability - disponibilidad · work from home - trabajo desde casa ·
 * on call - de guardia · manager - gerente · Home - Inicio · Directory -
 * Directorio · Resources - Recursos · News - Noticias · survey - encuesta ·
 * suggestion box - buzón de sugerencias · profile - perfil · tablet PIN -
 * PIN de la tableta · bell - campana · draft - borrador · published -
 * publicado.
 */
export const COMMON: Record<string, string> = {
  // Navigation
  Home: 'Inicio',
  Schedule: 'Horario',
  Timesheet: 'Hoja de horas',
  Directory: 'Directorio',
  Resources: 'Recursos',
  Manage: 'Administrar',
  More: 'Más',
  News: 'Noticias',
  Surveys: 'Encuestas',
  Help: 'Ayuda',
  Downtime: 'Sistema caído',
  'Skip to content': 'Ir al contenido',
  'Your profile': 'Tu perfil',
  'Sign out': 'Cerrar sesión',
  'Change password': 'Cambiar contraseña',
  'Your licenses': 'Tus licencias',
  'Your onboarding': 'Tu incorporación',
  'Your productivity': 'Tu productividad',
  // Your pay (November 2026)
  'Your pay': 'Tu pago',
  'Loading your pay': 'Cargando tu pago',
  'Could not load your pay.': 'No se pudo cargar tu pago.',
  'Your pay as Domi Staff has it, and the raises you have been told about. Only you and the people who look after pay can see this. Your paycheck comes from ADP.':
    'Tu pago según Domi Staff y los aumentos de los que se te ha informado. Solo tú y las personas que se encargan de los pagos pueden ver esto. Tu cheque de pago viene de ADP.',
  Now: 'Ahora',
  Pay: 'Pago',
  Position: 'Puesto',
  'since {day}': 'desde el {day}',
  'No pay on file yet.': 'Todavía no hay pago registrado.',
  Raises: 'Aumentos',
  'No raises to show yet.': 'Todavía no hay aumentos que mostrar.',
  '{pay} an hour': '{pay} por hora',
  '{pay} a year': '{pay} al año',
  'Starts {day}': 'Empieza el {day}',
  'Since {day}': 'Desde el {day}',
  'From {name}': 'De {name}',
  'Email settings': 'Correo electrónico',
  'Practice settings': 'Ajustes de la práctica',
  Notifications: 'Notificaciones',
  'Notifications, {n} unread': 'Notificaciones, {n} sin leer',
  'Mark all read': 'Marcar todo como leído',
  'Nothing yet.': 'Nada todavía.',
  'Get these on your phone': 'Recíbelas en tu teléfono',
  'Could not load your notifications. Try again in a moment.':
    'No se pudieron cargar tus notificaciones. Inténtalo de nuevo en un momento.',
  Shifts: 'Turnos',
  Calendar: 'Calendario',
  'On call': 'De guardia',

  // Buttons and words used everywhere
  Save: 'Guardar',
  'Save changes': 'Guardar cambios',
  'Saving…': 'Guardando…',
  Cancel: 'Cancelar',
  Close: 'Cerrar',
  Edit: 'Editar',
  Remove: 'Quitar',
  Delete: 'Eliminar',
  Done: 'Hecho',
  'Loading…': 'Cargando…',
  Loading: 'Cargando',
  Previous: 'Anterior',
  Next: 'Siguiente',
  '← Previous': '← Anterior',
  'Next →': 'Siguiente →',
  'This week': 'Esta semana',
  'This month': 'Este mes',
  Today: 'Hoy',
  Tomorrow: 'Mañana',
  Yesterday: 'Ayer',
  Week: 'Semana',
  Month: 'Mes',
  'See all →': 'Ver todo →',
  'All news →': 'Todas las noticias →',
  'Something went wrong.': 'Algo salió mal.',
  'Could not reach the server. Check your connection and try again.':
    'No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.',
  'The server took too long to answer. Check whether it went through before trying again.':
    'El servidor tardó demasiado en responder. Revisa si se completó antes de intentarlo de nuevo.',
  English: 'English',
  Español: 'Español',
  Language: 'Idioma',

  // Places and kinds
  'Work from home': 'Trabajo desde casa',
  'Working from home': 'Trabajando desde casa',
  PTO: 'PTO',
  Sick: 'Enfermedad',
  Vacation: 'PTO',
  Draft: 'Borrador',
  Published: 'Publicado',
};
