import { HttpError } from '../lib/http-error.js';

export function requireTrustedOrigin(configuration) {
  return (request, _response, next) => {
    const origin = request.get('origin');
    if (origin && origin !== configuration.webOrigin) {
      return next(new HttpError(403, 'Request origin is not allowed.', 'ORIGIN_NOT_ALLOWED'));
    }
    return next();
  };
}