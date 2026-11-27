import { drawnEmail } from './secret-santa';
import { santaEmailHtml } from './secret-santa-email';

describe('the Secret Santa email', () => {
  const exchange = {
    id: 'x1',
    title: 'Domi Secret Santa 2026',
    budgetDollars: 30,
    when: 'Fri, Dec 18',
    where: 'North Bergen, break room',
  };
  const to = { firstName: 'Frankie', appUrl: 'https://staff.example', link: '/secret-santa/x1' };

  it('puts the name on a gift tag, with the details and a link back', () => {
    const html = drawnEmail(exchange, { name: 'Casey Smith' }).html(to);
    expect(html).toContain('Casey Smith');
    expect(html).toContain('You are buying for');
    expect(html).toContain('Budget $30');
    expect(html).toContain('North Bergen, break room');
    expect(html).toContain('href="https://staff.example/secret-santa/x1"');
    expect(html).toContain('Hello Frankie,');
  });

  it('is Domi, not Domi Healthcare', () => {
    const html = santaEmailHtml({
      exchange,
      firstName: 'Frankie',
      recipient: { name: 'Casey' },
      changed: false,
      appUrl: 'https://staff.example',
      link: '/secret-santa/x1',
    });
    expect(html).toContain('/brand/domi-mark.png');
    expect(html).not.toMatch(/Healthcare/);
    expect(html).toContain('Happy Holidays from Domi');
  });

  it('escapes what people typed', () => {
    const html = drawnEmail(
      { ...exchange, title: '<script>x</script>' },
      { name: 'Casey <b>' },
    ).html(to);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('Casey &lt;b&gt;');
  });

  it('never copies their gift ideas, which change through the season', () => {
    const email = drawnEmail(exchange, { name: 'Casey' });
    expect(email.lines.join(' ')).toContain('look in Domi Staff for the latest');
    expect(email.html(to)).toContain('the latest are always in Domi Staff');
  });

  it('does not say somebody left when the person changed', () => {
    const changed = drawnEmail(exchange, { name: 'Casey' }, true);
    expect(changed.lines.join(' ')).not.toMatch(/left/);
    expect(changed.html(to)).toContain('have changed');
  });
});
