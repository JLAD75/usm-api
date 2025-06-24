// Connexion better-sqlite3 et modèles pour User Stories Manager V2
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// Correction ES module : __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, 'usm.sqlite');
let db;

export function openDb() {
  if (!db) {
    db = new Database(dbPath);
    // Initialisation du schéma si besoin
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    db.exec(schema);
  }
  return db;
}

export function serializeSettings(settings) {
  return JSON.stringify(settings);
}
export function deserializeSettings(settingsStr) {
  return JSON.parse(settingsStr);
}
export function serializeAcceptanceCriteria(ac) {
  return JSON.stringify(ac);
}
export function deserializeAcceptanceCriteria(acStr) {
  return JSON.parse(acStr);
}
