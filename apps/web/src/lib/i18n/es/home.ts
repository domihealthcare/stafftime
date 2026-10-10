/// Spanish for the home screens — see ../index.ts and the glossary in ./common.ts.
export const HOME: Record<string, string> = {
  // Home: the clock card
  'Good morning, {name}': 'Buenos días, {name}',
  'Good afternoon, {name}': 'Buenas tardes, {name}',
  'Good evening, {name}': 'Buenas noches, {name}',
  'Could not load your status.': 'No se pudo cargar tu estado.',
  'Checking your status': 'Revisando tu estado',
  'Clocked in at {time}': 'Entrada marcada a las {time}',
  'On the clock': 'Trabajando',
  Late: 'Tarde',
  'Not clocked in': 'Sin marcar entrada',
  'Today’s shift: {start} – {end}': 'Turno de hoy: {start} – {end}',
  'No shift scheduled today.': 'No tienes turno hoy.',
  'Note on today’s shift:': 'Nota sobre el turno de hoy:',
  'Quick and coming up': 'Accesos rápidos y próximamente',

  // Home: where you clock in
  Location: 'Lugar',
  'your shift': 'tu turno',
  'another office': 'otra oficina',
  'Your shift today is from home.': 'Tu turno de hoy es desde casa.',
  'Your shift today is at {place}.': 'Tu turno de hoy es en {place}.',
  'You have no work-from-home shift today.': 'Hoy no tienes turno de trabajo desde casa.',
  'You can still clock in here; it will show on your timesheet.':
    'Aun así puedes marcar entrada aquí; se verá en tu hoja de horas.',
  'Why?': '¿Por qué?',
  'e.g. Approved to work from home today': 'p. ej., Me aprobaron trabajar desde casa hoy',
  'e.g. Covering at this office': 'p. ej., Estoy cubriendo en esta oficina',
  'Clock in from home?': '¿Marcar entrada desde casa?',
  'Clock in at {place}?': '¿Marcar entrada en {place}?',
  'You can still clock in here — it will show on your timesheet, with your reason, so your manager can see why.':
    'Aun así puedes marcar entrada aquí — se verá en tu hoja de horas, con tu motivo, para que tu gerente sepa por qué.',
  'You can still clock in here — it will show on your timesheet, so your manager can see why.':
    'Aun así puedes marcar entrada aquí — se verá en tu hoja de horas, para que tu gerente sepa por qué.',
  'Clock in from home': 'Marcar entrada desde casa',
  'Clock in at {place}': 'Marcar entrada en {place}',
  'Go back': 'Volver',
  'The front-desk kiosk does not need location access and always works on site.':
    'El quiosco de la recepción no necesita acceso a tu ubicación y siempre funciona en la oficina.',
  'You are not assigned to a location yet, so you cannot clock in. Ask a manager to assign you to North Bergen or West New York.':
    'Todavía no tienes una oficina asignada, así que no puedes marcar entrada. Pide a un gerente que te asigne a North Bergen o West New York.',

  // Home: the button and the line under it
  'Clock in': 'Marcar entrada',
  'Clock out': 'Marcar salida',
  'Clock in — working from home': 'Marcar entrada — trabajo desde casa',
  'Checking your location…': 'Revisando tu ubicación…',
  'Working from home: no location is asked for or recorded.':
    'Trabajo desde casa: no se pide ni se guarda tu ubicación.',
  'Clocking in from a browser shares your location with Domi Healthcare to confirm you are on site. It is recorded with your time entry.':
    'Al marcar entrada desde el navegador, compartes tu ubicación con Domi Healthcare para confirmar que estás en la oficina. Se guarda con tu registro de horas.',

  // Rep lunch
  'No rep lunch, bring your own lunch': 'No hay almuerzo de representante, trae tu propio almuerzo',
  'Rep lunch at {time} with {rep}': 'Almuerzo de representante a las {time} con {rep}',
  'bringing catering': 'trae catering',
  'the office orders': 'la oficina hace el pedido',

  // News on Home
  'Nothing posted yet.': 'Todavía no hay publicaciones.',
  Announcement: 'Anuncio',
  'Announcement · {date}': 'Anuncio · {date}',
  'Read the comment →': 'Leer el comentario →',
  'Read the {n} comments →': 'Leer los {n} comentarios →',
  Poll: 'Encuesta',
  '{n} comment': '{n} comentario',
  '{n} comments': '{n} comentarios',

  // Quick
  Quick: 'Accesos rápidos',
  'Request time off': 'Pedir tiempo libre',
  'Your availability': 'Tu disponibilidad',
  Forms: 'Formularios',
  'Ask Domi Staff': 'Pregúntale a Domi Staff',

  // Tablet PIN
  'Choose your tablet PIN': 'Elige tu PIN de la tableta',
  'You need one to clock in on the {office} time clock at the front desk. It takes a minute, with your password.':
    'Lo necesitas para marcar entrada en el reloj de {office} en la recepción. Toma un minuto, con tu contraseña.',
  'You need one to clock in on the time clocks at the front desk. It takes a minute, with your password.':
    'Lo necesitas para marcar entrada en los relojes de la recepción. Toma un minuto, con tu contraseña.',
  'Choose a PIN': 'Elegir un PIN',

  // Coming up
  'Holidays & coming up': 'Feriados y próximamente',
  'Next pay day': 'Próximo día de pago',
  Closed: 'Cerrado',
  'Both offices': 'Ambas oficinas',
  'Calendar →': 'Calendario →',
  '{first} – {last} · All day': '{first} – {last} · Todo el día',
  '{day} · All day': '{day} · Todo el día',

  // Surveys
  'Surveys waiting for you': 'Encuestas pendientes para ti',

  // Birthdays
  'Birthdays this week': 'Cumpleaños de esta semana',
  'Happy birthday!': '¡Feliz cumpleaños!',

  // On call
  'On call now': 'De guardia ahora',
  'Schedule →': 'Horario →',
  You: 'Tú',
  'Nobody is set': 'No hay nadie asignado',
  'until {time}': 'hasta {time}',

  // Required reading and tasks
  'Waiting for you': 'Pendiente para ti',
  'A manager has asked you to read or do these. Confirm each once you have.':
    'Un gerente te pidió leer o hacer esto. Confirma cada uno cuando lo hayas hecho.',
  '{n} more →': '{n} más →',
  'Due {date}': 'Vence: {date}',
  'Was due {date}': 'Venció: {date}',
  'Read and confirm': 'Leer y confirmar',
  'To do': 'Por hacer',
  'Read the post →': 'Leer la publicación →',
  'Read the post: {title} →': 'Leer la publicación: {title} →',
  'Open “{title}” →': 'Abrir “{title}” →',
  'Open the link ↗': 'Abrir el enlace ↗',
  'Could not save that. Try again.': 'No se pudo guardar. Inténtalo de nuevo.',
  'I’ve read it': 'Ya lo leí',
  '✓ You confirmed you read it {date}': '✓ Confirmaste que lo leíste el {date}',
  '✓ You marked it done {date}': '✓ Lo marcaste como hecho el {date}',
  '✓ You confirmed you read this {date}': '✓ Confirmaste que leíste esto el {date}',
  'Please confirm you have read this.': 'Por favor confirma que leíste esto.',
  'Please confirm you have read this — {due}.': 'Por favor confirma que leíste esto — {due}.',

  // Closing checklist
  'Before you clock out': 'Antes de marcar salida',
  '{roles} closing checklist. Anything you leave unticked goes to a manager — you can always clock out.':
    'Lista de cierre de {roles}. Lo que dejes sin marcar se le pasa a un gerente — siempre puedes marcar salida.',
  and: 'y',
  'Which desk did you work today?': '¿En qué escritorio trabajaste hoy?',
  Remember: 'Recuerda',
  '(ideally {n}+)': '(idealmente {n} o más)',
  '{ticked} of {total} ticked': '{ticked} de {total} marcados',
  'Clocking out…': 'Marcando salida…',
  'Clock out without the checklist': 'Marcar salida sin la lista',
  'Not yet': 'Todavía no',

  // Suggestion box
  'Suggestion box': 'Buzón de sugerencias',
  'Anything you’d like the managers to know.': 'Lo que quieras que sepan los gerentes.',
  'Drop a note in': 'Deja una nota',
  'What it is for': 'Para qué es',
  'An idea': 'Una idea',
  'Something’s not working': 'Algo no funciona',
  'A shout-out': 'Un reconocimiento',
  'A question': 'Una pregunta',
  'What would you try, and what would it make better?': '¿Qué probarías y qué mejoraría?',
  'What keeps going wrong, and where?': '¿Qué sigue fallando, y dónde?',
  'Who went above and beyond, and what did they do?': '¿Quién se esforzó de más, y qué hizo?',
  'What have you been wondering about?': '¿Qué te has estado preguntando?',
  'Truly anonymous — how?': 'De verdad anónimo — ¿cómo?',
  '{n} waiting to be read →': '{n} sin leer →',
  'Anonymous — no name and no time are kept, only the day it arrives.':
    'Anónimo — no se guarda ningún nombre ni hora, solo el día en que llega.',
  'Your name is not saved with it.': 'Tu nombre no se guarda con la nota.',
  'The note is not linked to you or your account in any way.':
    'La nota no está vinculada a ti ni a tu cuenta de ninguna manera.',
  'No time is kept': 'No se guarda la hora',
  '— only the day it arrived, so nobody can match it to who was on a break or at the desk.':
    '— solo el día en que llegó, así que nadie puede relacionarla con quién estaba en su descanso o en el escritorio.',
  'Nobody can find out who wrote it': 'Nadie puede saber quién la escribió',
  '— not managers, not admins. There is no screen, report or export that could show it, because the app never kept it.':
    '— ni los gerentes ni los administradores. No hay pantalla, informe ni exportación que pueda mostrarlo, porque la app nunca lo guardó.',
  'The managers’ morning email only says': 'El correo de la mañana a los gerentes solo dice',
  that: 'que',
  'something is waiting, never what it says.': 'hay algo esperando, nunca lo que dice.',
  'You have to be signed in to send one, so the box is not open to the whole internet — but who you are is dropped as soon as the note is in.':
    'Tienes que haber iniciado sesión para enviar una, para que el buzón no esté abierto a todo internet — pero quién eres se descarta en cuanto la nota entra.',
  'The one thing the app cannot hide is what you write: a very specific detail can still give you away.':
    'Lo único que la app no puede ocultar es lo que escribes: un detalle muy específico todavía podría delatarte.',
  'Could not send that.': 'No se pudo enviar.',
  'In the box!': '¡Ya está en el buzón!',
  'Drop a note in the box': 'Deja una nota en el buzón',
  'Sent anonymously. Thank you.': 'Enviada de forma anónima. Gracias.',
  'The managers are told the next morning that something is waiting, and read it in the app.':
    'A los gerentes se les avisa a la mañana siguiente que hay algo esperando, y lo leen en la app.',
  'Write another': 'Escribir otra',
  'What sort of note?': '¿Qué tipo de nota?',
  'Your suggestion': 'Tu sugerencia',
  'An idea, something not working, a shout-out or a question…':
    'Una idea, algo que no funciona, un reconocimiento o una pregunta…',
  'Is it really anonymous?': '¿De verdad es anónimo?',
  'Sending…': 'Enviando…',
  'Send anonymously': 'Enviar de forma anónima',
};
