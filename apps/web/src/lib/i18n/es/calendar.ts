/**
 * The practice calendar (Schedule → Calendar), the events on it as staff see
 * them, the holidays and closures card and "Your calendar" (syncing to a
 * phone). The managers' forms for adding entries stay English.
 */
export const CALENDAR: Record<string, string> = {
  // The Calendar page
  'Your shifts, diagnostics, rep lunches, holidays, closures, meetings and pay days.':
    'Tus turnos, diagnósticos, almuerzos de representantes, feriados, cierres, reuniones y días de pago.',
  'Previous month': 'Mes anterior',
  'Next month': 'Mes siguiente',
  'Show as': 'Ver como',
  List: 'Lista',
  'Show office': 'Mostrar oficina',
  Print: 'Imprimir',
  'Show on the calendar': 'Mostrar en el calendario',
  'Show:': 'Mostrar:',
  'Nothing on in {month}.': 'No hay nada en {month}.',
  'Pay days appear once a pay period is set in Practice settings.':
    'Los días de pago aparecen cuando se define un período de pago en los ajustes de la práctica.',
  'Could not load the calendar.': 'No se pudo cargar el calendario.',

  // Kinds of entry (lib/calendar-kinds.ts, lib/calendar-feeds.ts)
  'My shifts': 'Mis turnos',
  'Meetings & events': 'Reuniones y eventos',
  Diagnostics: 'Diagnósticos',
  'Rep lunches': 'Almuerzos de representantes',
  Holidays: 'Feriados',
  Closures: 'Cierres',
  'Pay days': 'Días de pago',
  'Your shift': 'Tu turno',
  Event: 'Evento',
  'Diagnostics date': 'Fecha de diagnósticos',
  'Rep lunch': 'Almuerzo de representante',
  Holiday: 'Feriado',
  Closure: 'Cierre',
  'Pay day': 'Día de pago',
  'My shifts & time off': 'Mis turnos y tiempo libre',
  'Holidays & closures': 'Feriados y cierres',
  'My on call': 'Mis guardias',

  // An event's times and who it is for
  'Closed all day': 'Cerrado todo el día',
  'Closed {time}': 'Cerrado {time}',
  'closed all day': 'cerrado todo el día',
  'closed {time}': 'cerrado {time}',
  'all day': 'todo el día',
  'from {time}': 'desde {time}',
  'An office since removed': 'Una oficina que ya no existe',
  'A job role since removed': 'Un puesto que ya no existe',
  'Nobody — everyone on the list has since gone': 'Nadie — todos los de la lista ya se fueron',
  '{names} and {n} more': '{names} y {n} más',
  'for {who}': 'para {who}',
  'at {who}': 'en {who}',
  Repeats: 'Se repite',
  'Video call': 'Videollamada',

  // An event's pop-up
  When: 'Cuándo',
  Where: 'Dónde',
  At: 'En',
  For: 'Para',
  '{office} staff': 'Personal de {office}',
  Details: 'Detalles',
  'Join video call': 'Unirse a la videollamada',
  'Anybody scheduled then is flagged to managers. Pay is not changed by a closure — anybody who works clocks in as usual.':
    'Se avisa a los gerentes de cualquiera que tenga turno en ese momento. Un cierre no cambia el pago — quien trabaje marca entrada como siempre.',
  Rep: 'Representante',
  Medication: 'Medicamento',
  Lunch: 'Almuerzo',
  Cell: 'Celular',
  'Brings catering': 'Trae catering',
  'Office orders (self-order)': 'La oficina pide la comida',

  // Holidays and closures card
  'Holidays and closures': 'Feriados y cierres',
  'Previous year': 'Año anterior',
  'Next year': 'Año siguiente',
  'None in {year} yet.': 'Ninguno en {year} todavía.',
  'Open as usual': 'Abierto como siempre',

  // Your calendar (syncing to a phone)
  'Your calendar': 'Tu calendario',
  'Could not check your calendar link.': 'No se pudo revisar el enlace de tu calendario.',
  'Could not create a link.': 'No se pudo crear un enlace.',
  'Turn off calendar syncing?': '¿Desactivar la sincronización del calendario?',
  'Your shifts will disappear from any calendar subscribed to the old link.':
    'Tus turnos desaparecerán de cualquier calendario suscrito al enlace anterior.',
  'Yes, turn it off': 'Sí, desactivarla',
  'Keep syncing': 'Seguir sincronizando',
  'Could not turn that off.': 'No se pudo desactivar.',
  'Could not copy automatically — select the address and copy it.':
    'No se pudo copiar automáticamente — selecciona la dirección y cópiala.',
  'Your shifts (two weeks ahead) and practice events arrive as calendar invites to':
    'Tus turnos (con dos semanas de anticipación) y los eventos de la práctica llegan como invitaciones de calendario a',
  '— accept them if your calendar asks.': '— acéptalas si tu calendario lo pide.',
  'Syncing is on for office closures and your approved time off.':
    'La sincronización está activada para los cierres de oficina y tu tiempo libre aprobado.',
  'Office closures and your approved time off can go in your calendar too.':
    'Los cierres de oficina y tu tiempo libre aprobado también pueden ir en tu calendario.',
  'Syncing is on. Your shifts, approved time off and practice events appear in your own calendar.':
    'La sincronización está activada. Tus turnos, tu tiempo libre aprobado y los eventos de la práctica aparecen en tu propio calendario.',
  'Add your shifts and practice events to Google Calendar, Apple Calendar or Outlook.':
    'Agrega tus turnos y los eventos de la práctica a Google Calendar, Apple Calendar u Outlook.',
  'Show link': 'Ver enlace',
  'Setting up…': 'Configurando…',
  'Turn on syncing': 'Activar sincronización',
  'How many calendars': 'Cuántos calendarios',
  'Everything in one calendar': 'Todo en un calendario',
  'Separate calendars': 'Calendarios separados',
  'Add only the ones you want. Each shows on your phone as its own calendar, with its own colour and its own on/off. Use these instead of the all-in-one address, not as well, or everything shows twice.':
    'Agrega solo los que quieras. Cada uno aparece en tu teléfono como un calendario aparte, con su propio color y su propio encendido/apagado. Úsalos en lugar de la dirección con todo, no además de ella, o todo aparecerá dos veces.',
  'Copy the {calendar} address': 'Copiar la dirección de {calendar}',
  Copy: 'Copiar',
  Copied: 'Copiado',
  'Your private calendar address': 'La dirección privada de tu calendario',
  'Other calendars →': 'Otros calendarios →',
  '→ From URL → paste → Add calendar.': '→ Desde URL → pegar → Agregar calendario.',
  'iPhone or iPad': 'iPhone o iPad',
  'Settings → Apps → Calendar → Accounts → Add Account → Other → Add Subscribed Calendar → paste.':
    'Ajustes → Apps → Calendario → Cuentas → Añadir cuenta → Otra → Añadir calendario suscrito → pegar.',
  'Add calendar → Subscribe from web → paste.':
    'Agregar calendario → Suscribirse desde la web → pegar.',
  'Keep these addresses to yourself. Anyone who has one can see your schedule without signing in — that is how calendar subscriptions work. If one gets out, regenerate below: every address changes at once.':
    'No compartas estas direcciones. Cualquiera que tenga una puede ver tu horario sin iniciar sesión — así funcionan las suscripciones de calendario. Si alguna se comparte, genera una nueva abajo: todas las direcciones cambian a la vez.',
  'Calendars usually check for changes every few hours, so a new shift may take a while to appear.':
    'Los calendarios suelen buscar cambios cada pocas horas, así que un turno nuevo puede tardar un rato en aparecer.',
  'Regenerate the link': 'Generar un enlace nuevo',
  'Turn off syncing': 'Desactivar sincronización',
};
