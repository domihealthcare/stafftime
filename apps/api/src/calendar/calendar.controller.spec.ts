import { CalendarController } from './calendar.controller';

const SET_AT = new Date('2026-10-29T14:00:00.000Z');
const user = { id: 'emp-1' } as never;

describe('CalendarController, the link', () => {
  function build() {
    const calendar = {
      currentLink: jest.fn().mockResolvedValue({ hasLink: true, setAt: SET_AT }),
      issueToken: jest.fn().mockResolvedValue({ token: 'brand-new-token', setAt: SET_AT }),
    };
    return { controller: new CalendarController(calendar as never), calendar };
  }

  it('reading says a link exists and since when, and carries no token', async () => {
    const { controller } = build();
    const answer = await controller.link(user);
    expect(answer).toEqual({ hasLink: true, createdAt: SET_AT });
    expect(answer).not.toHaveProperty('token');
  });

  it('making one hands the new token back, the one time it is ever sent', async () => {
    const { controller, calendar } = build();
    await expect(controller.issue(user)).resolves.toEqual({
      token: 'brand-new-token',
      createdAt: SET_AT,
    });
    expect(calendar.issueToken).toHaveBeenCalledWith('emp-1');
  });
});
