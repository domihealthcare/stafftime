/**
 * Reading links out of a browser's bookmarks, or a pasted list, for Resources
 * → Add several links (November 2026, Dominguez: "i have a bunch of links from
 * bookmarked sites that staff use"). Pure, so it is tested on its own.
 *
 * Every browser exports bookmarks as the same old HTML file (Chrome, Edge,
 * Firefox and Safari alike), with a heading for each folder. The file is read
 * here, in the browser; only the titles and web addresses chosen are sent.
 *
 * A pasted list can be one link to a line, with or without a name: "ADP
 * https://adp.com", "ADP, adp.com", "ADP<tab>https://adp.com",
 * "[ADP](https://adp.com)", or just the address.
 */

export interface FoundLink {
  title: string;
  url: string;
  /// The bookmarks folder it was in, if any.
  folder: string | null;
}

export interface ReadLinks {
  links: FoundLink[];
  /// Bookmarks that are not web addresses (a bookmarklet, a browser's own
  /// pages), left out.
  ignored: number;
}

/// The longest name a resource takes.
const MAX_TITLE = 160;

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  '#39': "'",
};

function decode(text: string): string {
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+|#39);/gi, (whole, name: string) => {
      if (/^#x/i.test(name)) return String.fromCodePoint(parseInt(name.slice(2), 16));
      if (/^#\d+$/.test(name) && name !== '#39') return String.fromCodePoint(Number(name.slice(1)));
      return ENTITIES[name.toLowerCase()] ?? whole;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

/// A web address as Resources keeps it, or null for anything that is not
/// one (a `javascript:` bookmarklet, `chrome://settings`, a file).
export function webAddress(value: string): string | null {
  const trimmed = value.trim().replace(/[),.;]+$/, '');
  if (!trimmed) return null;
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (!url.hostname.includes('.')) return null;
    return url.href;
  } catch {
    return null;
  }
}

/// A name for a link with none: its site, without the "www.".
export function nameFor(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function named(title: string, url: string): string {
  const cleaned = title.trim().slice(0, MAX_TITLE).trim();
  return cleaned.length >= 2 ? cleaned : nameFor(url);
}

/// A browser's exported bookmarks file, folders and all.
function fromBookmarksFile(html: string): ReadLinks {
  const links: FoundLink[] = [];
  let ignored = 0;
  const folders: (string | null)[] = [];
  let heading: string | null = null;
  const tokens = /<h3[^>]*>([\s\S]*?)<\/h3>|<dl[^>]*>|<\/dl>|<a\s([^>]*)>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(tokens)) {
    const [whole, headingText, attributes, linkText] = match;
    if (headingText !== undefined) {
      heading = decode(headingText);
    } else if (/^<dl/i.test(whole)) {
      folders.push(heading);
      heading = null;
    } else if (/^<\/dl/i.test(whole)) {
      folders.pop();
    } else if (attributes !== undefined) {
      const href = attributes.match(/href\s*=\s*"([^"]*)"|href\s*=\s*'([^']*)'/i);
      const url = href ? webAddress(decode(href[1] ?? href[2] ?? '')) : null;
      if (!url) {
        ignored += 1;
        continue;
      }
      const folder = [...folders].reverse().find((name) => name) ?? null;
      links.push({ title: named(decode(linkText ?? ''), url), url, folder });
    }
  }
  return { links, ignored };
}

/// Where a web address is in a line of a pasted list, if anywhere.
const ADDRESS =
  /(?:[a-z][a-z0-9+.-]*:\/\/|www\.)[^\s<>"]+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?:\/[^\s<>"]*)?/i;

function fromLines(text: string): ReadLinks {
  const links: FoundLink[] = [];
  let ignored = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const markdown = line.match(/^\s*[-*]?\s*\[([^\]]*)\]\(([^)\s]+)\)/);
    if (markdown) {
      const url = webAddress(markdown[2]);
      if (url) links.push({ title: named(markdown[1], url), url, folder: null });
      else ignored += 1;
      continue;
    }
    if (/^(javascript|chrome|edge|about|file):/i.test(line)) {
      ignored += 1;
      continue;
    }
    const found = line.match(ADDRESS);
    const url = found ? webAddress(found[0]) : null;
    if (!found || !url) continue;
    const title = (line.slice(0, found.index) + ' ' + line.slice(found.index! + found[0].length))
      .replace(/^[\s\-*•|:,;]+|[\s\-–|:,;]+$/g, '')
      .replace(/\s+/g, ' ');
    links.push({ title: named(title, url), url, folder: null });
  }
  return { links, ignored };
}

/// Every link in a bookmarks file or a pasted list, each address once.
export function readLinks(text: string): ReadLinks {
  const read = /<a\s[^>]*href/i.test(text) ? fromBookmarksFile(text) : fromLines(text);
  const seen = new Set<string>();
  const links = read.links.filter((link) => {
    if (seen.has(link.url)) return false;
    seen.add(link.url);
    return true;
  });
  return { links, ignored: read.ignored };
}
