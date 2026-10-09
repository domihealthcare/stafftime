# Switching on "Ask Domi Staff" and the AI helpers

"Ask Domi Staff" lets anybody signed in ask a question in their own words —
"When am I next on?", "How much PTO do I have left?", "Who is in at North
Bergen now?", "How do I put the app on my phone?", and for managers "What
needs my attention today?" — and answers from what that person can already see
in the app and from the Help guide. The answers come from **Claude**, an AI
service run by **Anthropic**.

The same key switches on the **AI helpers** (October 2026, Dominguez):

- **News — ✨ Help me write it** (admins): rough notes made into a post to edit.
- **News in Spanish**: an **English | Español** switch for everybody (English
  until they pick). A post's Spanish is the admin's if they typed or checked
  it (**✨ Translate from the English** in the editor), otherwise translated
  the first time somebody asks for it, kept, and marked *Traducido
  automáticamente*. The switch works without the key for posts an admin put
  into Spanish by hand.
- **Calendar — ✨ Fill this in from a message** (managers): a rep's email or
  text, or a note about a diagnostics day, pasted in and read into the form to
  check before saving.
- **Time off — ✨ Help me word it** (managers): a kind reason for declining,
  from the manager's few words, to edit before it is sent.

All of it is built and tested, and **off until an API key is added**. Nothing
is sent anywhere while it is off, and the buttons are not shown.

## What is sent, and what is not

Agreed with Dominguez (October 2026): staff names and schedules may go to an
outside AI service; patient details never.

**Sent to Anthropic, for each question:** the question; the conversation on
screen so far (up to the last six turns); the few Help topics the screen
picked as likely to answer it; the asker's name, access level, job roles and
offices; and what the app looks up to answer it, **as that person sees it** — their own shifts and time off, the practice calendar (rep lunches
by rep name and company only), pay days, the Directory (names, job roles,
offices, work email and phone, who is in now). Managers and admins: also the
rota for a day, time off requests waiting, and the nightly round-up's lists.

**Sent by the helpers:** a News post's title and words (and an admin's notes
for one); the pasted message, with today's date and the offices' names — the
office and rep are matched to the app's own lists here, so the reps list, its
statuses and notes never go; for a decline, the person's first name, the kind
of time off and its dates, what the manager typed, and — only when they typed
nothing — how many in that job role at that office would be off, as counts,
never who.

**Never sent:** anything from the clinical forms (they never leave the
browser), the suggestion box, survey answers, staff profiles (home address,
emergency contact, pay), licenses, punch locations, PINs or passwords.

**Not kept by Domi Staff:** the questions and answers are not stored or logged
— only a count per person per day, to cap it at **40 a day each**, questions
and helpers together. What the helpers write is only kept if somebody saves it
(a post, its Spanish, a calendar entry, a decline's reason) — and a News post's
Spanish, once translated for a reader, is kept on the post for everybody.
Leaving the page ends the conversation. Anthropic's own handling of API data
is in its commercial terms (by default API inputs are not used to train
models); worth a read, and worth a line in the staff disclosure (below).

Ask Domi Staff **only looks things up** — it cannot change, approve or delete
anything. The helpers only fill in a form; a person reads it and saves it.

## Cost

Claude Opus 5.5, at $4 per million tokens in and $20 out. A typical question
(one or two look-ups) is roughly **3–5 cents**. Twenty people asking three
questions a working day would be around $2–3 a day; in practice much less.
Each helper is one short request — about **1–2 cents**; a News post is
translated once, however many read it. Set a **monthly spend limit** in the
Anthropic Console (step 4) so it can never run away.

## Steps (about 15 minutes, done by Dominguez)

1. Go to **console.anthropic.com** and sign in (or create an account) with
   **dominguez@domihealthcare.com** — not office@, which every member of staff
   can read.
2. **Settings → Billing**: add a card and a small amount of credit (say $20).
3. **Settings → API keys → Create key**, named "Domi Staff". Copy it — it is
   shown once.
4. **Settings → Limits**: set a monthly spend limit (say $50).
5. In **Vercel → stafftime → Settings → Environment Variables**, add
   `ANTHROPIC_API_KEY` with the key, for **Production only** (not Preview).
6. **Redeploy** the latest production deployment (Deployments → ⋯ → Redeploy).
7. Open the app: Home's **Quick** card now has **Ask Domi Staff**. Ask "When
   am I next on?" to check.

To switch it off again, delete the variable in Vercel and redeploy; to stop it
at once, revoke the key in the Anthropic Console.

## Before staff are told

- Add a line to the staff disclosure / handbook (`docs/location-disclosure.md`
  sits beside it), e.g.: *"Ask Domi Staff sends your question, and the
  schedule and contact details needed to answer it, to Anthropic, an AI
  provider, to write the answer. News posts may be translated into Spanish
  the same way. Do not type patient information into it."*
- The screen itself says the same under the question box, and each helper
  says what it sends under its button.
