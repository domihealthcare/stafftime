/**
 * Creates the first administrator on a fresh database.
 *
 * A production deployment has no accounts and no sign-up page, so without this
 * there is no way in. Run it once after the first `prisma migrate deploy`:
 *
 *   npm run create-admin --workspace @stafftime/api
 *
 * It prompts rather than taking arguments, so the password never lands in your
 * shell history or in the process list.
 */
import { hash } from '@node-rs/argon2';
import { EmploymentStatus, PayType, PrismaClient, Role } from '@prisma/client';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { PASSWORD_RULE, PasswordService } from '../src/auth/password.service';

const prisma = new PrismaClient();

async function ask(question: string): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

/// Reads a line without echoing it to the terminal.
async function askSecret(question: string): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout, terminal: true });
  const promise = rl.question(question);

  // muted is read by the patched write below; readline has no built-in for this.
  const output = rl as unknown as { output: NodeJS.WriteStream; _writeToOutput?: unknown };
  output._writeToOutput = function muted(text: string) {
    if (text.includes(question)) {
      output.output.write(question);
    }
  };

  try {
    const answer = await promise;
    stdout.write('\n');
    return answer.trim();
  } finally {
    rl.close();
  }
}

async function main() {
  const existingAdmins = await prisma.employee.count({ where: { role: Role.ADMIN } });
  if (existingAdmins > 0) {
    console.log(
      `\nThis database already has ${existingAdmins} administrator${existingAdmins === 1 ? '' : 's'}.`,
    );
    const proceed = await ask('Create another one anyway? (y/N) ');
    if (proceed.toLowerCase() !== 'y') {
      console.log('Nothing created.');
      return;
    }
  }

  console.log('\nCreate an administrator account.\n');

  const email = (await ask('Email: ')).toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error('That does not look like an email address.');
  }

  const taken = await prisma.employee.findUnique({ where: { email }, select: { id: true } });
  if (taken) {
    throw new Error(`${email} already has an account.`);
  }

  const firstName = await ask('First name: ');
  const lastName = await ask('Last name: ');
  if (!firstName || !lastName) {
    throw new Error('First and last name are both required.');
  }

  const password = await askSecret(
    `Password (${PASSWORD_RULE.toLowerCase().replace(/\.$/, '')}): `,
  );
  // The same check the app applies, so the first admin cannot be given a
  // password the app itself would refuse.
  const verdict = new PasswordService().check(password, { email, firstName, lastName });
  if (!verdict.ok) {
    throw new Error(verdict.reason);
  }
  const confirmation = await askSecret('Confirm password: ');
  if (password !== confirmation) {
    throw new Error('Those passwords do not match.');
  }

  const employee = await prisma.employee.create({
    data: {
      email,
      firstName,
      lastName,
      role: Role.ADMIN,
      employmentStatus: EmploymentStatus.ACTIVE,
      payType: PayType.SALARY,
      hireDate: new Date(),
      passwordHash: await hash(password),
      passwordUpdatedAt: new Date(),
      // Chosen by the person themselves, so there is nothing to force a change of.
      mustChangePassword: false,
    },
  });

  console.log(`\nCreated administrator ${employee.email}.`);
  console.log('Sign in and assign yourself to a location before clocking in.\n');
}

main()
  .catch((error: unknown) => {
    console.error(`\n${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
