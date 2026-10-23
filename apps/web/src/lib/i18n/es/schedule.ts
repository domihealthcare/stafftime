/// Spanish for the schedule screens - see ../index.ts and the glossary in ./common.ts.
export const SCHEDULE: Record<string, string> = {
  // Availability - when you can't work
  'Could not load availability.': 'No se pudo cargar la disponibilidad.',
  'Loading availability': 'Cargando disponibilidad',
  '← Schedule': '← Horario',
  'When you can’t work': 'Cuándo no puedes trabajar',
  'Tell your managers the times you can’t work - every week, or on a particular date. For whole days away, ask for time off instead.':
    'Diles a tus gerentes cuándo no puedes trabajar - cada semana o en una fecha en particular. Para días completos fuera, pide tiempo libre.',
  'The schedule is published up to': 'El horario está publicado hasta el',
  ', so changes here count from': ', así que los cambios aquí cuentan desde el',
  '. For anything sooner, talk to a manager.': '. Para algo antes, habla con un gerente.',
  'Nothing ahead is published yet, so changes count straight away. Once a week’s schedule is published, that week is fixed.':
    'Todavía no hay nada publicado más adelante, así que los cambios cuentan de inmediato. Una vez que se publica el horario de una semana, esa semana queda fija.',
  '+ Add a time you can’t work': '+ Agregar un horario en que no puedes trabajar',
  'Every week': 'Cada semana',
  'Nothing every week.': 'Nada cada semana.',
  'Removed. The weeks already published up to {date} stay as they are.':
    'Quitado. Las semanas ya publicadas hasta el {date} quedan como están.',
  'Removed.': 'Quitado.',
  'Particular dates': 'Fechas en particular',
  'No particular dates.': 'Ninguna fecha en particular.',
  'From {date}': 'Desde el {date}',
  ' until {date}': ' hasta el {date}',
  'Published - ask a manager': 'Publicado - pregúntale a un gerente',
  Ending: 'Terminando',
  'Remove this?': '¿Quitar esto?',
  '{rule}. Managers will no longer be warned about it when they build the rota; weeks already published stay as they are.':
    '{rule}. Ya no se avisará a los gerentes cuando armen el horario; las semanas ya publicadas quedan como están.',
  'Yes, remove': 'Sí, quitar',
  'Could not remove that.': 'No se pudo quitar.',
  'Could not save that.': 'No se pudo guardar.',
  'How often': 'Con qué frecuencia',
  'One date': 'Una fecha',
  Day: 'Día',
  Date: 'Fecha',
  'All day': 'Todo el día',
  From: 'Desde',
  Until: 'Hasta',
  Why: 'Por qué',
  '(optional - managers see this)': '(opcional - los gerentes lo ven)',
  'School pick-up': 'Recoger a los niños de la escuela',
  'Counts from {date} - the weeks before that are already published.':
    'Cuenta desde el {date} - las semanas anteriores ya están publicadas.',

  // Days of the week
  Monday: 'Lunes',
  Tuesday: 'Martes',
  Wednesday: 'Miércoles',
  Thursday: 'Jueves',
  Friday: 'Viernes',
  Saturday: 'Sábado',
  Sunday: 'Domingo',
  Mon: 'Lun',
  Tue: 'Mar',
  Wed: 'Mié',
  Thu: 'Jue',
  Fri: 'Vie',
  Sat: 'Sáb',
  Sun: 'Dom',

  // Schedule page
  'Schedule or calendar': 'Horario o calendario',
  'Could not load the schedule.': 'No se pudo cargar el horario.',
  'Your upcoming shifts.': 'Tus próximos turnos.',
  'Loading schedule': 'Cargando horario',
  'Nothing scheduled for you this week.': 'No tienes nada programado esta semana.',
  'no shifts': 'sin turnos',
  '{n} shift': '{n} turno',
  '{n} shifts': '{n} turnos',
  'birthday: {names}': 'cumpleaños: {names}',
  'event: {titles}': 'evento: {titles}',
  'events: {titles}': 'eventos: {titles}',
  'Note: {note}. ': 'Nota: {note}. ',
  '+{n} more': '+{n} más',
  'Pick a day to open its week, where shifts are added and removed.':
    'Elige un día para abrir su semana, donde se agregan y quitan los turnos.',

  // The week's table and its key
  'Scheduled during approved leave': 'Programado durante tiempo libre aprobado',
  'Office closed: {title}': 'Oficina cerrada: {title}',
  'Your shifts': 'Tus turnos',
  Events: 'Eventos',
  'Not hours': 'No son horas',
  Open: 'Abierto',
  Birthday: 'Cumpleaños',
  'Over the overtime line this week': 'Pasa del límite de horas extra esta semana',
  '{hours} hours in the overtime week from {date} (it follows the pay period), every location - the overtime line is {line}':
    '{hours} horas en la semana de horas extra desde el {date} (sigue el período de pago), todas las oficinas - el límite de horas extra es {line}',
  '⚠ {n} h overtime': '⚠ {n} h de horas extra',
  'half day': 'medio día',
  'Time off ({kind}){half}': 'Tiempo libre ({kind}){half}',
  'Asked for time off ({kind}){half}, not decided yet':
    'Pidió tiempo libre ({kind}){half}, todavía sin decidir',
  'Time off': 'Tiempo libre',
  'Go to a week': 'Ir a una semana',
  'Go to a month': 'Ir a un mes',
  'A year back': 'Un año antes',
  'A month back': 'Un mes antes',
  'A month on': 'Un mes después',
  'A year on': 'Un año después',
  'Asked off': 'Pidió libre',
  'Open shift': 'Turno abierto',
  '{name}’s shift': 'Turno de {name}',
  Shift: 'Turno',
  'work from home': 'trabajo desde casa',
  draft: 'borrador',
  'warning: {warning}': 'aviso: {warning}',
  'note: {note}': 'nota: {note}',
  'Home (work from home)': 'Casa',
  'Any role': 'Cualquier puesto',
  Key: 'Leyenda',
  'Fill, the office:': 'Relleno, la oficina:',
  'Outline, the job role:': 'Borde, el puesto:',
  'Lunch:': 'Almuerzo:',
  'a rep is bringing lunch to that office': 'un representante trae el almuerzo a esa oficina',
  'no rep lunch, bring your own': 'no hay almuerzo de representante, trae el tuyo',

  // Your own schedule on the Calendar
  'Half day off': 'Medio día libre',
  Off: 'Libre',
  'Your shift, {shift}': 'Tu turno, {shift}',

  // Your own overtime
  '{n} hour': '{n} hora',
  '{n} hours': '{n} horas',
  'Your overtime': 'Tus horas extra',
  '⚠ Your schedule puts you into overtime': '⚠ Tu horario te pone en horas extra',
  'Week of {date}:': 'Semana del {date}:',
  '{hours} past the {threshold}-hour line.': '{hours} más allá del límite de {threshold} horas.',
  'If that is not what you agreed, talk to your manager before the week starts.':
    'Si eso no es lo que acordaron, habla con tu gerente antes de que empiece la semana.',

  // Time off on the Schedule
  '+ Request time off': '+ Pedir tiempo libre',
  'Your time off': 'Tu tiempo libre',
  'days left': 'días restantes',
  'All requests →': 'Todas las solicitudes →',
  'All your time off →': 'Todo tu tiempo libre →',
  'waiting for a manager': 'esperando a un gerente',
  approved: 'aprobado',

  // Kinds of time off made before September 2026
  Personal: 'Personal',
  Bereavement: 'Duelo',
  Unpaid: 'Sin pago',
  Other: 'Otro',

  // Your balance
  'Your balance': 'Tu saldo',
  '{year} policy year · to {date}': 'Año de la política {year} · hasta el {date}',
  'Plus {n} day of unpaid or bereavement leave, which does not come out of either allowance.':
    'Además, {n} día de permiso sin pago o por duelo, que no se descuenta de ninguno de los dos.',
  'Plus {n} days of unpaid or bereavement leave, which does not come out of either allowance.':
    'Además, {n} días de permiso sin pago o por duelo, que no se descuentan de ninguno de los dos.',
  'None this year.': 'Nada este año.',
  'of {n} day left': 'de {n} día restante',
  'of {n} days left': 'de {n} días restantes',
  Allowance: 'Asignación',
  'Carried over': 'Traspasado',
  'Taken before Domi Staff': 'Tomado antes de Domi Staff',
  Taken: 'Tomado',
  'Awaiting approval': 'Esperando aprobación',
  '{n} day over the allowance.': '{n} día por encima de la asignación.',
  '{n} days over the allowance.': '{n} días por encima de la asignación.',

  // Time off screen
  'Could not load time off.': 'No se pudo cargar el tiempo libre.',
  'Your time off requests.': 'Tus solicitudes de tiempo libre.',
  All: 'Todas',
  Pending: 'Pendiente',
  Approved: 'Aprobado',
  Denied: 'Rechazado',
  Cancelled: 'Cancelado',
  'Loading requests': 'Cargando solicitudes',
  'Nothing waiting on a decision.': 'Nada esperando una decisión.',
  'No requests to show.': 'No hay solicitudes que mostrar.',
  'That did not work.': 'No funcionó.',
  '{n} day': '{n} día',
  '{n} days': '{n} días',
  'recorded after the fact': 'registrado después',
  Manager: 'Gerente',
  'Withdraw this request?': '¿Retirar esta solicitud?',
  '{type}, {range}. You would need to ask again.':
    '{type}, {range}. Tendrías que pedirlo de nuevo.',
  'Yes, withdraw it': 'Sí, retirarla',
  Withdraw: 'Retirar',
  'Could not send that request.': 'No se pudo enviar la solicitud.',
  Type: 'Tipo',
  'First day': 'Primer día',
  'Last day': 'Último día',
  'Leave empty for a single day.': 'Déjalo vacío si es un solo día.',
  'unpaid, so it uses none of your sick days or PTO.':
    'sin pago, así que no usa tus días de enfermedad ni tu PTO.',
  'unpaid, so it uses none of {name}’s sick days or PTO.':
    'sin pago, así que no usa los días de enfermedad ni el PTO de {name}.',
  'Half day': 'Medio día',
  Notes: 'Notas',
  '(optional)': '(opcional)',
  'You’re on the rota then:': 'Tienes turnos en esas fechas:',
  'working from home': 'trabajando desde casa',
  'Your manager will sort those out when they decide - you’ll be told.':
    'Tu gerente los arreglará cuando decida - se te avisará.',
  'falls outside the {year} policy year, so it does not come off the balance above.':
    'cae fuera del año de la política {year}, así que no se descuenta del saldo de arriba.',
  'weekends don’t count': 'los fines de semana no cuentan',
  'counts against the {year} policy year: {n} left afterwards.':
    'cuenta para el año de la política {year}: te quedarán {n}.',
  '{day}: office closed': '{day}: oficina cerrada',
  'Nothing to take off - those days are a weekend or the office is closed.':
    'No hay nada que descontar - esos días son fin de semana o la oficina está cerrada.',
  'You have {left} sick days left - this asks for {days}.':
    'Te quedan {left} días de enfermedad - esto pide {days}.',
  'You have {left} PTO days left - this asks for {days}.':
    'Te quedan {left} días de PTO - esto pide {days}.',
  'The {over} past it may be unpaid. You can still ask - a manager decides, and sees that you knew.':
    'Los {over} de más pueden no ser pagados. Igual puedes pedirlo - un gerente decide, y verá que lo sabías.',
  'I understand I’m asking for more than I have left, and it may be unpaid.':
    'Entiendo que estoy pidiendo más de lo que me queda, y que puede no ser pagado.',
  'Past the balance - asked knowing the extra days may be unpaid.':
    'Pasa del saldo - pedido sabiendo que los días de más pueden no ser pagados.',
  '{n} left afterwards.': 'Te quedarán {n}.',
  'Sending…': 'Enviando…',
  'Send request': 'Enviar solicitud',
  '{date} (half day)': '{date} (medio día)',

  // Balances (components/PtoBalanceCard.tsx) and the start-of-month pop-up
  // (components/MonthBalancePopup.tsx), October 2026.
  'Earned so far': 'Acumulado hasta ahora',
  'Earned as you work: an hour for every 30 hours worked, up to {days} days a year. {worked} hours worked so far this year.':
    'Se acumula mientras trabajas: una hora por cada 30 horas trabajadas, hasta {days} días al año. {worked} horas trabajadas en lo que va del año.',
  'Your time off this month': 'Tu tiempo libre este mes',
  'A reminder of what you have left this year, so nothing comes as a surprise.':
    'Un recordatorio de lo que te queda este año, para que nada te tome por sorpresa.',
  'Sick time is earned as you work: an hour for every 30 hours, up to {days} days.':
    'El tiempo por enfermedad se acumula mientras trabajas: una hora por cada 30 horas, hasta {days} días.',
  'Got it': 'Entendido',
  '{n} waiting for approval': '{n} esperando aprobación',

  // Schedule reviews - who reviews which provider's patient schedule
  Reviews: 'Revisiones',
  'Schedule reviews': 'Revisión de agendas',
  'Who reviews each provider’s patient schedule, day by day, so everybody knows whose is being looked after. The schedules themselves stay in eCW.':
    'Quién revisa la agenda de pacientes de cada proveedor, día por día, para que todos sepan cuál se está revisando. Las agendas en sí se quedan en eCW.',
  '← Previous week': '← Semana anterior',
  'Next week →': 'Semana siguiente →',
  'Nobody is in a provider job role yet, so there are no schedules to review.':
    'Todavía nadie tiene el puesto de proveedor, así que no hay agendas que revisar.',
  'No schedules to review.': 'No hay agendas que revisar.',
  'A provider': 'Un proveedor',
  Nobody: 'Nadie',
  Changed: 'Cambiado',
  'Schedules you review': 'Agendas que revisas',
  'All reviews →': 'Todas las revisiones →',
  'Their patient schedules, in eCW.': 'Sus agendas de pacientes, en eCW.',
  'Today’s schedule reviewed by {name}': 'La agenda de hoy la revisa {name}',
  'Nobody is reviewing today’s schedule': 'Nadie está revisando la agenda de hoy',
};
