/**
 * Spanish for the patient's handout (PDF 2).
 *
 * Read through by a native speaker and approved (Dominguez, October 2026).
 * Anything added later should be read the same way before it reaches
 * patients: set NEEDS_NATIVE_SPEAKER_REVIEW back to true meanwhile, and the
 * form says so beside the language choice (never on the handout itself).
 *
 * Keys match the `value`s in config.ts. A choice with no line here is printed
 * in English, so adding one to config.ts means adding its Spanish here too.
 */

export const NEEDS_NATIVE_SPEAKER_REVIEW = false;

export type HandoutLanguage = 'en' | 'es';

export { longDate } from '../common/dates';

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
    questions: (phone: string) => `Questions? Call Domi Healthcare at ${phone}.`,
    signature: 'Signature',
    signedBy: (who: string, when: string) => `Electronically signed by ${who} on ${when}.`,
    preparedBy: 'Prepared by',
    practice: 'Practice',
    patient: 'Patient',
    dob: 'Date of birth',
    carePartner: 'Care partner',
    createdOn: 'Created on',
    confidential: 'Confidential',
    thingsToTry: 'Things to try',
    planningAhead: 'Planning ahead',
    planningIntro:
      'It is important to plan for money and health decisions while choices can still be made clearly. If this was done before, it is worth reviewing again now.',
    done: 'Done',
    notYet: 'Not yet',
    header: (name: string, dob: string, date: string) =>
      `${name}  |  Date of birth: ${dob}  |  Visit: ${date}`,
    footer: 'Domi Healthcare — memory care plan',
  },
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
    questions: (phone: string) => `¿Preguntas? Llame a Domi Healthcare al ${phone}.`,
    signature: 'Firma',
    signedBy: (who: string, when: string) => `Firmado electrónicamente por ${who} el ${when}.`,
    preparedBy: 'Preparado por',
    practice: 'Consultorio',
    patient: 'Paciente',
    dob: 'Fecha de nacimiento',
    carePartner: 'Persona que cuida',
    createdOn: 'Fecha',
    confidential: 'Confidencial',
    thingsToTry: 'Qué puede hacer',
    planningAhead: 'Planificar con anticipación',
    planningIntro:
      'Es importante planificar las decisiones económicas y de salud mientras todavía se pueden tomar con claridad. Si ya lo hizo antes, vale la pena revisarlo de nuevo ahora.',
    done: 'Hecho',
    notYet: 'Todavía no',
    header: (name: string, dob: string, date: string) =>
      `${name}  |  Fecha de nacimiento: ${dob}  |  Visita: ${date}`,
    footer: 'Domi Healthcare — plan de cuidado de la memoria',
  },
};

export const ES_AREAS: Record<string, string> = {
  cognition: 'Memoria y pensamiento',
  function: 'Actividades diarias',
  behavior: 'Estado de ánimo y comportamiento',
  medications: 'Medicamentos',
  safety: 'Seguridad',
  caregiver: 'Apoyo para quien cuida',
};

/// A line of plain explanation under each area's heading..
export const ES_INTROS: Record<string, string> = {
  cognition:
    'Los cambios en la memoria y el pensamiento pueden hacer más difíciles las cosas de cada día. Mantenerse activo, seguir una rutina y venir a sus citas con nosotros ayudan.',
  function:
    'Con el tiempo, tareas como cocinar, hacer compras, manejar el dinero o vestirse pueden necesitar más ayuda. Organizar esa ayuda a tiempo da a todos más seguridad y menos estrés.',
  behavior:
    'Los cambios de ánimo, de sueño y de comportamiento son comunes con la pérdida de memoria. Son parte de la enfermedad, no son culpa de nadie, y muchos se pueden aliviar.',
  medications:
    'Algunos medicamentos pueden empeorar la memoria o el pensamiento. Revisamos los medicamentos y los seguiremos revisando.',
  safety:
    'Los cambios en la memoria pueden afectar el equilibrio, el juicio y la conciencia del peligro. Pequeños cambios en casa hacen una gran diferencia.',
  caregiver:
    'Cuidar a alguien con pérdida de memoria es valioso y también es un trabajo duro. Quien cuida también necesita apoyo.',
};

/// Planning ahead.
export const ES_PLANNING: Record<string, string> = {
  financialPoa: 'Poder notarial para asuntos económicos',
  healthcareProxy: 'Representante para decisiones de salud (poder notarial médico)',
  lifeSupport: 'Deseos sobre el soporte vital conversados',
};

/// Care plan goals, keyed "area:value".
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

/// Care plan actions, keyed "area:value".
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

export const ES_SAFETY_TIPS: Record<string, string> = {
  contacts: 'Tenga una lista de contactos de emergencia junto al teléfono.',
  medicines: 'Guarde los medicamentos en un solo lugar, en sus frascos con etiqueta.',
  lighting: 'Mantenga bien iluminados los cuartos, los pasillos y las escaleras.',
  help: 'En caso de emergencia, llame al 911.',
};

export const ES_FOLLOW_UP: Record<string, string> = {
  '2-weeks': '2 semanas',
  '4-weeks': '4 semanas',
  '6-weeks': '6 semanas',
  '3-months': '3 meses',
  '6-months': '6 meses',
};
