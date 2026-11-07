import type { Spoken } from './twiml';

/// What the caller hears when the database cannot be read. The same words the
/// migration loads; managers change the real ones in the app.
export const DEFAULT_MESSAGES: Record<string, Spoken> = {
  OPENING_EN: { text: 'Thank you for calling Domi Healthcare. For English, press 1.' },
  OPENING_ES: { text: 'Para español, oprima 2.' },
  GREETING_EN: {
    text: "You have reached the Domi Healthcare on-call provider. If this is an emergency, hang up and dial nine, one, one. For appointments, billing or other routine questions, please call our office during business hours. For urgent concerns, including a patient in the hospital, please stay on the line. If no one answers, leave a message with the patient's name, date of birth, the reason for your call and your callback number.",
  },
  GREETING_ES: {
    text: 'Ha llamado al proveedor de guardia de Domi Healthcare. Si es una emergencia, cuelgue y marque al nueve, uno, uno. Para citas, facturación u otras preguntas de rutina, llame a nuestra oficina en horario de atención. Para asuntos urgentes, incluyendo un paciente en el hospital, permanezca en la línea. Si nadie contesta, deje un mensaje con el nombre del paciente, su fecha de nacimiento, el motivo de su llamada y su número de teléfono.',
  },
  HOLD_EN: { text: 'Please continue to hold while we connect you.' },
  HOLD_ES: { text: 'Por favor, permanezca en la línea mientras le comunicamos.' },
  CLOSING_EN: {
    text: 'We could not reach the on-call provider. They have been told about your call. Please call back in a few minutes. If this is a medical emergency, hang up and dial nine, one, one.',
  },
  CLOSING_ES: {
    text: 'No pudimos comunicarnos con el proveedor de guardia. Ya se le avisó de su llamada. Por favor, vuelva a llamar en unos minutos. Si es una emergencia médica, cuelgue y marque al nueve, uno, uno.',
  },
};

export const DEFAULT_VOICE_EN = 'Polly.Joanna-Neural';
export const DEFAULT_VOICE_ES = 'Polly.Lupe-Neural';
export const DEFAULT_RING_SECONDS = 20;
