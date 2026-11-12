import { HttpError } from '../lib/http-error.js';

export function requireRole(...allowedRoles) {
  return (request, _response, next) => {
    if (!request.auth) {
      return next(new HttpError(401, 'Authentication is required.', 'AUTHENTICATION_REQUIRED'));
    }
    if (!allowedRoles.includes(request.auth.role)) {
      return next(new HttpError(403, 'You do not have permission to access this resource.', 'FORBIDDEN'));
    }
    return next();
  };
}