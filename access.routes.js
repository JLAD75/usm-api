import express from 'express';
import { openDb } from './db.js';

const router = express.Router();

// Middleware d'authentification (req.user.id doit être présent)
function ensureAuth(req, res, next) {
  if (!req.user || !req.user.id) {
    return res.status(401).json({ error: 'Non authentifié' });
  }
  next();
}

// Lister les accès d'un projet
router.get('/projects/:projectId/access', ensureAuth, (req, res) => {
  const db = openDb();
  const userId = req.user.id;
  const { projectId } = req.params;
  // Vérifier droits
  const access = db.prepare('SELECT accessLevel FROM project_access WHERE userId = ? AND projectId = ?').get(userId, projectId);
  if (!access || access.accessLevel !== 'owner') {
    return res.status(403).json({ error: 'Droits insuffisants' });
  }
  const users = db.prepare(`SELECT pa.userId, pa.accessLevel, u.email, u.displayName FROM project_access pa JOIN users u ON pa.userId = u.id WHERE pa.projectId = ?`).all(projectId);
  res.json(users);
});

// Ajouter ou modifier un accès
router.post('/projects/:projectId/access', ensureAuth, (req, res) => {
  const db = openDb();
  const userId = req.user.id;
  const { projectId } = req.params;
  const { targetUserId, accessLevel } = req.body;
  // Vérifier droits
  const access = db.prepare('SELECT accessLevel FROM project_access WHERE userId = ? AND projectId = ?').get(userId, projectId);
  if (!access || access.accessLevel !== 'owner') {
    return res.status(403).json({ error: 'Droits insuffisants' });
  }
  // Empêcher de retirer le dernier owner
  if (accessLevel !== 'owner') {
    const owners = db.prepare(`SELECT userId FROM project_access WHERE projectId = ? AND accessLevel = 'owner'`).all(projectId);
    if (owners.length === 1 && owners[0].userId === targetUserId) {
      return res.status(400).json({ error: 'Impossible de retirer le dernier propriétaire.' });
    }
  }
  db.prepare(
    `INSERT INTO project_access (userId, projectId, accessLevel) VALUES (?, ?, ?)
     ON CONFLICT(userId, projectId) DO UPDATE SET accessLevel=excluded.accessLevel`
  ).run(targetUserId, projectId, accessLevel);
  res.json({ success: true });
});

// Supprimer un accès
router.delete('/projects/:projectId/access/:targetUserId', ensureAuth, (req, res) => {
  const db = openDb();
  const userId = req.user.id;
  const { projectId, targetUserId } = req.params;
  // Vérifier droits
  const access = db.prepare('SELECT accessLevel FROM project_access WHERE userId = ? AND projectId = ?').get(userId, projectId);
  if (!access || access.accessLevel !== 'owner') {
    return res.status(403).json({ error: 'Droits insuffisants' });
  }
  // Empêcher de retirer le dernier owner
  const owners = db.prepare(`SELECT userId FROM project_access WHERE projectId = ? AND accessLevel = 'owner'`).all(projectId);
  if (owners.length === 1 && owners[0].userId === targetUserId) {
    return res.status(400).json({ error: 'Impossible de retirer le dernier propriétaire.' });
  }
  db.prepare(`DELETE FROM project_access WHERE userId = ? AND projectId = ?`).run(targetUserId, projectId);
  res.json({ success: true });
});

export default router;
