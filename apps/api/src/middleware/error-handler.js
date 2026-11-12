import { HttpError } from '../lib/http-error.js';

export function notFoundHandler(request, _response, next) {
  const error = new Error(`Route ${request.method} ${request.path} was not found.`);
  error.statusCode = 404;
  next(error);
}

export function errorHandler(error, _request, response, next) {
  if (response.headersSent) {
    return next(error);
  }

  const isUniqueConstraintError = error.code === 'P2002';
  const statusCode = error instanceof HttpError
    ? error.statusCode
    : isUniqueConstraintError
      ? 409
      : Number.isInteger(error.statusCode)
        ? error.statusCode
        : 500;
  const message = isUniqueConstraintError
    ? 'A record with that email already exists.'
    : error instanceof HttpError
      ? error.message
      : statusCode >= 500
        ? 'Internal server error.'
        : error.message;

  if (statusCode >= 500 && !(error instanceof HttpError)) {
    console.error('Unhandled API error.');
  }

  return response.status(statusCode).json({
    success: false,
    error: {
      message,
      ...(error instanceof HttpError && error.code ? { code: error.code } : {}),
    },
  });
}