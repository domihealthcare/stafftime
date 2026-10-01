import type { ReactNode } from 'react';
import type { Choice } from '../common/choices';
import { CheckGroup, RadioGroup, TextField } from '../common/fields';
import {
  COMPLETED,
  EDUCATION,
  NEEDS_NATIVE_SPEAKER_REVIEW,
  RESULTS,
  SERVICES,
  SOCIAL_HISTORY,
  SPMSQ,
  SPMSQ_ANSWERS,
  SPMSQ_BANDS,
  YES,
  scoreSpmsq,
  type Language,
  type Option,
  type Words,
} from './config';
import { ticksOf, type Page, type ServiceAnswer, type WellnessForm } from './form';
import { followUpPath, followUpsFor } from './validate';

const Grid = ({ children }: { children: ReactNode }) => (
  <div className="grid gap-4 sm:grid-cols-2">{children}</div>
);

const choicesIn = (options: readonly Option[], language: Language): Choice[] =>
  options.map((option) => ({ value: option.value, label: option[language] }));

/// A question in the language it is asked in; in Spanish, the English under
/// it, smaller, so whoever is asking can follow. The required mark goes after
/// the question itself rather than under the English — so the fields around
/// it are not told `required`.
function Asked({
  words,
  language,
  number,
  detail,
}: {
  words: Words;
  language: Language;
  number?: number;
  detail?: Words;
}) {
  return (
    <span>
      {number !== undefined && <span className="mr-1 text-slate-500">{number}.</span>}
      <span lang={language}>{words[language]}</span>
      <span className="ml-0.5 text-rose-600" aria-hidden="true">
        *
      </span>
      <span className="sr-only"> (required)</span>
      {detail && (
        <span className="block text-xs font-normal italic text-slate-600" lang={language}>
          {detail[language]}
        </span>
      )}
      {language === 'es' && (
        <span className="block text-xs font-normal text-slate-500" lang="en">
          {words.en}
        </span>
      )}
    </span>
  );
}

// ------------------------------------------------------------------ patient

export function PatientSection({
  form,
  page,
  setPatient,
  preparedBy,
}: {
  form: WellnessForm;
  page: Page;
  setPatient: (patch: Partial<WellnessForm['patient']>) => void;
  preparedBy: string;
}) {
  const { patient } = form;
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600" data-testid="preparer-line">
        Completed by <span className="font-medium text-slate-900">{preparedBy}</span> — the person
        signed in.
      </p>
      <Grid>
        <TextField
          path="patient.firstName"
          label="First name"
          required
          value={patient.firstName}
          onChange={(firstName) => setPatient({ firstName })}
        />
        <TextField
          path="patient.lastName"
          label="Last name"
          required
          value={patient.lastName}
          onChange={(lastName) => setPatient({ lastName })}
        />
        <TextField
          path="patient.dob"
          label="Date of birth"
          type="date"
          required
          value={patient.dob}
          onChange={(dob) => setPatient({ dob })}
        />
        <TextField
          path="patient.visitDate"
          label="Date of visit"
          type="date"
          required
          value={patient.visitDate}
          onChange={(visitDate) => setPatient({ visitDate })}
        />
      </Grid>
      {page === 1 && (
        <RadioGroup
          path="patient.language"
          label="Patient’s preferred language — the questions are shown in it"
          required
          options={[
            { value: 'en', label: 'English' },
            { value: 'es', label: 'Spanish' },
          ]}
          value={patient.language}
          onChange={(language) => setPatient({ language })}
        />
      )}
    </div>
  );
}

// ----------------------------------------------- page 1: social history

export function HistorySection({
  form,
  language,
  setAnswer,
  setTicks,
}: {
  form: WellnessForm;
  language: Language;
  setAnswer: (path: string, value: string) => void;
  setTicks: (path: string, values: string[]) => void;
}) {
  return (
    <div className="space-y-5">
      {language === 'es' && NEEDS_NATIVE_SPEAKER_REVIEW && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-inset ring-amber-200">
          The Spanish on this form has not yet been checked by a native speaker.
        </p>
      )}
      {SOCIAL_HISTORY.map((question, index) => {
        const answer = form.answers[question.key] ?? '';
        const followUps = followUpsFor(question, answer);
        return (
          <div key={question.key} className="border-b border-slate-100 pb-4 last:border-0">
            <RadioGroup
              path={`answers.${question.key}`}
              label={
                <Asked
                  words={question.question}
                  detail={question.detail}
                  language={language}
                  number={index + 1}
                />
              }
              options={choicesIn(question.options, language)}
              value={answer}
              onChange={(value) => setAnswer(question.key, value)}
            />
            {followUps.length > 0 && (
              <div className="mt-3 grid gap-3 border-l-2 border-brand-200 pl-3 sm:grid-cols-2">
                {followUps.map((followUp) => {
                  const at = followUpPath(question, followUp);
                  const label = <Asked words={followUp.label} language={language} />;
                  // Every follow-up shown is required; <Asked> carries the mark.
                  const wide = followUp.kind === 'ticks' || followUp.key === 'painScale';
                  return (
                    <div key={at} className={wide ? 'sm:col-span-2' : undefined}>
                      {followUp.kind === 'ticks' ? (
                        <CheckGroup
                          path={`ticks.${at}`}
                          label={label}
                          wide
                          options={choicesIn(followUp.options, language)}
                          values={ticksOf(form, at)}
                          onChange={(values) => setTicks(at, values)}
                        />
                      ) : followUp.kind === 'choice' ? (
                        <RadioGroup
                          path={`answers.${at}`}
                          label={label}
                          options={choicesIn(followUp.options, language)}
                          value={form.answers[at] ?? ''}
                          onChange={(value) => setAnswer(at, value)}
                        />
                      ) : (
                        <TextField
                          path={`answers.${at}`}
                          label={label}
                          inputMode={followUp.kind === 'number' ? 'numeric' : undefined}
                          maxLength={followUp.kind === 'number' ? 3 : 200}
                          value={form.answers[at] ?? ''}
                          onChange={(value) => setAnswer(at, value)}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------ page 1: SPMSQ

export function SpmsqSection({
  form,
  language,
  setItem,
  setEducation,
}: {
  form: WellnessForm;
  language: Language;
  setItem: (index: number, value: string) => void;
  setEducation: (value: string) => void;
}) {
  const score = scoreSpmsq(form.spmsq, form.education);
  const wrong = form.spmsq.filter((answer) => answer === 'incorrect').length;
  const answered = form.spmsq.filter((answer) => answer !== '').length;
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Mark each answer correct or incorrect. Only that is kept — never what the patient said.
      </p>
      <div className="space-y-3">
        {SPMSQ.map((item, index) => (
          <RadioGroup
            key={item.en}
            path={`spmsq.${index}`}
            label={<Asked words={item} language={language} number={index + 1} />}
            options={choicesIn(SPMSQ_ANSWERS, language)}
            value={form.spmsq[index]}
            onChange={(value) => setItem(index, value)}
          />
        ))}
      </div>
      <RadioGroup
        path="education"
        label="Education"
        required
        hint="One more incorrect is allowed with grade school or less; one less with education beyond high school."
        options={choicesIn(EDUCATION, 'en')}
        value={form.education}
        onChange={setEducation}
      />
      <div
        className="rounded-lg bg-slate-50 px-3 py-2.5 text-sm ring-1 ring-inset ring-slate-200"
        data-testid="spmsq-score"
      >
        {score ? (
          <>
            <span className="font-semibold text-slate-900">{SPMSQ_BANDS[score.band].en}</span>
            <span className="text-slate-700">
              {' '}
              — {score.errors} of 10 incorrect
              {score.adjusted !== score.errors &&
                `, counted as ${score.adjusted} for the education allowance`}
              .
            </span>
          </>
        ) : (
          <span className="text-slate-600">
            {answered} of 10 marked, {wrong} incorrect so far. The score shows once all ten and the
            education are in.
          </span>
        )}
        <span className="mt-1 block text-xs text-slate-500">
          0-2 incorrect: normal · 3-4: mild · 5-7: moderate · 8 or more: severe cognitive
          impairment.
        </span>
      </div>
    </div>
  );
}

// ----------------------------------------------- page 2: preventive services

export function ServicesSection({
  form,
  setService,
}: {
  form: WellnessForm;
  setService: (key: string, patch: Partial<ServiceAnswer>) => void;
}) {
  return (
    <div className="divide-y divide-slate-100">
      {SERVICES.map((service) => {
        const answer = form.services[service.key];
        return (
          <div key={service.key} className="py-3 first:pt-0" data-testid={`service-${service.key}`}>
            <RadioGroup
              path={`services.${service.key}.completed`}
              label={
                <span>
                  {service.name}
                  {service.frequency && (
                    <span className="ml-1 font-normal italic text-slate-500">
                      — {service.frequency}
                    </span>
                  )}
                </span>
              }
              required
              options={COMPLETED}
              value={answer.completed}
              onChange={(completed) =>
                setService(
                  service.key,
                  completed === YES ? { completed } : { completed, result: '', date: '' },
                )
              }
            />
            {answer.completed === YES && (
              <div className="mt-3 grid gap-3 border-l-2 border-brand-200 pl-3 sm:grid-cols-2">
                {service.hasResult && (
                  <RadioGroup
                    path={`services.${service.key}.result`}
                    label="Result, if known"
                    options={RESULTS}
                    value={answer.result}
                    onChange={(result) => setService(service.key, { result })}
                  />
                )}
                <TextField
                  path={`services.${service.key}.date`}
                  label="Date completed"
                  required
                  maxLength={10}
                  placeholder="MM/DD/YYYY"
                  hint="Or MM/YYYY, or just the year, if that is all that is known."
                  value={answer.date}
                  onChange={(date) => setService(service.key, { date })}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
