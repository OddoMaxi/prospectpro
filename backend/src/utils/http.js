// Erreur métier renvoyée telle quelle au client avec son code HTTP
class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

const ah = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { HttpError, ah };
