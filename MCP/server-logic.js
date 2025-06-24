import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { openDb } from "../db.js";

export const server = new McpServer({
  name: "User Stories MCP Server",
  version: "1.0.0",
});




// Tool réel : liste des projets depuis ta base
server.tool(
  "list_projects",
  "Retourne la liste des projets accessibles",
  async () => {
    const stmt = openDb().prepare(`
        SELECT *
        FROM projects p
        JOIN project_access pa ON pa.projectId = p.id
      `);
    let projects = stmt.all();
    // On parse settings avant la validation/sérialisation finale
    projects = projects.map((p) => ({
      ...p,
      settings: JSON.parse(p.settings),
    }));
    // La clé MCP : tu serializes en texte.
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(projects, null, 2),
        },
      ],
    };
  }
);
  
  // Exemple d’outil pour récupérer le détail d’un projet par ID
server.tool(
    "get_project_user_stories",
    "Récupère toutes les User stories d'un projet en fonction de son ID",
    { projectId: z.string() },
    async ({ projectId }) => {
        const userStories = openDb()
            .prepare("SELECT * FROM user_stories WHERE projectId = ?")
            .all(projectId); // Utilise .all() pour récupérer tous les enregistrements
        return { content: [{ type: "text", text: JSON.stringify(userStories) }] };
    }
);
  
  // Ajoute ici d’autres tools réels MCP...
