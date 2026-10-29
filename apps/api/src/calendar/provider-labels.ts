/**
 * What the providers calendar calls each provider (October 2026, Dominguez):
 * "Dr. Hernandez", as the practice's own schedule writes them, and a first
 * initial when two providers would read the same ("there are 2 Dr.
 * Dominguez's - there should be a clarification i.e. J Dominguez or D
 * Dominguez"): "Dr. J Dominguez", "Dr. D Dominguez". Somebody who is not a
 * doctor goes by their first name, with a last initial if that is shared.
 *
 * Worked out over every current provider, not only the ones on screen, so a
 * name reads the same in every week and month.
 */
export interface Labelled {
  id: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  postNominals: string | null;
}

export function isDoctor(person: Pick<Labelled, 'postNominals'>): boolean {
  return Boolean(person.postNominals && /\b(MD|DO)\b/i.test(person.postNominals));
}

function first(person: Labelled): string {
  return (person.preferredName ?? person.firstName).trim();
}

/// Plain, then with an initial, then in full: the first that tells them apart.
function ways(person: Labelled): string[] {
  const given = first(person);
  const last = person.lastName.trim();
  return isDoctor(person)
    ? [`Dr. ${last}`, `Dr. ${given.charAt(0)} ${last}`, `Dr. ${given} ${last}`]
    : [given, `${given} ${last.charAt(0)}`, `${given} ${last}`];
}

/// Each person's label, by id.
export function providerLabels(people: Labelled[]): Map<string, string> {
  const unique = [...new Map(people.map((person) => [person.id, person])).values()];
  const labels = new Map<string, string>();
  for (const person of unique) {
    const options = ways(person);
    const clashes = (index: number) =>
      unique.some(
        (other) =>
          other.id !== person.id &&
          ways(other)[index].toLowerCase() === options[index].toLowerCase(),
      );
    const level = [0, 1].find((index) => !clashes(index)) ?? 2;
    labels.set(person.id, options[level]);
  }
  return labels;
}
