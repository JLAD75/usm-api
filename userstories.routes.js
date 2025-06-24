import express from 'express';
import { openDb, serializeAcceptanceCriteria, deserializeAcceptanceCriteria } from './db.js';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// Middleware d'authentification (req.user.id doit être présent)
function ensureAuth(req, res, next) {
  if (!req.user || !req.user.id) {
    return res.status(401).json({ error: 'Non authentifié' });
  }
  next();
}

// Adapter toutes les requêtes à better-sqlite3 (synchrone)

// Liste des user stories d'un projet
router.get('/api/projects/:projectId/userstories', ensureAuth, (req, res) => {
  const db = openDb();
  const userId = req.user.id;
  const { projectId } = req.params;
  // Vérifier accès
  const access = db.prepare('SELECT accessLevel FROM project_access WHERE userId = ? AND projectId = ?').get(userId, projectId);
  if (!access) return res.status(403).json({ error: 'Accès refusé' });
  const stories = db.prepare('SELECT * FROM user_stories WHERE projectId = ? ORDER BY "order" ASC').all(projectId);
  // Désérialiser acceptanceCriteria
  stories.forEach(s => s.acceptanceCriteria = deserializeAcceptanceCriteria(s.acceptanceCriteria));
  res.json(stories);
});

// Création d'une user story
router.post('/api/projects/:projectId/userstories', ensureAuth, (req, res) => {
  const db = openDb();
  const userId = req.user.id;
  const { projectId } = req.params;
  const story = req.body;
  // Vérifier droits
  const access = db.prepare('SELECT accessLevel FROM project_access WHERE userId = ? AND projectId = ?').get(userId, projectId);
  if (!access || (access.accessLevel !== 'write' && access.accessLevel !== 'owner')) {
    return res.status(403).json({ error: 'Droits insuffisants' });
  }
  const id = story.id || uuidv4();
  db.prepare(`INSERT INTO user_stories (id, projectId, "order", epic, userRole, title, acceptanceCriteria, priority, estimation, justification, estimatedStartDate, estimatedEndDate, dependency, status, kanbanOrder, comment, blockedSince)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, projectId, story.order, story.epic, story.userRole, story.title, serializeAcceptanceCriteria(story.acceptanceCriteria), story.priority, story.estimation, story.justification, story.estimatedStartDate, story.estimatedEndDate, story.dependency, story.status, story.kanbanOrder, story.comment, story.blockedSince
  );
  res.status(201).json({ id });
});

// Mise à jour d'une user story
router.put('/api/projects/:projectId/userstories/:storyId', ensureAuth, (req, res) => {
  const db = openDb();
  const userId = req.user.id;
  const { projectId, storyId } = req.params;
  const story = req.body;
  // Vérifier droits
  const access = db.prepare('SELECT accessLevel FROM project_access WHERE userId = ? AND projectId = ?').get(userId, projectId);
  if (!access || (access.accessLevel !== 'write' && access.accessLevel !== 'owner')) {
    return res.status(403).json({ error: 'Droits insuffisants' });
  }
  db.prepare(
    `UPDATE user_stories SET "order"=?, epic=?, userRole=?, title=?, acceptanceCriteria=?, priority=?, estimation=?, justification=?, estimatedStartDate=?, estimatedEndDate=?, dependency=?, status=?, kanbanOrder=?, comment=?, blockedSince=? WHERE id=? AND projectId=?`
  ).run(
    story.order, story.epic, story.userRole, story.title, serializeAcceptanceCriteria(story.acceptanceCriteria), story.priority, story.estimation, story.justification, story.estimatedStartDate, story.estimatedEndDate, story.dependency, story.status, story.kanbanOrder, story.comment, story.blockedSince, storyId, projectId
  );
  res.json({ success: true });
});

// Suppression d'une user story
router.delete('/api/projects/:projectId/userstories/:storyId', ensureAuth, (req, res) => {
  const db = openDb();
  const userId = req.user.id;
  const { projectId, storyId } = req.params;
  // Vérifier droits
  const access = db.prepare('SELECT accessLevel FROM project_access WHERE userId = ? AND projectId = ?').get(userId, projectId);
  if (!access || (access.accessLevel !== 'write' && access.accessLevel !== 'owner')) {
    return res.status(403).json({ error: 'Droits insuffisants' });
  }
  db.prepare(`DELETE FROM user_stories WHERE id = ? AND projectId = ?`).run(storyId, projectId);
  res.json({ success: true });
});

export default router;
