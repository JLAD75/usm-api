// Middleware d'authentification pour MCP (utilise la logique existante)
export function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) return next();
  res.status(401).json({ error: 'Unauthorized' });
}
