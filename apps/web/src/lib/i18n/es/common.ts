/**
 * Words on many staff screens: navigation, menus, buttons, days.
 *
 * Glossary, to keep every screen saying the same thing:
 * clock in / out — marcar entrada / salida · shift — turno · schedule —
 * horario · timesheet — hoja de horas · time off — tiempo libre · PTO — PTO
 * (días pagados) · sick — enfermedad · office — oficina · job role — puesto ·
 * availability — disponibilidad · work from home — trabajo desde casa ·
 * on call — de guardia · manager — gerente · Home — Inicio · Directory —
 * Directorio · Resources — Recursos · News — Noticias · survey — encuesta ·
 * suggestion box — buzón de sugerencias · profile — perfil · tablet PIN —
 * PIN de la tableta · bell — campana · draft — borrador · published —
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
  'Skip to content': 'Ir al contenido',
  'Your profile': 'Tu perfil',
  'Sign out': 'Cerrar sesión',
  'Change password': 'Cambiar contraseña',
  'Your licenses': 'Tus licencias',
  'Your onboarding': 'Tu incorporación',
  'Your productivity': 'Tu productividad',
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
