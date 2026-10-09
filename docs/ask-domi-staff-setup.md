# Switching on "Ask Domi Staff"

"Ask Domi Staff" lets anybody signed in ask a question in their own words —
"When am I next on?", "How much PTO do I have left?", "Who is in at North
Bergen now?", and for managers "What needs my attention today?" — and answers
from what that person can already see in the app. The answers come from
**Claude**, an AI service run by **Anthropic**. It is built and tested, and
**off until an API key is added**. Nothing is sent anywhere while it is off.

## What is sent, and what is not

Agreed with Dominguez (October 2026): staff names and schedules may go to an
outside AI service; patient details never.

**Sent to Anthropic, for each question:** the question; the conversation on
screen so far (up to the last six turns); the asker's name, access level, job
roles and offices; and what the app looks up to answer it, **as that person
sees it** — their own shifts and time off, the practice calendar (rep lunches
by rep name and company only), pay days, the Directory (names, job roles,
offices, work email and phone, who is in now). Managers and admins: also the
rota for a day, time off requests waiting, and the nightly round-up's lists.

**Never sent:** anything from the clinical forms (they never leave the
browser), the suggestion box, survey answers, staff profiles (home address,
emergency contact, pay), licenses, punch locations, PINs or passwords.

**Not kept by Domi Staff:** the questions and answers are not stored or logged
— only a count per person per day, to cap it at **40 questions a day each**.
Leaving the page ends the conversation. Anthropic's own handling of API data
is in its commercial terms (by default API inputs are not used to train
models); worth a read, and worth a line in the staff disclosure (below).

It **only looks things up** — it cannot change, approve or delete anything.

## Cost

Claude Opus 5.5, at $4 per million tokens in and $20 out. A typical question
(one or two look-ups) is roughly **3–5 cents**. Twenty people asking three
questions a working day would be around $2–3 a day; in practice much less.
Set a **monthly spend limit** in the Anthropic Console (step 4) so it can
never run away.

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
  provider, to write the answer. Do not type patient information into it."*
- The screen itself says the same under the question box.
