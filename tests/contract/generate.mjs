/**
 * The API contract check: the web's types against what the server really
 * sends, as a compile error rather than a surprise in the browser tests.
 *
 * `npm run typecheck` runs this, then `tsc -p tests/contract`. This script
 * only reads source (the TypeScript parser, no type checking, well under a
 * second): every call in `api` and `kioskApi` in apps/web/src/lib/api.ts, its
 * path and method, and the controller method in apps/api/src that serves it
 * (by the `@Controller` and `@Get`/`@Post`/... decorators). It writes
 * tests/contract/generated.ts (not committed), one line per call:
 *
 *   export type api_listEmployees_GET = Matches<Reads<typeof api.listEmployees>,
 *     Answer<EmployeesController['findAll']>>;
 *
 * and tsc fails that line when what the controller returns, as it arrives
 * over JSON (tests/contract/wire.ts: a Date as a string and so on), is not
 * something the web can take as the type it reads the answer as. Nothing here
 * is imported by the web, so it adds nothing to what the browser downloads.
 *
 * When it fails, the line is named after the call, with the call's line in
 * api.ts and the controller method in the comment above it, and tsc says which
 * property differs. Then, in this order:
 * - the server is right and the web's type is wrong (a field never sent, a
 *   `null` the type does not allow, an enum value it does not list): fix the
 *   web's type in apps/web/src/lib/types.ts or api.ts;
 * - the server always sends the narrower thing but its type does not say so
 *   (a string built from fixed words, a value set just above): give the
 *   server code the precise type;
 * - neither can be settled now: list the call in tests/contract/not-checked.mjs
 *   with the reason.
 * A call whose path no controller serves, or that this script cannot read,
 * fails here, before tsc, with a message saying which.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { LOOSE_ENUMS, NOT_CHECKED, PASS_THROUGH, SAME_ANSWER } from './not-checked.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const webApiFile = path.join(root, 'apps/web/src/lib/api.ts');
const apiSrc = path.join(root, 'apps/api/src');
const outFile = path.join(here, 'generated.ts');

const HTTP = { Get: 'GET', Post: 'POST', Put: 'PUT', Patch: 'PATCH', Delete: 'DELETE' };

function parse(file) {
  return ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
}

function decoratorsOf(node) {
  return (ts.canHaveDecorators(node) ? ts.getDecorators(node) : undefined) ?? [];
}

function decoratorCall(decorator) {
  const expression = decorator.expression;
  if (!ts.isCallExpression(expression) || !ts.isIdentifier(expression.expression)) return null;
  return { name: expression.expression.text, args: expression.arguments };
}

/// A route path as segments, with every parameter written as ':'.
function segments(text) {
  return text
    .split('/')
    .filter(Boolean)
    .map((part) => (part.startsWith(':') ? ':' : part));
}

function routeKey(method, segs) {
  return `${method} /${segs.join('/')}`;
}

/// A decorator's path argument: none, a string, or a list of strings.
function pathArgs(arg, where) {
  if (!arg) return [''];
  if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) return [arg.text];
  if (ts.isArrayLiteralExpression(arg)) return arg.elements.flatMap((e) => pathArgs(e, where));
  throw new Error(`${where}: a route path that is not a plain string`);
}

// ------------------------------------------------------------- the server side

function controllerFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return controllerFiles(full);
    return entry.name.endsWith('.controller.ts') ? [full] : [];
  });
}

/// Every route the API serves: 'GET /employees/:' -> where it is.
function serverRoutes() {
  const routes = new Map();
  for (const file of controllerFiles(apiSrc)) {
    const source = parse(file);
    for (const statement of source.statements) {
      if (!ts.isClassDeclaration(statement) || !statement.name) continue;
      const controller = decoratorsOf(statement)
        .map(decoratorCall)
        .find((call) => call?.name === 'Controller');
      if (!controller) continue;
      const where = `${path.relative(root, file)} ${statement.name.text}`;
      const prefixes = pathArgs(controller.args[0], where);
      for (const member of statement.members) {
        if (!ts.isMethodDeclaration(member) || !member.name || !ts.isIdentifier(member.name)) {
          continue;
        }
        for (const call of decoratorsOf(member).map(decoratorCall)) {
          if (!call || !HTTP[call.name]) continue;
          const method = HTTP[call.name];
          const subs = pathArgs(call.args[0], `${where}.${member.name.text}`);
          // `@Res()` without passthrough writes the answer itself (a file).
          const writesItsOwnAnswer = member.parameters.some((parameter) =>
            decoratorsOf(parameter).some((decorator) => {
              const res = decoratorCall(decorator);
              return res?.name === 'Res' && res.args.length === 0;
            }),
          );
          for (const prefix of prefixes) {
            for (const sub of subs) {
              const key = routeKey(method, segments(`${prefix}/${sub}`));
              if (routes.has(key)) {
                throw new Error(
                  `Two controllers serve ${key}: ${routes.get(key).label} and ${where}`,
                );
              }
              routes.set(key, {
                file,
                className: statement.name.text,
                methodName: member.name.text,
                label: `${statement.name.text}.${member.name.text}`,
                writesItsOwnAnswer,
              });
            }
          }
        }
      }
    }
  }
  return routes;
}

/// The route a web path asks for. A literal segment matches only the same
/// literal, a parameter only a parameter, so `/employees/me` and
/// `/employees/${id}` find `me` and `:id` as Nest does.
function findRoute(routes, method, segs) {
  return routes.get(routeKey(method, segs)) ?? null;
}

// ---------------------------------------------------------------- the web side

/// The string literals an expression can only be: `'a'`, `c ? 'a' : 'b'`, or
/// a parameter typed `'a' | 'b'`. Null when it can be any string.
function literalChoices(expr, fn) {
  while (ts.isParenthesizedExpression(expr)) expr = expr.expression;
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) return [expr.text];
  if (ts.isConditionalExpression(expr)) {
    const yes = literalChoices(expr.whenTrue, fn);
    const no = literalChoices(expr.whenFalse, fn);
    return yes && no ? [...yes, ...no] : null;
  }
  if (ts.isIdentifier(expr)) {
    const parameter = fn.parameters.find((p) => p.name.getText() === expr.text);
    const type = parameter?.type;
    if (type && ts.isUnionTypeNode(type)) {
      const texts = type.types.map((t) =>
        ts.isLiteralTypeNode(t) && ts.isStringLiteral(t.literal) ? t.literal.text : null,
      );
      if (texts.every((t) => t !== null)) return texts;
    }
  }
  return null;
}

/// The paths a `request` path argument can be, as route texts with every
/// value written ':'. `/pto/${id}/review` is '/pto/:/review'; a substitution
/// that does not start a segment (`/pto/balance${query}`) is a query string,
/// so the path ends there, as it does at a literal '?'. A choice between
/// literals (`${closed ? 'close' : 'reopen'}`, `id ? `/x/${id}` : '/x'`) gives
/// one path for each, tagged with the condition so the method can follow it.
function webPaths(arg, fn) {
  while (ts.isParenthesizedExpression(arg)) arg = arg.expression;
  if (ts.isConditionalExpression(arg)) {
    const condition = arg.condition.getText();
    const yes = webPaths(arg.whenTrue, fn);
    const no = webPaths(arg.whenFalse, fn);
    if (!yes || !no) return null;
    return [
      ...yes.map((p) => ({ ...p, condition, branch: true })),
      ...no.map((p) => ({ ...p, condition, branch: false })),
    ];
  }
  if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) {
    return [{ text: arg.text.split('?')[0] }];
  }
  if (!ts.isTemplateExpression(arg)) return null;
  let texts = [arg.head.text];
  for (const span of arg.templateSpans) {
    if (texts.some((t) => t.includes('?'))) break;
    const choices = literalChoices(span.expression, fn);
    if (choices) {
      texts = texts.flatMap((t) => choices.map((c) => t + c + span.literal.text));
      continue;
    }
    if (!texts[0].endsWith('/')) break;
    const after = span.literal.text;
    if (after && !after.startsWith('/') && !after.startsWith('?')) {
      throw new Error(`api.ts: a path segment mixes text and a value: ${arg.getText()}`);
    }
    texts = texts.map((t) => `${t}:${after}`);
  }
  return texts.map((t) => ({ text: t.split('?')[0] }));
}

/// The methods a call can use, tagged like the paths.
function httpMethods(init, fn) {
  if (!init) return [{ method: 'GET' }];
  if (!ts.isObjectLiteralExpression(init)) {
    // `request(path, options)` passes only the background flag.
    return ts.isIdentifier(init) ? [{ method: 'GET' }] : null;
  }
  const property = init.properties.find(
    (p) => ts.isPropertyAssignment(p) && p.name.getText() === 'method',
  );
  if (!property) return [{ method: 'GET' }];
  let expr = property.initializer;
  while (ts.isParenthesizedExpression(expr)) expr = expr.expression;
  if (ts.isConditionalExpression(expr)) {
    const yes = literalChoices(expr.whenTrue, fn);
    const no = literalChoices(expr.whenFalse, fn);
    if (!yes || !no) return null;
    const condition = expr.condition.getText();
    return [
      ...yes.map((method) => ({ method, condition, branch: true })),
      ...no.map((method) => ({ method, condition, branch: false })),
    ];
  }
  return literalChoices(expr, fn)?.map((method) => ({ method })) ?? null;
}

/// Each path with each method it can go with: on the same condition, the
/// same branch; otherwise every pairing.
function variants(paths, methods) {
  return paths.flatMap((p) =>
    methods
      .filter((m) => !(p.condition && p.condition === m.condition && p.branch !== m.branch))
      .map((m) => ({ method: m.method, segs: segments(p.text) })),
  );
}

/// Whether a property's function hands back exactly what `request` gave it,
/// so `Awaited<ReturnType<typeof api.x>>` is the type the web reads the
/// answer as.
function returnsTheRequest(name, fn, call) {
  if (SAME_ANSWER[name]) return true;
  let body = fn.body;
  if (ts.isBlock(body)) {
    // Something done first (`writeViewAs(null); return request(...)`) is fine,
    // as long as the one return is the last statement.
    const returns = body.statements.filter(ts.isReturnStatement);
    const last = body.statements[body.statements.length - 1];
    if (returns.length !== 1 || returns[0] !== last) return false;
    body = last.expression;
  }
  while (body && ts.isParenthesizedExpression(body)) body = body.expression;
  if (body === call) return true;
  // `request<T>(...).then(timeOffChanged)`: a pass-through that tells the
  // screen something changed.
  return (
    ts.isCallExpression(body) &&
    ts.isPropertyAccessExpression(body.expression) &&
    body.expression.name.text === 'then' &&
    body.expression.expression === call &&
    body.arguments.length === 1 &&
    ts.isIdentifier(body.arguments[0]) &&
    PASS_THROUGH.includes(body.arguments[0].text)
  );
}

/// Every call in `api` and `kioskApi`.
function webCalls() {
  const source = parse(webApiFile);
  const calls = [];
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      const objectName = declaration.name.getText();
      if (!['api', 'kioskApi'].includes(objectName)) continue;
      if (!declaration.initializer || !ts.isObjectLiteralExpression(declaration.initializer)) {
        throw new Error(`api.ts: ${objectName} is not an object literal`);
      }
      for (const property of declaration.initializer.properties) {
        const name = `${objectName}.${property.name.getText()}`;
        const fn = ts.isPropertyAssignment(property) ? property.initializer : property;
        if (
          !ts.isArrowFunction(fn) &&
          !ts.isFunctionExpression(fn) &&
          !ts.isMethodDeclaration(fn)
        ) {
          calls.push({ name, problem: 'not a function' });
          continue;
        }
        const found = [];
        const visit = (node) => {
          if (
            ts.isCallExpression(node) &&
            ts.isIdentifier(node.expression) &&
            ['request', 'download'].includes(node.expression.text)
          ) {
            found.push(node);
          }
          ts.forEachChild(node, visit);
        };
        visit(fn);
        if (found.length === 0) {
          calls.push({ name, problem: 'makes no request' });
          continue;
        }
        for (const call of found) {
          const line = source.getLineAndCharacterOfPosition(call.getStart()).line + 1;
          const paths = webPaths(call.arguments[0], fn);
          const methods = httpMethods(call.arguments[1], fn);
          if (!paths || !methods) {
            calls.push({ name, line, problem: 'its path or method could not be read' });
            continue;
          }
          for (const { method, segs } of variants(paths, methods)) {
            calls.push({
              name,
              line,
              kind: call.expression.text,
              segs,
              method,
              simple: found.length === 1 && returnsTheRequest(name, fn, call),
            });
          }
        }
      }
    }
  }
  return calls;
}

// ------------------------------------------------------------------ the output

const routes = serverRoutes();
const calls = webCalls();
const problems = [];
const checks = [];
const notChecked = [];
const usedListed = new Set();
/// Each controller class used, by file and name, with the name it is imported
/// as (two files could hold classes of the same name).
const importAs = new Map();

for (const call of calls) {
  const skip = NOT_CHECKED[call.name];
  if (skip || LOOSE_ENUMS[call.name]) usedListed.add(call.name);
  const where = call.segs ? `${call.method} /${call.segs.join('/')}` : '(no path)';
  if (call.problem) {
    if (skip) notChecked.push({ call, where, reason: skip });
    else problems.push(`${call.name}: ${call.problem}`);
    continue;
  }
  const route = findRoute(routes, call.method, call.segs);
  if (!route) {
    // A path the server does not serve is a bug, whatever the lists say.
    problems.push(`${call.name} (api.ts line ${call.line}): no controller serves ${where}`);
    continue;
  }
  if (skip) {
    notChecked.push({ call, where, reason: skip });
    continue;
  }
  if (call.kind === 'download' || route.writesItsOwnAnswer) {
    notChecked.push({ call, where, reason: 'a file download, not JSON' });
    continue;
  }
  if (!call.simple) {
    problems.push(
      `${call.name} (api.ts line ${call.line}): does more than return what request() gives, ` +
        'so the check cannot read the type it expects. Make it return the request, or add it ' +
        'to SAME_ANSWER or NOT_CHECKED in tests/contract/not-checked.mjs with the reason.',
    );
    continue;
  }
  const key = `${route.file}#${route.className}`;
  if (!importAs.has(key)) {
    const taken = [...importAs.values()].filter((used) => used.className === route.className);
    const alias = taken.length ? `${route.className}_${taken.length + 1}` : route.className;
    importAs.set(key, { file: route.file, className: route.className, alias });
  }
  checks.push({ call, where, route, className: importAs.get(key).alias });
}

for (const name of [...Object.keys(NOT_CHECKED), ...Object.keys(LOOSE_ENUMS)]) {
  if (!usedListed.has(name)) {
    problems.push(
      `${name} is listed in tests/contract/not-checked.mjs but api.ts has no such call.`,
    );
  }
}

if (problems.length) {
  console.error('API contract: the web calls could not all be matched to the server.\n');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

const lines = [
  '// Written by tests/contract/generate.mjs: do not edit, not committed.',
  '// Each check: what the server sends must be something the web can read as its',
  '// type. A failing one is named after the call; see the top of generate.mjs.',
  '',
  "import type { api, kioskApi } from '../../apps/web/src/lib/api';",
  "import type { Answer, Loose, Matches, Reads } from './wire';",
  ...[...importAs.values()]
    .sort((a, b) => a.alias.localeCompare(b.alias))
    .map(({ file, className, alias }) => {
      const from = path.relative(here, file).replace(/\\/g, '/').replace(/\.ts$/, '');
      const name = className === alias ? className : `${className} as ${alias}`;
      return `import type { ${name} } from '${from}';`;
    }),
  '',
  'export type Uses = [typeof api, typeof kioskApi];',
  '',
];
const names = new Set();
for (const { call, where, route, className } of checks) {
  let name = `${call.name.replace('.', '_')}_${call.method}`;
  for (let n = 2; names.has(name); n += 1)
    name = `${call.name.replace('.', '_')}_${call.method}_${n}`;
  names.add(name);
  let reads = `Reads<typeof ${call.name}>`;
  let answer = `Answer<${className}['${route.methodName}']>`;
  if (LOOSE_ENUMS[call.name]) {
    reads = `Loose<${reads}>`;
    answer = `Loose<${answer}>`;
  }
  lines.push(
    `// ${call.name} (apps/web/src/lib/api.ts line ${call.line}): ${where} -> ${route.label}`,
    `export type ${name} = Matches<${reads}, ${answer}>;`,
  );
}
fs.writeFileSync(outFile, `${lines.join('\n')}\n`);

const checkedCalls = new Set(checks.map(({ call }) => call.name)).size;
console.log(
  `API contract: ${checkedCalls} calls (${checks.length} routes) checked against the server, ` +
    `${notChecked.length} left out (--list names them).`,
);
if (process.argv.includes('--list')) {
  for (const { call, where, reason } of notChecked) {
    console.log(`  left out: ${call.name} ${where}: ${reason}`);
  }
}
