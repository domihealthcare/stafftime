import { describe, expect, it } from 'vitest';
import { nameFor, readLinks, webAddress } from './bookmarks';

/// What Chrome's Export bookmarks writes, cut down.
const CHROME_EXPORT = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file. -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 ADD_DATE="1" PERSONAL_TOOLBAR_FOLDER="true">Bookmarks bar</H3>
    <DL><p>
        <DT><A HREF="https://workforcenow.adp.com/" ADD_DATE="1" ICON="data:image/png;base64,AAAA">ADP Workforce</A>
        <DT><H3 ADD_DATE="1">Insurance portals</H3>
        <DL><p>
            <DT><A HREF="https://www.availity.com/">Availity &amp; claims</A>
            <DT><A HREF="https://provider.horizonblue.com/">Horizon</A>
            <DT><A HREF="javascript:alert('hi')">A bookmarklet</A>
        </DL><p>
        <DT><A HREF="https://quest.com/">Quest</A>
        <DT><A HREF="https://workforcenow.adp.com/">ADP again</A>
    </DL><p>
    <DT><A HREF="chrome://settings">Settings</A>
</DL><p>`;

describe('readLinks: a bookmarks file', () => {
  it('reads each link with the folder it was in', () => {
    const { links, ignored } = readLinks(CHROME_EXPORT);
    expect(links).toEqual([
      { title: 'ADP Workforce', url: 'https://workforcenow.adp.com/', folder: 'Bookmarks bar' },
      { title: 'Availity & claims', url: 'https://www.availity.com/', folder: 'Insurance portals' },
      { title: 'Horizon', url: 'https://provider.horizonblue.com/', folder: 'Insurance portals' },
      { title: 'Quest', url: 'https://quest.com/', folder: 'Bookmarks bar' },
    ]);
    // The bookmarklet and the browser's own page.
    expect(ignored).toBe(2);
  });
});

describe('readLinks: a pasted list', () => {
  it('takes a name and an address in any of the usual shapes', () => {
    const { links } = readLinks(
      [
        'ADP https://workforcenow.adp.com',
        'Availity, availity.com',
        'Quest\thttps://quest.com/results',
        '- [Horizon](https://provider.horizonblue.com)',
        'LabCorp - www.labcorp.com/',
        '',
        'https://www.cms.gov/medicare',
      ].join('\n'),
    );
    expect(links.map((link) => [link.title, link.url])).toEqual([
      ['ADP', 'https://workforcenow.adp.com/'],
      ['Availity', 'https://availity.com/'],
      ['Quest', 'https://quest.com/results'],
      ['Horizon', 'https://provider.horizonblue.com/'],
      ['LabCorp', 'https://www.labcorp.com/'],
      ['cms.gov', 'https://www.cms.gov/medicare'],
    ]);
  });

  it('skips lines with no address, and anything that is not a web address', () => {
    const { links, ignored } = readLinks(
      'Our portals:\njavascript:void(0)\nfile:///C:/x.pdf\nadp.com',
    );
    expect(links.map((link) => link.url)).toEqual(['https://adp.com/']);
    expect(ignored).toBe(2);
  });

  it('keeps each address once', () => {
    expect(readLinks('ADP adp.com\nADP again https://adp.com/').links).toHaveLength(1);
  });
});

describe('webAddress and nameFor', () => {
  it('reads an address as a web address, or not at all', () => {
    expect(webAddress('availity.com')).toBe('https://availity.com/');
    expect(webAddress('https://x.com/a).')).toBe('https://x.com/a');
    expect(webAddress('javascript:alert(1)')).toBeNull();
    expect(webAddress('localhost')).toBeNull();
  });

  it('names a link by its site', () => {
    expect(nameFor('https://www.availity.com/path')).toBe('availity.com');
  });
});
