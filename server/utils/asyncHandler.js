/**
 * Express 4 does not catch rejected promises: an await that throws becomes an unhandled
 * rejection and the request hangs until it times out. This forwards it to the error handler.
 */
export default function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}
