import express from 'express';
import { openDb, serializeSettings, deserializeSettings, serializeAcceptanceCriteria, deserializeAcceptanceCriteria } from './db.js';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// Middleware d'authentification (req.user.id doit être présent)
function ensureAuth(req, res, next) {
  if (!req.user || !req.user.id) {
    return res.status(401).json({ error: 'Non authentifié' });
  }
  next();
}

// Liste des projets accessibles à l'utilisateur
router.get('/api/projects', ensureAuth, (req, res) => {
  const db = openDb();
  const userId = req.user.id;
  const stmt = db.prepare(`
    SELECT p.id, p.name, p.ownerId, p.createdAt, p.updatedAt, pa.accessLevel
    FROM projects p
    JOIN project_access pa ON pa.projectId = p.id
    WHERE pa.userId = ?
  `);
  const projects = stmt.all(userId);
  res.json(projects);
});

// Création d'un projet
router.post('/api/projects', ensureAuth, (req, res) => {
  const db = openDb();
  const userId = req.user.id;
  const { name, settings } = req.body;
  const id = uuidv4();
  const now = new Date().toISOString();
  // S'assurer que l'utilisateur existe dans la table users
  db.prepare(
    `INSERT OR IGNORE INTO users (id, email, displayName) VALUES (?, ?, ?)`
  ).run(userId, req.user.email || '', req.user.displayName || '');

  db.prepare(
    `INSERT INTO projects (id, name, ownerId, settings, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, name, userId, serializeSettings(settings), now, now);
  db.prepare(
    `INSERT INTO project_access (userId, projectId, accessLevel) VALUES (?, ?, 'owner')`
  ).run(userId, id);
  res.status(201).json({ id, name, ownerId: userId, createdAt: now, updatedAt: now });
});

// Détail d'un projet (avec settings)
router.get('/api/projects/:projectId', ensureAuth, (req, res) => {
  const db = openDb();
  const userId = req.user.id;
  const { projectId } = req.params;
  const project = db.prepare(
    `SELECT p.*, pa.accessLevel FROM projects p JOIN project_access pa ON pa.projectId = p.id WHERE p.id = ? AND pa.userId = ?`
  ).get(projectId, userId);
  if (!project) return res.status(404).json({ error: 'Projet non trouvé' });
  project.settings = deserializeSettings(project.settings);
  res.json(project);
});

// Mise à jour d'un projet (nom, settings)
router.put('/api/projects/:projectId', ensureAuth, (req, res) => {
  const db = openDb();
  const userId = req.user.id;
  const { projectId } = req.params;
  const { name, settings } = req.body;
  // Vérifier droits
  const access = db.prepare(`SELECT accessLevel FROM project_access WHERE userId = ? AND projectId = ?`).get(userId, projectId);
  if (!access || (access.accessLevel !== 'write' && access.accessLevel !== 'owner')) {
    return res.status(403).json({ error: 'Droits insuffisants' });
  }
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE projects SET name = ?, settings = ?, updatedAt = ? WHERE id = ?`
  ).run(name, serializeSettings(settings), now, projectId);
  res.json({ success: true });
});

// Suppression d'un projet
router.delete('/api/projects/:projectId', ensureAuth, (req, res) => {
  const db = openDb();
  const userId = req.user.id;
  const { projectId } = req.params;
  // Vérifier droits
  const access = db.prepare(`SELECT accessLevel FROM project_access WHERE userId = ? AND projectId = ?`).get(userId, projectId);
  if (!access || access.accessLevel !== 'owner') {
    return res.status(403).json({ error: 'Droits insuffisants' });
  }
  db.prepare(`DELETE FROM user_stories WHERE projectId = ?`).run(projectId);
  db.prepare(`DELETE FROM project_access WHERE projectId = ?`).run(projectId);
  db.prepare(`DELETE FROM projects WHERE id = ?`).run(projectId);
  res.json({ success: true });
});

// --- Projet sélectionné par utilisateur ---
router.get('/api/user/selected-project', ensureAuth, (req, res) => {
  const db = openDb();
  const userId = req.user.id;
  const row = db.prepare('SELECT selectedProjectId FROM users WHERE id = ?').get(userId);
  res.json({ selectedProjectId: row?.selectedProjectId || null });
});

router.put('/api/user/selected-project', ensureAuth, (req, res) => {
  const db = openDb();
  const userId = req.user.id;
  const { selectedProjectId } = req.body;
  db.prepare('UPDATE users SET selectedProjectId = ? WHERE id = ?').run(selectedProjectId, userId);
  res.json({ success: true });
});

export default router;
