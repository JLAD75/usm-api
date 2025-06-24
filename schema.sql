-- Schéma SQL pour User Stories Manager V2 (SQLite)

-- Table des utilisateurs
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    displayName TEXT,
    selectedProjectId TEXT,
    theme TEXT DEFAULT 'system' -- 'light', 'dark', 'system'
);

-- Table des projets
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    ownerId TEXT NOT NULL,
    settings TEXT NOT NULL, -- JSON (hors thème)
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    FOREIGN KEY(ownerId) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_projects_ownerId ON projects(ownerId);

-- Table des user stories
CREATE TABLE IF NOT EXISTS user_stories (
    id TEXT NOT NULL,
    projectId TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    epic TEXT,
    userRole TEXT,
    title TEXT,
    acceptanceCriteria TEXT NOT NULL, -- JSON array
    priority TEXT,
    estimation INTEGER,
    justification TEXT,
    estimatedStartDate TEXT, -- ISO string
    estimatedEndDate TEXT,   -- ISO string
    dependency TEXT,
    status TEXT,
    kanbanOrder INTEGER,
    comment TEXT,
    blockedSince TEXT, -- ISO string
    FOREIGN KEY(projectId) REFERENCES projects(id),
    PRIMARY KEY (projectId, id)
);
CREATE INDEX IF NOT EXISTS idx_user_stories_projectId ON user_stories(projectId);

-- Table des droits d'accès aux projets
CREATE TABLE IF NOT EXISTS project_access (
    userId TEXT NOT NULL,
    projectId TEXT NOT NULL,
    accessLevel TEXT NOT NULL, -- 'read', 'write', 'owner'
    PRIMARY KEY(userId, projectId),
    FOREIGN KEY(userId) REFERENCES users(id),
    FOREIGN KEY(projectId) REFERENCES projects(id)
);
CREATE INDEX IF NOT EXISTS idx_project_access_userId ON project_access(userId);
CREATE INDEX IF NOT EXISTS idx_project_access_projectId ON project_access(projectId);
