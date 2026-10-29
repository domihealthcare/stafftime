import { NOT_FROM_DOMI_STAFF, NOT_JSON, refuseForgedRequest } from './request-origin';

const HOST = 'staff.domihealthcare.com';
const JSON_BODY = { 'content-type': 'application/json', 'content-length': '20' };

describe('refuseForgedRequest', () => {
  describe('where a request came from', () => {
    it('lets through a request from the app itself', () => {
      expect(
        refuseForgedRequest('POST', { host: HOST, 'sec-fetch-site': 'same-origin', ...JSON_BODY }),
      ).toBeNull();
    });

    it('lets through one the person started themselves ("none")', () => {
      expect(
        refuseForgedRequest('POST', { host: HOST, 'sec-fetch-site': 'none', ...JSON_BODY }),
      ).toBeNull();
    });

    it('refuses one from the practice website, a sister subdomain', () => {
      const refusal = refuseForgedRequest('POST', {
        host: HOST,
        'sec-fetch-site': 'same-site',
        origin: 'https://www.domihealthcare.com',
        'content-type': 'application/x-www-form-urlencoded',
        'content-length': '12',
      });
      expect(refusal).toEqual({
        statusCode: 403,
        error: 'Forbidden',
        message: NOT_FROM_DOMI_STAFF,
      });
    });

    it('refuses one from any other site', () => {
      expect(
        refuseForgedRequest('DELETE', {
          host: HOST,
          'sec-fetch-site': 'cross-site',
          origin: 'https://example.com',
        })?.statusCode,
      ).toBe(403);
    });

    it('goes by Sec-Fetch-Site over Origin when a browser sends both', () => {
      // The dev server's proxy rewrites Host, so Origin would not match it, but
      // the browser itself says it is the same origin.
      expect(
        refuseForgedRequest('POST', {
          host: 'localhost:3000',
          origin: 'http://localhost:5173',
          'sec-fetch-site': 'same-origin',
          ...JSON_BODY,
        }),
      ).toBeNull();
    });

    describe('an older browser, with Origin but no Sec-Fetch-Site', () => {
      it('lets it through when Origin names this host', () => {
        expect(
          refuseForgedRequest('PATCH', { host: HOST, origin: `https://${HOST}`, ...JSON_BODY }),
        ).toBeNull();
      });

      it('treats the default port as no port', () => {
        expect(
          refuseForgedRequest('PUT', {
            host: `${HOST}:443`,
            origin: `https://${HOST}`,
            ...JSON_BODY,
          }),
        ).toBeNull();
      });

      it('accepts the host a proxy passed on in X-Forwarded-Host', () => {
        expect(
          refuseForgedRequest('POST', {
            host: 'localhost:3000',
            'x-forwarded-host': 'localhost:5173',
            origin: 'http://localhost:5173',
            ...JSON_BODY,
          }),
        ).toBeNull();
      });

      it('refuses it when Origin names another host', () => {
        expect(
          refuseForgedRequest('POST', {
            host: HOST,
            origin: 'https://www.domihealthcare.com',
            ...JSON_BODY,
          })?.statusCode,
        ).toBe(403);
        expect(
          refuseForgedRequest('POST', {
            host: HOST,
            origin: `https://${HOST}.example.com`,
            ...JSON_BODY,
          })?.statusCode,
        ).toBe(403);
      });

      it('refuses an Origin of "null", or one with no Host to compare it with', () => {
        expect(refuseForgedRequest('POST', { host: HOST, origin: 'null' })?.statusCode).toBe(403);
        expect(refuseForgedRequest('POST', { origin: `https://${HOST}` })?.statusCode).toBe(403);
      });
    });

    it('lets through a request with neither header, which no browser page sends', () => {
      expect(refuseForgedRequest('POST', { host: HOST, ...JSON_BODY })).toBeNull();
      expect(refuseForgedRequest('POST', { host: HOST })).toBeNull();
    });
  });

  describe('what a request carries', () => {
    const fromApp = { host: HOST, 'sec-fetch-site': 'same-origin' };

    it('accepts JSON, with or without a charset', () => {
      expect(refuseForgedRequest('POST', { ...fromApp, ...JSON_BODY })).toBeNull();
      expect(
        refuseForgedRequest('POST', {
          ...fromApp,
          'content-type': 'Application/JSON; charset=utf-8',
          'content-length': '20',
        }),
      ).toBeNull();
    });

    it.each([
      'application/x-www-form-urlencoded',
      'multipart/form-data; boundary=----x',
      'text/plain;charset=UTF-8',
    ])('refuses a body sent as %s, as an HTML form would', (contentType) => {
      expect(
        refuseForgedRequest('POST', {
          ...fromApp,
          'content-type': contentType,
          'content-length': '12',
        }),
      ).toEqual({ statusCode: 415, error: 'Unsupported Media Type', message: NOT_JSON });
    });

    it('refuses a body with no content type, or one sent in chunks', () => {
      expect(refuseForgedRequest('POST', { ...fromApp, 'content-length': '5' })?.statusCode).toBe(
        415,
      );
      expect(
        refuseForgedRequest('PUT', {
          ...fromApp,
          'transfer-encoding': 'chunked',
          'content-type': 'text/plain',
        })?.statusCode,
      ).toBe(415);
    });

    it('accepts a chunked JSON body', () => {
      expect(
        refuseForgedRequest('POST', {
          ...fromApp,
          'transfer-encoding': 'chunked',
          'content-type': 'application/json',
        }),
      ).toBeNull();
    });

    it('does not mind the content type of an empty body', () => {
      expect(refuseForgedRequest('POST', { ...fromApp })).toBeNull();
      expect(
        refuseForgedRequest('DELETE', {
          ...fromApp,
          'content-type': 'text/plain',
          'content-length': '0',
        }),
      ).toBeNull();
    });

    it('checks where it came from first', () => {
      expect(
        refuseForgedRequest('POST', {
          host: HOST,
          'sec-fetch-site': 'cross-site',
          'content-type': 'text/plain',
          'content-length': '5',
        })?.statusCode,
      ).toBe(403);
    });
  });

  it('never refuses a read', () => {
    const forged = {
      host: HOST,
      'sec-fetch-site': 'cross-site',
      origin: 'https://example.com',
      'content-type': 'text/plain',
      'content-length': '5',
    };
    for (const method of ['GET', 'HEAD', 'OPTIONS', 'get']) {
      expect(refuseForgedRequest(method, forged)).toBeNull();
    }
    expect(refuseForgedRequest('post', forged)?.statusCode).toBe(403);
  });

  it('reads the first of a header sent twice', () => {
    expect(
      refuseForgedRequest('POST', {
        host: HOST,
        'sec-fetch-site': ['cross-site', 'same-origin'],
        ...JSON_BODY,
      })?.statusCode,
    ).toBe(403);
  });
});
