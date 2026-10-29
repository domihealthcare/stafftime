import { providerLabels } from './provider-labels';

const person = (
  id: string,
  firstName: string,
  lastName: string,
  postNominals: string | null = 'MD',
  preferredName: string | null = null,
) => ({ id, firstName, lastName, preferredName, postNominals });

describe('providerLabels', () => {
  it('calls a doctor "Dr." and their last name, as the practice schedule does', () => {
    const labels = providerLabels([
      person('a', 'Kim', 'Hernandez'),
      person('b', 'Jose', 'Badia', 'DO'),
    ]);
    expect(labels.get('a')).toBe('Dr. Hernandez');
    expect(labels.get('b')).toBe('Dr. Badia');
  });

  it('tells two doctors with one last name apart by a first initial', () => {
    const labels = providerLabels([
      person('j', 'Jonathan', 'Dominguez'),
      person('d', 'Daniel', 'Dominguez'),
      person('h', 'Kim', 'Hernandez'),
    ]);
    expect(labels.get('j')).toBe('Dr. J Dominguez');
    expect(labels.get('d')).toBe('Dr. D Dominguez');
    expect(labels.get('h')).toBe('Dr. Hernandez');
  });

  it('gives the whole first name when the initial is shared too, and ignores case', () => {
    const labels = providerLabels([person('a', 'Dana', 'Lee'), person('b', 'David', 'LEE')]);
    expect(labels.get('a')).toBe('Dr. Dana Lee');
    expect(labels.get('b')).toBe('Dr. David LEE');
  });

  it('uses the name somebody goes by for the initial', () => {
    const labels = providerLabels([
      person('a', 'Jonathan', 'Dominguez', 'MD', 'Johnny'),
      person('b', 'Juan', 'Dominguez'),
    ]);
    // Both start with J: the full names it is.
    expect(labels.get('a')).toBe('Dr. Johnny Dominguez');
    expect(labels.get('b')).toBe('Dr. Juan Dominguez');
  });

  it('calls a provider who is not a doctor by first name, with a last initial if shared', () => {
    const labels = providerLabels([
      person('a', 'Casey', 'Nolan', 'APN'),
      person('b', 'Casey', 'Ruiz', null),
      person('c', 'Morgan', 'Ruiz', 'PA-C'),
    ]);
    expect(labels.get('a')).toBe('Casey N');
    expect(labels.get('b')).toBe('Casey R');
    expect(labels.get('c')).toBe('Morgan');
  });

  it('counts somebody listed twice once', () => {
    const one = person('a', 'Kim', 'Hernandez');
    expect(providerLabels([one, one]).get('a')).toBe('Dr. Hernandez');
  });
});
