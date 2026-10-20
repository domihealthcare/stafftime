import { Fragment, useId, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  blanksOf,
  fillTemplate,
  parseGuide,
  parseInline,
  type Block,
  type ListItem,
} from '../lib/guide-markup';
import { buttonClass, inputClass } from './ui';
import { GuideTool } from './GuideTools';

/**
 * A guide section, drawn from its markup (`lib/guide-markup.ts`). Text is
 * only ever text: no HTML from a section reaches the page.
 *
 * A copy block shows a box for each blank; what is typed in them stays in
 * this page's memory and goes only to the clipboard, never to the server
 * (a message script can carry a patient's symptoms).
 */
export function GuideBody({ body }: { body: string }) {
  const blocks = parseGuide(body);
  return (
    <div className="space-y-3 text-sm leading-relaxed text-slate-800">
      {blocks.map((block, index) => (
        <BlockView key={index} block={block} />
      ))}
    </div>
  );
}

function BlockView({ block }: { block: Block }) {
  switch (block.kind) {
    case 'heading':
      return (
        <h4 className="pt-1 text-sm font-semibold text-slate-900">
          <InlineText text={block.text} />
        </h4>
      );
    case 'paragraph':
      return (
        <p>
          <InlineText text={block.text} />
        </p>
      );
    case 'warning':
      return (
        <p
          role="note"
          className="rounded-lg bg-rose-50 px-3 py-2 font-medium text-rose-900 ring-1 ring-inset ring-rose-200"
        >
          <InlineText text={block.text} />
        </p>
      );
    case 'list':
      return <ListView ordered={block.ordered} items={block.items} />;
    case 'table':
      return (
        <div className="overflow-x-auto rounded-lg ring-1 ring-slate-200">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
              <tr>
                {block.head.map((cell, index) => (
                  <th key={index} scope="col" className="px-3 py-2 font-semibold">
                    <InlineText text={cell} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-t border-slate-100 align-top">
                  {block.head.map((_, index) => (
                    <td key={index} className="px-3 py-1.5">
                      <InlineText text={row[index] ?? ''} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'copy':
      return <CopyBlock text={block.text} />;
    case 'tool':
      return <GuideTool name={block.name} />;
  }
}

/// Nested lists from items with a level each.
function ListView({ ordered, items }: { ordered: boolean; items: ListItem[] }) {
  type Node = { text: string; children: Node[] };
  const root: Node[] = [];
  const stack: { level: number; children: Node[] }[] = [{ level: -1, children: root }];
  for (const item of items) {
    while (stack.length > 1 && stack[stack.length - 1].level >= item.level) stack.pop();
    const node: Node = { text: item.text, children: [] };
    stack[stack.length - 1].children.push(node);
    stack.push({ level: item.level, children: node.children });
  }
  const render = (nodes: Node[], depth: number): ReactNode => {
    const List = ordered && depth === 0 ? 'ol' : 'ul';
    return (
      <List
        className={`space-y-1 pl-5 ${
          List === 'ol' ? 'list-decimal' : depth === 0 ? 'list-disc' : 'list-[circle]'
        }`}
      >
        {nodes.map((node, index) => (
          <li key={index}>
            <InlineText text={node.text} />
            {node.children.length > 0 && (
              <div className="mt-1">{render(node.children, depth + 1)}</div>
            )}
          </li>
        ))}
      </List>
    );
  };
  return <>{render(root, 0)}</>;
}

export function InlineText({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((part, index) => {
        switch (part.kind) {
          case 'text':
            return <Fragment key={index}>{part.text}</Fragment>;
          case 'bold':
            return (
              <strong key={index} className="font-semibold text-slate-900">
                {part.text}
              </strong>
            );
          case 'action':
            return (
              <mark
                key={index}
                className="rounded bg-amber-100 px-1 font-medium text-amber-900"
                data-testid="action"
              >
                {part.text}
              </mark>
            );
          case 'blank':
            return (
              <span key={index} className="rounded bg-slate-100 px-1 italic text-slate-600">
                {part.label}
              </span>
            );
          case 'link':
            return part.href.startsWith('/') ? (
              <Link key={index} to={part.href} className="font-medium text-brand-700 underline">
                {part.text}
              </Link>
            ) : (
              <a
                key={index}
                href={part.href}
                target="_blank"
                rel="noreferrer noopener"
                className="font-medium text-brand-700 underline"
              >
                {part.text}
              </a>
            );
        }
      })}
    </>
  );
}

/// A template to fill in and copy: a box per blank, the result as it will be
/// pasted, and **Copy**.
function CopyBlock({ text }: { text: string }) {
  const blanks = blanksOf(text);
  const [values, setValues] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState<'yes' | 'no' | null>(null);
  const id = useId();
  const result = fillTemplate(text, values);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(result);
      setCopied('yes');
    } catch {
      setCopied('no');
    }
    window.setTimeout(() => setCopied(null), 2500);
  };
  return (
    <div
      className="rounded-lg bg-slate-50 p-3 ring-1 ring-inset ring-slate-200"
      data-testid="copy-block"
    >
      {blanks.length > 0 && (
        <div className="mb-3 grid gap-2 sm:grid-cols-2">
          {blanks.map((label, index) => (
            <div key={label}>
              <label
                htmlFor={`${id}-${index}`}
                className="block text-xs font-medium text-slate-700"
              >
                {label}
              </label>
              <input
                id={`${id}-${index}`}
                className={`${inputClass} mt-0.5`}
                autoComplete="off"
                value={values[label] ?? ''}
                onChange={(event) => setValues({ ...values, [label]: event.target.value })}
              />
            </div>
          ))}
        </div>
      )}
      <p
        className="whitespace-pre-wrap rounded-md bg-white p-2 font-mono text-[13px] text-slate-800 ring-1 ring-inset ring-slate-200"
        data-testid="copy-text"
      >
        {result}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void copy()} className={buttonClass('primary', 'sm')}>
          Copy
        </button>
        {blanks.length > 0 && Object.values(values).some((value) => value !== '') && (
          <button
            type="button"
            onClick={() => setValues({})}
            className={buttonClass('secondary', 'sm')}
          >
            Clear
          </button>
        )}
        <span role="status" className="text-xs text-slate-600">
          {copied === 'yes'
            ? 'Copied. Paste it where it goes.'
            : copied === 'no'
              ? 'Could not copy: select the text and copy it yourself.'
              : blanks.length > 0
                ? 'What you type here is not saved or sent anywhere.'
                : ''}
        </span>
      </div>
    </div>
  );
}
