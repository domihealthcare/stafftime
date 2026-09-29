/**
 * Spanish for the patient's handout (PDF 2).
 *
 * ⚠ NEEDS NATIVE-SPEAKER REVIEW — every line in this file. It was written
 * carefully but not by a native speaker, and it goes to patients and their
 * families. Once somebody fluent has read it through, set
 * NEEDS_NATIVE_SPEAKER_REVIEW to false; while it is true, the form says so
 * beside the language switch (never on the handout itself).
 *
 * Keys match the `value`s in config.ts. A choice with no line here is printed
 * in English, so adding one to config.ts means adding its Spanish here too.
 */

export const NEEDS_NATIVE_SPEAKER_REVIEW = true;

export type HandoutLanguage = 'en' | 'es';

const MONTHS = {
  en: [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ],
  // needs native-speaker review
  es: [
    'enero',
    'febrero',
    'marzo',
    'abril',
    'mayo',
    'junio',
    'julio',
    'agosto',
    'septiembre',
    'octubre',
    'noviembre',
    'diciembre',
  ],
};

/// "September 29, 2026" / "29 de septiembre de 2026" — spelled out, so
/// nobody has to guess which number is the month.
export function longDate(iso: string, language: HandoutLanguage): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const [, year, month, day] = match;
  const name = MONTHS[language][Number(month) - 1];
  return language === 'es'
    ? `${Number(day)} de ${name} de ${year}`
    : `${name} ${Number(day)}, ${year}`;
}

/// The handout's own words.
export const HANDOUT_STRINGS = {
  en: {
    title: 'Your memory care plan',
    preparedFor: (name: string, date: string, provider: string) =>
      `Prepared for ${name} on ${date} by ${provider}.`,
    intro:
      'This is the plan we agreed on at your visit today. Keep it somewhere easy to find, and bring it to your next visit.',
    goals: 'Our goals',
    actions: 'What we will do',
    providerNote: 'Note from your provider',
    referrals: 'Referrals and resources',
    alzHelpline: "Alzheimer's Association 24/7 Helpline: 1-800-272-3900",
    safetyTips: 'Safety tips',
    nextVisit: 'Your next visit',
    inInterval: (interval: string) => `In ${interval}`,
    onDate: (date: string) => `on ${date}`,
    questions: 'Questions? Call Domi Healthcare.',
    header: (name: string, dob: string, date: string) =>
      `${name}  |  Date of birth: ${dob}  |  Visit: ${date}`,
    footer: 'Domi Healthcare — memory care plan',
  },
  // needs native-speaker review
  es: {
    title: 'Su plan de cuidado de la memoria',
    preparedFor: (name: string, date: string, provider: string) =>
      `Preparado para ${name} el ${date} por ${provider}.`,
    intro:
      'Este es el plan que acordamos hoy en su visita. Guárdelo en un lugar fácil de encontrar y tráigalo a su próxima visita.',
    goals: 'Nuestras metas',
    actions: 'Lo que vamos a hacer',
    providerNote: 'Nota de su proveedor',
    referrals: 'Referidos y recursos',
    alzHelpline: 'Asociación de Alzheimer, línea de ayuda 24/7: 1-800-272-3900',
    safetyTips: 'Consejos de seguridad',
    nextVisit: 'Su próxima visita',
    inInterval: (interval: string) => `En ${interval}`,
    onDate: (date: string) => `el ${date}`,
    questions: '¿Preguntas? Llame a Domi Healthcare.',
    header: (name: string, dob: string, date: string) =>
      `${name}  |  Fecha de nacimiento: ${dob}  |  Visita: ${date}`,
    footer: 'Domi Healthcare — plan de cuidado de la memoria',
  },
};

// needs native-speaker review
export const ES_AREAS: Record<string, string> = {
  cognition: 'Memoria y pensamiento',
  function: 'Actividades diarias',
  behavior: 'Estado de ánimo y comportamiento',
  medications: 'Medicamentos',
  safety: 'Seguridad',
  caregiver: 'Apoyo para quien cuida',
};

/// Care plan goals, keyed "area:value". Needs native-speaker review.
export const ES_GOALS: Record<string, string> = {
  'cognition:keep-skills': 'Mantener la memoria y el pensamiento lo más fuertes posible',
  'cognition:understand': 'Entender el diagnóstico y qué esperar',
  'cognition:stay-active': 'Mantenerse activo social y mentalmente',
  'function:independent': 'Mantenerse tan independiente como sea seguro en las actividades diarias',
  'function:get-help': 'Recibir ayuda con las tareas que se han vuelto difíciles',
  'behavior:calmer': 'Aliviar los cambios de ánimo o de comportamiento que causan angustia',
  'behavior:sleep': 'Dormir mejor',
  'behavior:watch': 'Estar atentos a nuevos cambios de ánimo o de comportamiento',
  'medications:safe': 'Tomar los medicamentos de forma segura y como se recetaron',
  'medications:avoid': 'Evitar medicamentos que pueden empeorar la memoria',
  'safety:home': 'Prevenir caídas y lesiones en casa',
  'safety:travel': 'Mantenerse seguro al manejar o al desplazarse',
  'safety:money': 'Protegerse de estafas y de daños económicos',
  'safety:stay-safe': 'Estar seguro en casa',
  'caregiver:support': 'Apoyar a quien cuida y evitar el agotamiento',
  'caregiver:plan-help': 'Asegurar que haya ayuda disponible',
  'caregiver:plan-ahead':
    'Planificar con anticipación las decisiones legales, económicas y de salud',
};

/// Care plan actions, keyed "area:value". Needs native-speaker review.
export const ES_ACTIONS: Record<string, string> = {
  'cognition:exercise': 'Hacer ejercicio físico con regularidad, según pueda',
  'cognition:engage': 'Mantenerse activo social y mentalmente: conversar, pasatiempos, grupos',
  'cognition:aids': 'Usar un calendario, notas y una rutina diaria como ayuda para la memoria',
  'cognition:senses': 'Revisar la audición y la vista; usar audífonos y lentes',
  'cognition:recheck': 'Volver a evaluar la memoria y el pensamiento en la próxima visita',
  'function:finances':
    'Que un familiar o cuidador se encargue de pagar las cuentas y manejar el dinero',
  'function:pill-box': 'Usar un pastillero semanal, revisado por un cuidador',
  'function:home-help': 'Conseguir ayuda en casa para bañarse, vestirse u otros cuidados diarios',
  'function:therapy': 'Terapia física u ocupacional para mantener la fuerza y la independencia',
  'function:transport': 'Organizar transporte para citas y mandados',
  'behavior:routine': 'Mantener una rutina diaria tranquila y regular',
  'behavior:sleep-habits':
    'Buenos hábitos de sueño: hora fija para acostarse, actividad durante el día, menos siestas y menos cafeína',
  'behavior:mood-follow-up':
    'Dar seguimiento al estado de ánimo; hablamos de opciones de tratamiento',
  'behavior:triggers':
    'Que el cuidador observe qué provoca los comportamientos difíciles y nos lo cuente en la próxima visita',
  'medications:list':
    'Tener una lista actualizada de todos los medicamentos y traerla a cada visita',
  'medications:changes': 'Seguir los cambios de medicamentos que hicimos hoy',
  'medications:avoid-otc':
    'Evitar medicamentos sin receta para dormir o para la alergia, como la difenhidramina (Benadryl)',
  'medications:give-help': 'Que el cuidador ayude a dar los medicamentos',
  'safety:falls':
    'Quitar objetos con los que se pueda tropezar; poner luces de noche y barras de apoyo',
  'safety:stove':
    'Cubiertas para las perillas de la estufa o apagado automático; supervisar al cocinar',
  'safety:wandering': 'Pulsera de identificación médica y una foto reciente a la mano',
  'safety:driving-eval': 'Evaluación de manejo antes de volver a manejar',
  'safety:stop-driving': 'Dejar de manejar; organizar otro medio de transporte',
  'safety:firearms':
    'Guardar bajo llave o sacar de la casa las armas de fuego; guardar las municiones por separado',
  'safety:scams':
    'Que el cuidador revise el correo, las llamadas y las cuentas bancarias por posibles estafas',
  'safety:check-in': 'Que alguien llame o pase a verle todos los días',
  'safety:smoking': 'Supervisar cuando fume; probar los detectores de humo',
  'caregiver:education': 'Educación para el cuidador sobre la enfermedad y qué esperar',
  'caregiver:respite': 'Cuidado de relevo para que el cuidador pueda descansar',
  'caregiver:support-group': 'Grupo de apoyo para cuidadores',
  'caregiver:home-care': 'Servicios de cuidado en el hogar',
  'caregiver:legal': 'Planificar un poder notarial y un representante para decisiones de salud',
  'caregiver:social-work': 'Trabajo social para ayudar a encontrar apoyo',
};

// needs native-speaker review
export const ES_REFERRALS: Record<string, string> = {
  'adult-day': 'Programa de día para adultos',
  'support-group': 'Grupo de apoyo',
  respite: 'Cuidado de relevo',
  'home-care': 'Cuidado en el hogar',
  'pt-ot': 'Terapia física / ocupacional',
  'social-work': 'Trabajo social',
  neurology: 'Neurología',
  neuropsych: 'Pruebas neuropsicológicas',
  'alz-association': 'Asociación de Alzheimer',
};

// needs native-speaker review
export const ES_SAFETY_TIPS: Record<string, string> = {
  contacts: 'Tenga una lista de contactos de emergencia junto al teléfono.',
  medicines: 'Guarde los medicamentos en un solo lugar, en sus frascos con etiqueta.',
  lighting: 'Mantenga bien iluminados los cuartos, los pasillos y las escaleras.',
  help: 'En caso de emergencia, llame al 911.',
};

// needs native-speaker review
export const ES_FOLLOW_UP: Record<string, string> = {
  '2-weeks': '2 semanas',
  '4-weeks': '4 semanas',
  '6-weeks': '6 semanas',
  '3-months': '3 meses',
  '6-months': '6 meses',
};
