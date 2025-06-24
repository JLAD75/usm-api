import express from 'express';
import { openDb, deserializeSettings, serializeSettings, deserializeAcceptanceCriteria, serializeAcceptanceCriteria } from './db.js';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

function ensureAuth(req, res, next) {
  if (!req.user || !req.user.id) {
    return res.status(401).json({ error: 'Non authentifié' });
  }
  next();
}

// Exporter un projet (settings + user stories)
router.get('/projects/:projectId/export', ensureAuth, (req, res) => {
  const db = openDb();
  const userId = req.user.id;
  const { projectId } = req.params;
  const access = db.prepare('SELECT accessLevel FROM project_access WHERE userId = ? AND projectId = ?').get(userId, projectId);
  if (!access) return res.status(403).json({ error: 'Accès refusé' });
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!project) return res.status(404).json({ error: 'Projet non trouvé' });
  const userStories = db.prepare('SELECT * FROM user_stories WHERE projectId = ? ORDER BY "order" ASC').all(projectId);
  project.settings = deserializeSettings(project.settings);
  userStories.forEach(s => s.acceptanceCriteria = deserializeAcceptanceCriteria(s.acceptanceCriteria));
  res.json({
    name: project.name,
    settings: project.settings,
    userStories
  });
});

// Importer un projet (crée un nouveau projet pour l'utilisateur courant)
router.post('/projects/import', ensureAuth, (req, res) => {
  const db = openDb();
  db.pragma('foreign_keys = ON'); // Sécurité : active les contraintes FK
  const userId = req.user.id;
  const { name, settings, userStories } = req.body;
  if (!name || !settings || !Array.isArray(userStories)) {
    return res.status(400).json({ error: 'Format d\'import invalide' });
  }
  // Patch : crée l'utilisateur s'il n'existe pas
  const userExists = db.prepare('SELECT 1 FROM users WHERE id = ?').get(userId);
  if (!userExists) {
    db.prepare(
      `INSERT INTO users (id, email, displayName, selectedProjectId, theme) VALUES (?, ?, ?, NULL, 'system')`
    ).run(userId, req.user.email || '', req.user.displayName || '');
  }
  const projectId = uuidv4();
  const now = new Date().toISOString();
  try {
    db.transaction(() => {
      db.prepare(
        `INSERT INTO projects (id, name, ownerId, settings, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)`
      ).run(projectId, name, userId, serializeSettings(settings), now, now);
      db.prepare(
        `INSERT INTO project_access (userId, projectId, accessLevel) VALUES (?, ?, 'owner')`
      ).run(userId, projectId);
      for (const story of userStories) {
        const storyId = story.id || uuidv4();
        db.prepare(
          `INSERT INTO user_stories (id, projectId, "order", epic, userRole, title, acceptanceCriteria, priority, estimation, justification, estimatedStartDate, estimatedEndDate, dependency, status, kanbanOrder, comment, blockedSince)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          storyId, projectId, story.order, story.epic, story.userRole, story.title,
          serializeAcceptanceCriteria(story.acceptanceCriteria), story.priority, story.estimation,
          story.justification, story.estimatedStartDate, story.estimatedEndDate, story.dependency,
          story.status, story.kanbanOrder, story.comment, story.blockedSince
        );
      }
    })();
    res.status(201).json({ id: projectId, name, ownerId: userId, createdAt: now, updatedAt: now });
  } catch (e) {
    res.status(500).json({ error: 'Erreur lors de l\'import', details: e.message });
  }
});

export default router;
