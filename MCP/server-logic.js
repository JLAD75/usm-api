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
  {},
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
    
    let summary = "## 📁 Projets disponibles\n\n";
    projects.forEach(project => {
      const createdAt = new Date(project.createdAt).toLocaleDateString('fr-FR');
      summary += `### ${project.name}\n`;
      summary += `**ID:** ${project.id}\n`;
      summary += `**Créé le:** ${createdAt}\n`;
      summary += `**Propriétaire:** ${project.ownerId}\n\n`;
    });
    
    return {
      content: [
        {
          type: "text",
          text: summary,
        },
      ],
    };
  }
);
  
// Exemple d'outil pour récupérer le détail d'un projet par ID
server.tool(
    "get_project_user_stories",
    "Récupère toutes les User stories d'un projet en fonction de son ID (⚠️ Pour les métriques, utilisez get_project_metrics à la place)",
    { 
        projectId: z.string(),
        forMetrics: z.boolean().optional().default(false).describe("Si true, redirige vers get_project_metrics")
    },
    async ({ projectId, forMetrics = false }) => {
        // Si c'est pour des métriques, rediriger vers get_project_metrics
        if (forMetrics) {
            const db = openDb();
            const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId);
            if (!project) {
                return { content: [{ type: "text", text: "❌ Projet non trouvé avec cet ID." }] };
            }
            
            // Appeler get_project_metrics directement
            const totalStories = db.prepare("SELECT COUNT(*) as count FROM user_stories WHERE projectId = ?").get(projectId);
            const completedStories = db.prepare("SELECT COUNT(*) as count FROM user_stories WHERE projectId = ? AND status = 'completed'").get(projectId);
            const inProgressStories = db.prepare("SELECT COUNT(*) as count FROM user_stories WHERE projectId = ? AND status = 'in_progress'").get(projectId);
            const todoStories = db.prepare("SELECT COUNT(*) as count FROM user_stories WHERE projectId = ? AND status = 'todo'").get(projectId);
            
            const completionRate = totalStories.count > 0 ? Math.round((completedStories.count / totalStories.count) * 100) : 0;
            
            let summary = `## 📊 Métriques du projet: ${project.name}\n\n`;
            summary += `### 🎯 Progression globale\n`;
            summary += `**Taux de completion:** ${completionRate}%\n`;
            summary += `**Stories terminées:** ${completedStories.count}\n`;
            summary += `**Stories en cours:** ${inProgressStories.count}\n`;
            summary += `**Stories à faire:** ${todoStories.count}\n\n`;
            
            return { content: [{ type: "text", text: summary }] };
        }
        const userStories = openDb()
            .prepare("SELECT * FROM user_stories WHERE projectId = ? ORDER BY priority DESC, createdAt DESC")
            .all(projectId);
        
        if (userStories.length === 0) {
            return { content: [{ type: "text", text: "❌ Aucune user story trouvée pour ce projet." }] };
        }
        
        let summary = `## 📋 User Stories du projet (${userStories.length})\n\n`;
        summary += `> 💡 **Note:** Pour les métriques détaillées du projet, utilisez l'outil **get_project_metrics** à la place.\n\n`;
        
        // Grouper par statut
        const byStatus = {
            completed: userStories.filter(s => s.status === 'completed'),
            in_progress: userStories.filter(s => s.status === 'in_progress'),
            todo: userStories.filter(s => s.status === 'todo')
        };
        
        if (byStatus.completed.length > 0) {
            const displayCount = Math.min(byStatus.completed.length, 20); // Limiter à 20 stories
            summary += `### ✅ Terminées (${byStatus.completed.length} total, affichage des ${displayCount} plus récentes)\n`;
            byStatus.completed.slice(0, displayCount).forEach(story => {
                const priority = story.priority === 'high' ? '🔴' : story.priority === 'medium' ? '🟡' : '🟢';
                summary += `${priority} **${story.title}** - ${story.complexity || '?'} points\n`;
            });
            if (byStatus.completed.length > displayCount) {
                summary += `... et ${byStatus.completed.length - displayCount} autres stories terminées\n`;
            }
            summary += '\n';
        }
        
        if (byStatus.in_progress.length > 0) {
            const displayCount = Math.min(byStatus.in_progress.length, 20);
            summary += `### 🔄 En cours (${byStatus.in_progress.length} total, affichage des ${displayCount} plus récentes)\n`;
            byStatus.in_progress.slice(0, displayCount).forEach(story => {
                const priority = story.priority === 'high' ? '🔴' : story.priority === 'medium' ? '🟡' : '🟢';
                summary += `${priority} **${story.title}** - ${story.complexity || '?'} points\n`;
            });
            if (byStatus.in_progress.length > displayCount) {
                summary += `... et ${byStatus.in_progress.length - displayCount} autres stories en cours\n`;
            }
            summary += '\n';
        }
        
        if (byStatus.todo.length > 0) {
            const displayCount = Math.min(byStatus.todo.length, 20);
            summary += `### ⏳ À faire (${byStatus.todo.length} total, affichage des ${displayCount} plus prioritaires)\n`;
            byStatus.todo.slice(0, displayCount).forEach(story => {
                const priority = story.priority === 'high' ? '🔴' : story.priority === 'medium' ? '🟡' : '🟢';
                summary += `${priority} **${story.title}** - ${story.complexity || '?'} points\n`;
            });
            if (byStatus.todo.length > displayCount) {
                summary += `... et ${byStatus.todo.length - displayCount} autres stories à faire\n`;
            }
            summary += '\n';
        }
        
        return { content: [{ type: "text", text: summary }] };
    }
);

// Nouvel outil : Détails complets d'une user story spécifique
server.tool(
    "get_user_story_details",
    "Récupère les détails complets d'une user story spécifique avec ses dépendances, commentaires et métriques",
    { 
        userStoryId: z.string().describe("ID de la user story à analyser"),
        includeDependencies: z.boolean().optional().default(true).describe("Inclure les dépendances"),
        includeComments: z.boolean().optional().default(true).describe("Inclure les commentaires"),
        includeMetrics: z.boolean().optional().default(true).describe("Inclure les métriques de progression")
    },
    async ({ userStoryId, includeDependencies = true, includeComments = true, includeMetrics = true }) => {
        const db = openDb();
        
        // Récupérer la user story principale
        const userStory = db.prepare("SELECT * FROM user_stories WHERE id = ?").get(userStoryId);
        
        if (!userStory) {
            return { 
                content: [{ 
                    type: "text", 
                    text: "❌ User story non trouvée avec cet ID." 
                }] 
            };
        }
        
        let summary = `## 📋 User Story: ${userStory.title}\n\n`;
        summary += `| Propriété | Valeur |\n`;
        summary += `|-----------|--------|\n`;
        // Gérer les différents formats de statut et priorité
        let statusText, priorityText;
        
        if (userStory.status === 'completed' || userStory.status === 'done') {
            statusText = '✅ Terminée';
        } else if (userStory.status === 'in_progress' || userStory.status === 'inProgress') {
            statusText = '🔄 En cours';
        } else {
            statusText = '⏳ À faire';
        }
        
        if (userStory.priority === 'high' || userStory.priority === 'Must Have') {
            priorityText = '🔴 Haute';
        } else if (userStory.priority === 'medium' || userStory.priority === 'Should Have') {
            priorityText = '🟡 Moyenne';
        } else if (userStory.priority === 'low' || userStory.priority === 'Could Have') {
            priorityText = '🟢 Basse';
        } else {
            priorityText = `⚪ ${userStory.priority}`;
        }
        
        summary += `| **Statut** | ${statusText} |\n`;
        summary += `| **Priorité** | ${priorityText} |\n`;
        summary += `| **Estimation** | ${userStory.estimation || 'Non définie'} jours |\n`;
        summary += `| **Date de début** | ${userStory.estimatedStartDate ? new Date(userStory.estimatedStartDate).toLocaleDateString('fr-FR') : 'Non définie'} |\n`;
        summary += `| **Date de fin** | ${userStory.estimatedEndDate ? new Date(userStory.estimatedEndDate).toLocaleDateString('fr-FR') : 'Non définie'} |\n\n`;
        summary += `### 📝 Description\n\n`;
        summary += `> ${userStory.description || 'Aucune description'}\n\n`;
        
        // Ajouter les dépendances si demandé
        if (includeDependencies) {
            const dependencies = db.prepare(`
                SELECT us.*, 
                       CASE WHEN d.dependencyType = 'blocks' THEN 'bloque' 
                            WHEN d.dependencyType = 'depends_on' THEN 'dépend de'
                            ELSE d.dependencyType END as relation
                FROM user_stories us
                JOIN dependencies d ON (d.blockingStoryId = us.id OR d.blockedStoryId = us.id)
                WHERE (d.blockingStoryId = ? OR d.blockedStoryId = ?)
                AND us.id != ?
            `).all(userStoryId, userStoryId, userStoryId);
            
            if (dependencies.length > 0) {
                summary += `## 🔗 Dépendances (${dependencies.length})\n\n`;
                summary += `| Story | Statut | Relation |\n`;
                summary += `|-------|--------|----------|\n`;
                dependencies.forEach(dep => {
                    const status = dep.status === 'completed' ? '✅' : dep.status === 'in_progress' ? '🔄' : '⏳';
                    summary += `| **${dep.title}** | ${status} | ${dep.relation} |\n`;
                });
                summary += '\n';
            }
        }
        
        // Ajouter les commentaires si demandé
        if (includeComments) {
            const comments = db.prepare(`
                SELECT c.*, u.displayName as authorName
                FROM comments c
                LEFT JOIN users u ON c.authorId = u.id
                WHERE c.userStoryId = ?
                ORDER BY c.createdAt ASC
            `).all(userStoryId);
            
            if (comments.length > 0) {
                summary += `## 💬 Commentaires (${comments.length})\n\n`;
                comments.forEach(comment => {
                    const date = new Date(comment.createdAt).toLocaleDateString('fr-FR');
                    summary += `### 💭 ${comment.authorName || 'Anonyme'} - ${date}\n\n`;
                    summary += `> ${comment.content}\n\n`;
                });
            }
        }
        
        // Ajouter les métriques si demandé
        if (includeMetrics) {
            const totalStories = db.prepare("SELECT COUNT(*) as count FROM user_stories WHERE projectId = ?").get(userStory.projectId);
            const completedStories = db.prepare("SELECT COUNT(*) as count FROM user_stories WHERE projectId = ? AND status = 'completed'").get(userStory.projectId);
            const estimationStats = db.prepare(`
                SELECT 
                    AVG(CAST(estimation AS INTEGER)) as avgEstimation,
                    MIN(CAST(estimation AS INTEGER)) as minEstimation,
                    MAX(CAST(estimation AS INTEGER)) as maxEstimation
                FROM user_stories 
                WHERE projectId = ? AND estimation IS NOT NULL
            `).get(userStory.projectId);
            
            const completionRate = totalStories.count > 0 ? Math.round((completedStories.count / totalStories.count) * 100) : 0;
            
            summary += `## 📊 Métriques du projet\n\n`;
            summary += `| Métrique | Valeur |\n`;
            summary += `|----------|--------|\n`;
            summary += `| **Progression globale** | ${completionRate}% (${completedStories.count}/${totalStories.count}) |\n`;
                    summary += `| **Estimation moyenne** | ${Math.round(estimationStats.avgEstimation || 0)} jours |\n`;
        summary += `| **Estimation de cette story** | ${parseInt(userStory.estimation) || 0} jours |\n\n`;
        }
        
        return { 
            content: [{ 
                type: "text", 
                text: summary 
            }] 
        };
    }
);

// Nouvel outil : Métriques détaillées du projet
server.tool(
    "get_project_metrics",
    "Récupère des métriques détaillées sur un projet : progression, vélocité, burndown, répartition par statut et priorité",
    { 
        projectId: z.string().describe("ID du projet à analyser"),
        includeSprintData: z.boolean().optional().default(true).describe("Inclure les données de sprint"),
        includeTrends: z.boolean().optional().default(true).describe("Inclure les tendances sur 30 jours")
    },
    async ({ projectId, includeSprintData = true, includeTrends = true }) => {
        const db = openDb();
        
        // Vérifier que le projet existe
        const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId);
        if (!project) {
            return { 
                content: [{ 
                    type: "text", 
                    text: "❌ Projet non trouvé avec cet ID." 
                }] 
            };
        }
        
        let summary = `## 📊 Métriques du projet: ${project.name}\n\n`;
        
        // Métriques de base
        const totalStories = db.prepare("SELECT COUNT(*) as count FROM user_stories WHERE projectId = ?").get(projectId);
        const doneStories = db.prepare("SELECT COUNT(*) as count FROM user_stories WHERE projectId = ? AND status = 'done'").get(projectId);
        const inProgressStories = db.prepare("SELECT COUNT(*) as count FROM user_stories WHERE projectId = ? AND status = 'inProgress'").get(projectId);
        const todoStories = db.prepare("SELECT COUNT(*) as count FROM user_stories WHERE projectId = ? AND status = 'todo'").get(projectId);
        const blockedStories = db.prepare("SELECT COUNT(*) as count FROM user_stories WHERE projectId = ? AND status = 'blocked'").get(projectId);
        const toTestStories = db.prepare("SELECT COUNT(*) as count FROM user_stories WHERE projectId = ? AND status = 'toTest'").get(projectId);
        
        const completionRate = totalStories.count > 0 ? Math.round((doneStories.count / totalStories.count) * 100) : 0;
        
        summary += `### 🎯 Progression globale\n\n`;
        summary += `| Métrique | Valeur | Statut |\n`;
        summary += `|----------|--------|--------|\n`;
        summary += `| **Taux de completion** | ${completionRate}% | ${completionRate >= 80 ? '✅' : completionRate >= 60 ? '🟡' : '🔴'} |\n`;
        summary += `| **Stories terminées** | ${doneStories.count} | ✅ |\n`;
        summary += `| **Stories en cours** | ${inProgressStories.count} | 🔄 |\n`;
        summary += `| **Stories à faire** | ${todoStories.count} | ⏳ |\n`;
        summary += `| **Stories en difficulté** | ${blockedStories.count} | 🚧 |\n`;
        summary += `| **Stories à recetter** | ${toTestStories.count} | 🧪 |\n\n`;
        
        // Répartition par priorité
        const priorityDistribution = db.prepare(`
            SELECT priority, COUNT(*) as count
            FROM user_stories 
            WHERE projectId = ?
            GROUP BY priority
            ORDER BY priority DESC
        `).all(projectId);
        
        if (priorityDistribution.length > 0) {
            summary += `### 🔴🟡🟢 Répartition par priorité\n\n`;
            summary += `| Priorité | Nombre | Pourcentage |\n`;
            summary += `|----------|--------|-------------|\n`;
            priorityDistribution.forEach(p => {
                // Gérer les différents formats de priorité
                let icon, priorityName;
                if (p.priority === 'high' || p.priority === 'Must Have') {
                    icon = '🔴';
                    priorityName = 'Haute';
                } else if (p.priority === 'medium' || p.priority === 'Should Have') {
                    icon = '🟡';
                    priorityName = 'Moyenne';
                } else if (p.priority === 'low' || p.priority === 'Could Have') {
                    icon = '🟢';
                    priorityName = 'Basse';
                } else {
                    icon = '⚪';
                    priorityName = p.priority;
                }
                const percentage = Math.round((p.count / totalStories.count) * 100);
                summary += `| ${icon} **${priorityName}** | ${p.count} | ${percentage}% |\n`;
            });
            summary += '\n';
        }
        
        // Répartition par estimation (limité aux 10 plus fréquentes)
        const estimationDistribution = db.prepare(`
            SELECT estimation, COUNT(*) as count
            FROM user_stories 
            WHERE projectId = ? AND estimation IS NOT NULL
            GROUP BY estimation
            ORDER BY count DESC
            LIMIT 10
        `).all(projectId);
        
        if (estimationDistribution.length > 0) {
            summary += `### 📈 Répartition par estimation (top 10)\n\n`;
            summary += `| Jours | Nombre | Complexité |\n`;
            summary += `|--------|--------|------------|\n`;
            estimationDistribution.forEach(e => {
                const level = e.estimation <= 3 ? '🟢' : e.estimation <= 8 ? '🟡' : '🔴';
                const complexity = e.estimation <= 3 ? 'Simple' : e.estimation <= 8 ? 'Moyenne' : 'Complexe';
                summary += `| **${e.estimation}** | ${e.count} | ${level} ${complexity} |\n`;
            });
            summary += '\n';
        }
        
        // Métriques de vélocité (si des sprints existent, limité aux 10 derniers)
        if (includeSprintData) {
            const sprintStories = db.prepare(`
                SELECT 
                    us.sprint,
                    COUNT(*) as totalStories,
                    SUM(CASE WHEN us.status = 'done' THEN 1 ELSE 0 END) as completedStories,
                    AVG(CAST(us.estimation AS INTEGER)) as avgEstimation
                FROM user_stories us
                WHERE us.projectId = ? AND us.sprint IS NOT NULL
                GROUP BY us.sprint
                ORDER BY CAST(us.sprint AS INTEGER) DESC
                LIMIT 10
            `).all(projectId);
            
            if (sprintStories.length > 0) {
                summary += `### 🏃‍♂️ Vélocité par sprint (10 derniers)\n\n`;
                summary += `| Sprint | Terminées/Total | Taux | Jours moy. | Performance |\n`;
                summary += `|--------|----------------|------|-------------|-------------|\n`;
                sprintStories.reverse().forEach(sprint => { // Remettre dans l'ordre chronologique
                    const completionRate = sprint.totalStories > 0 ? Math.round((sprint.completedStories / sprint.totalStories) * 100) : 0;
                    const status = completionRate >= 80 ? '✅' : completionRate >= 60 ? '🟡' : '🔴';
                    const performance = completionRate >= 80 ? 'Excellent' : completionRate >= 60 ? 'Bon' : 'À améliorer';
                    summary += `| **Sprint ${sprint.sprint}** | ${sprint.completedStories}/${sprint.totalStories} | ${completionRate}% | ${Math.round(sprint.avgEstimation || 0)} | ${status} ${performance} |\n`;
                });
                summary += '\n';
            }
        }
        
        // Estimation du temps restant
        const avgEstimation = db.prepare(`
            SELECT AVG(CAST(estimation AS INTEGER)) as avg
            FROM user_stories 
            WHERE projectId = ? AND estimation IS NOT NULL
        `).get(projectId);
        
        const remainingStories = totalStories.count - doneStories.count;
        const estimatedRemainingDays = avgEstimation.avg ? Math.ceil(remainingStories * avgEstimation.avg / 2) : 0;
        
        summary += `### ⏱️ Estimations\n\n`;
        summary += `| Métrique | Valeur |\n`;
        summary += `|----------|--------|\n`;
        summary += `| **Estimation moyenne** | ${Math.round(avgEstimation.avg || 0)} jours |\n`;
        summary += `| **Stories restantes** | ${remainingStories} |\n`;
        summary += `| **Temps estimé** | ${estimatedRemainingDays} jours |\n`;
        summary += `| **Hypothèse** | 2 jours/story |\n\n`;
        
        // Ajouter des insights basés sur les données
        summary += `> 💡 **Insights:** `;
        if (completionRate >= 80) {
            summary += `Excellent taux de completion ! Le projet progresse bien.`;
        } else if (completionRate >= 60) {
            summary += `Bon taux de completion. Considérez identifier les blocages pour améliorer la vélocité.`;
        } else {
            summary += `Taux de completion faible. Analysez les causes et ajustez la planification.`;
        }
        summary += `\n\n`;
        
        return { 
            content: [{ 
                type: "text", 
                text: summary 
            }] 
        };
    }
);

// Nouvel outil : Analyse de sprint
server.tool(
    "get_sprint_analysis",
    "Analyse détaillée d'un sprint spécifique : burndown, vélocité, blocages, et recommandations",
    { 
        projectId: z.string().describe("ID du projet"),
        sprintNumber: z.string().describe("Numéro du sprint à analyser"),
        includeRecommendations: z.boolean().optional().default(true).describe("Inclure des recommandations d'amélioration")
    },
    async ({ projectId, sprintNumber, includeRecommendations = true }) => {
        const db = openDb();
        
        // Récupérer toutes les user stories du sprint
        const sprintStories = db.prepare(`
            SELECT * FROM user_stories 
            WHERE projectId = ? AND sprint = ?
            ORDER BY priority DESC, estimation DESC
        `).all(projectId, sprintNumber);
        
        if (sprintStories.length === 0) {
            return { 
                content: [{ 
                    type: "text", 
                    text: `❌ Aucune user story trouvée pour le sprint ${sprintNumber}.` 
                }] 
            };
        }
        
        let summary = `## 🏃‍♂️ Analyse du Sprint ${sprintNumber}\n\n`;
        summary += `**Total des stories:** ${sprintStories.length}\n\n`;
        
        // Statistiques de base
        const done = sprintStories.filter(s => s.status === 'done').length;
        const inProgress = sprintStories.filter(s => s.status === 'inProgress').length;
        const todo = sprintStories.filter(s => s.status === 'todo').length;
        const blocked = sprintStories.filter(s => s.status === 'blocked').length;
        const toTest = sprintStories.filter(s => s.status === 'toTest').length;
        const completionRate = Math.round((done / sprintStories.length) * 100);
        
        summary += `### 📊 Statut du sprint\n\n`;
        summary += `| Statut | Nombre | Pourcentage |\n`;
        summary += `|--------|--------|-------------|\n`;
        summary += `| ✅ **Terminées** | ${done} | ${Math.round((done / sprintStories.length) * 100)}% |\n`;
        summary += `| 🔄 **En cours** | ${inProgress} | ${Math.round((inProgress / sprintStories.length) * 100)}% |\n`;
        summary += `| ⏳ **À faire** | ${todo} | ${Math.round((todo / sprintStories.length) * 100)}% |\n`;
        summary += `| 🚧 **En difficulté** | ${blocked} | ${Math.round((blocked / sprintStories.length) * 100)}% |\n`;
        summary += `| 🧪 **À recetter** | ${toTest} | ${Math.round((toTest / sprintStories.length) * 100)}% |\n\n`;
        summary += `**Taux de completion global:** ${completionRate}% ${completionRate >= 80 ? '✅' : completionRate >= 60 ? '🟡' : '🔴'}\n\n`;
        
        // Analyse d'estimation
        const validEstimations = sprintStories
            .filter(s => s.estimation && !isNaN(parseInt(s.estimation)))
            .map(s => parseInt(s.estimation));
        
        const totalEstimation = validEstimations.reduce((sum, e) => sum + e, 0);
        const completedEstimation = sprintStories
            .filter(s => s.status === 'done' && s.estimation && !isNaN(parseInt(s.estimation)))
            .reduce((sum, s) => sum + parseInt(s.estimation), 0);
        
        summary += `### 📈 Analyse d'estimation\n\n`;
        summary += `| Métrique | Valeur |\n`;
        summary += `|----------|--------|\n`;
        summary += `| **Jours totaux** | ${totalEstimation} |\n`;
        summary += `| **Jours terminés** | ${completedEstimation} |\n`;
        summary += `| **Jours restants** | ${totalEstimation - completedEstimation} |\n`;
        summary += `| **Estimation moyenne** | ${validEstimations.length > 0 ? Math.round(totalEstimation / validEstimations.length) : 0} jours |\n`;
        summary += `| **Progression jours** | ${totalEstimation > 0 ? Math.round((completedEstimation / totalEstimation) * 100) : 0}% |\n\n`;
        
        // Analyse des blocages
        const blockedStories = db.prepare(`
            SELECT us.*, d.dependencyType
            FROM user_stories us
            JOIN dependencies d ON (d.blockingStoryId = us.id OR d.blockedStoryId = us.id)
            WHERE us.projectId = ? AND us.sprint = ?
        `).all(projectId, sprintNumber);
        
        if (blockedStories.length > 0) {
            summary += `### 🚧 Stories bloquées (${blockedStories.length})\n\n`;
            summary += `| Story | Statut | Type de dépendance |\n`;
            summary += `|-------|--------|-------------------|\n`;
            blockedStories.forEach(story => {
                const status = story.status === 'completed' ? '✅' : story.status === 'in_progress' ? '🔄' : '⏳';
                summary += `| **${story.title}** | ${status} | ${story.dependencyType} |\n`;
            });
            summary += '\n';
        }
        
        // Recommandations
        if (includeRecommendations) {
            const recommendations = [];
            
            if (completionRate < 70) {
                recommendations.push("🔴 **Taux de completion faible:** Considérez réduire la charge du sprint ou identifier les blocages.");
            }
            
            if (blockedStories.length > 0) {
                recommendations.push("🔴 **Stories bloquées:** Priorisez la résolution des dépendances.");
            }
            
            const highEstimation = validEstimations.filter(e => e > 8).length;
            if (highEstimation > validEstimations.length / 2) {
                recommendations.push("🟡 **Trop de stories avec estimation élevée:** Considérez décomposer les stories de haute estimation.");
            }
            
            if (recommendations.length > 0) {
                summary += `### 💡 Recommandations\n\n`;
                recommendations.forEach(rec => {
                    summary += `- [ ] ${rec}\n`;
                });
                summary += '\n';
            }
        }
        
        return { 
            content: [{ 
                type: "text", 
                text: summary 
            }] 
        };
    }
);

// Création d'une user story
server.tool(
  "create_user_story",
  "Crée une nouvelle user story dans le projet spécifié.",
  {
    projectId: z.string(),
    epic: z.string().optional(),
    userRole: z.string().optional(),
    title: z.string(),
    justification: z.string().optional(),
    estimation: z.number().int().optional(),
    priority: z.string().optional(),
    dependency: z.string().optional(),
    acceptanceCriteria: z.string().optional(),
    status: z.string().optional(),
  },
  async (params) => {
    const db = openDb();
    const id = `${Date.now()}-${Math.floor(Math.random()*10000)}`;
    db.prepare(`INSERT INTO user_stories (id, projectId, epic, userRole, title, justification, estimation, priority, dependency, acceptanceCriteria, status, "order") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        id,
        params.projectId,
        params.epic || null,
        params.userRole || null,
        params.title,
        params.justification || null,
        params.estimation || null,
        params.priority || null,
        params.dependency || null,
        params.acceptanceCriteria || null,
        params.status || "todo",
        Date.now()
      );
    const story = db.prepare("SELECT * FROM user_stories WHERE id = ?").get(id);
    return {
      content: [{
        type: "text",
        text: `✅ Nouvelle user story créée :\n\n- **ID** : ${story.id}\n- **Titre** : ${story.title}\n- **Statut** : ${story.status}\n- **Priorité** : ${story.priority || "-"}\n- **Estimation** : ${story.estimation || "-"}\n- **Epic** : ${story.epic || "-"}`
      }]
    };
  }
);

// Mise à jour de chaque champ
const updateFields = [
  { name: "title", label: "Titre" },
  { name: "epic", label: "Epic" },
  { name: "userRole", label: "Rôle utilisateur" },
  { name: "justification", label: "Justification" },
  { name: "estimation", label: "Estimation" },
  { name: "priority", label: "Priorité" },
  { name: "dependency", label: "Dépendance" },
  { name: "acceptanceCriteria", label: "Critères d'acceptation" },
  { name: "status", label: "Statut" },
];

for (const field of updateFields) {
  server.tool(
    `update_user_story_${field.name}`,
    `Met à jour le champ ${field.label} d'une user story par son ID.`,
    {
      id: z.string(),
      value: z.any(),
    },
    async ({ id, value }) => {
      const db = openDb();
      const story = db.prepare("SELECT * FROM user_stories WHERE id = ?").get(id);
      if (!story) {
        return { content: [{ type: "text", text: `❌ User story non trouvée avec l'ID ${id}` }] };
      }
      db.prepare(`UPDATE user_stories SET ${field.name} = ? WHERE id = ?`).run(value, id);
      const updated = db.prepare("SELECT * FROM user_stories WHERE id = ?").get(id);
      return {
        content: [{
          type: "text",
          text: `✏️ User story modifiée :\n\n- **ID** : ${updated.id}\n- **Titre** : ${updated.title}\n- **${field.label}** : ${updated[field.name]}`
        }]
      };
    }
  );
}

// Suppression d'une user story
server.tool(
  "delete_user_story",
  "Supprime une user story par son ID.",
  {
    id: z.string(),
  },
  async ({ id }) => {
    const db = openDb();
    const story = db.prepare("SELECT * FROM user_stories WHERE id = ?").get(id);
    if (!story) {
      return { content: [{ type: "text", text: `❌ User story non trouvée avec l'ID ${id}` }] };
    }
    db.prepare("DELETE FROM user_stories WHERE id = ?").run(id);
    return {
      content: [{ type: "text", text: `🗑️ User story supprimée :\n\n- **ID** : ${story.id}\n- **Titre** : ${story.title}` }]
    };
  }
);

// Filtrage avancé des user stories
server.tool(
  "get_filtered_user_stories",
  "Filtre et affiche les user stories selon des critères spécifiques : statut, epic, priorité, estimation, dates, critères d'acceptation",
  {
    projectId: z.string().describe("ID du projet"),
    status: z.string().optional().describe("Filtrer par statut (done, inProgress, todo, blocked, toTest)"),
    epic: z.string().optional().describe("Filtrer par epic (recherche partielle)"),
    priority: z.string().optional().describe("Filtrer par priorité (high, medium, low)"),
    minEstimation: z.number().optional().describe("Estimation minimale en jours"),
    maxEstimation: z.number().optional().describe("Estimation maximale en jours"),
    startDate: z.string().optional().describe("Date de début pour le filtrage par période (YYYY-MM-DD)"),
    endDate: z.string().optional().describe("Date de fin pour le filtrage par période (YYYY-MM-DD)"),
    hasAcceptanceCriteria: z.boolean().optional().describe("Filtrer par présence de critères d'acceptation (true/false)"),
    orderBy: z.string().optional().default("order").describe("Champ de tri (order, title, priority, estimation, status)"),
    orderDirection: z.string().optional().default("ASC").describe("Direction du tri (ASC/DESC)"),
    limit: z.number().optional().describe("Limite du nombre de résultats")
  },
  async (params) => {
    const db = openDb();
    
    // Vérifier que le projet existe
    const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(params.projectId);
    if (!project) {
      return { 
        content: [{ 
          type: "text", 
          text: "❌ Projet non trouvé avec cet ID." 
        }] 
      };
    }
    
    let query = "SELECT * FROM user_stories WHERE projectId = ?";
    let queryParams = [params.projectId];
    
    // Appliquer les filtres
    if (params.status) {
      query += " AND status = ?";
      queryParams.push(params.status);
    }
    
    if (params.epic) {
      query += " AND epic LIKE ?";
      queryParams.push(`%${params.epic}%`);
    }
    
    if (params.priority) {
      query += " AND priority = ?";
      queryParams.push(params.priority);
    }
    
    if (params.minEstimation !== undefined) {
      query += " AND estimation >= ?";
      queryParams.push(params.minEstimation);
    }
    
    if (params.maxEstimation !== undefined) {
      query += " AND estimation <= ?";
      queryParams.push(params.maxEstimation);
    }
    
    if (params.startDate && params.endDate) {
      query += " AND estimatedStartDate BETWEEN ? AND ?";
      queryParams.push(params.startDate, params.endDate);
    }
    
    if (params.hasAcceptanceCriteria === true) {
      query += " AND acceptanceCriteria IS NOT NULL AND acceptanceCriteria != '[]' AND acceptanceCriteria != ''";
    }
    
    if (params.hasAcceptanceCriteria === false) {
      query += " AND (acceptanceCriteria IS NULL OR acceptanceCriteria = '[]' OR acceptanceCriteria = '')";
    }
    
    // Tri
    const orderBy = params.orderBy || "order";
    const orderDirection = params.orderDirection || "ASC";
    // Utiliser des guillemets pour éviter les conflits avec les mots réservés SQL
    const safeOrderBy = orderBy === "order" ? '"order"' : orderBy;
    query += ` ORDER BY ${safeOrderBy} ${orderDirection}`;
    
    // Limite
    if (params.limit) {
      query += " LIMIT ?";
      queryParams.push(params.limit);
    }
    
    const filteredStories = db.prepare(query).all(...queryParams);
    
    if (filteredStories.length === 0) {
      return { 
        content: [{ 
          type: "text", 
          text: "❌ Aucune user story trouvée avec les critères spécifiés." 
        }] 
      };
    }
    
    // Formater le résultat
    let summary = `## 🔍 User Stories filtrées (${filteredStories.length})\n\n`;
    
    // Ajouter les critères de filtrage utilisés
    const filters = [];
    if (params.status) filters.push(`Statut: ${params.status}`);
    if (params.epic) filters.push(`Epic: ${params.epic}`);
    if (params.priority) filters.push(`Priorité: ${params.priority}`);
    if (params.minEstimation !== undefined) filters.push(`Estimation min: ${params.minEstimation} jours`);
    if (params.maxEstimation !== undefined) filters.push(`Estimation max: ${params.maxEstimation} jours`);
    if (params.startDate && params.endDate) filters.push(`Période: ${params.startDate} à ${params.endDate}`);
    if (params.hasAcceptanceCriteria === true) filters.push(`Avec critères d'acceptation`);
    if (params.hasAcceptanceCriteria === false) filters.push(`Sans critères d'acceptation`);
    
    if (filters.length > 0) {
      summary += `### 📋 Critères de filtrage\n`;
      filters.forEach(filter => {
        summary += `- ${filter}\n`;
      });
      summary += '\n';
    }
    
    // Grouper par statut
    const byStatus = {
      done: filteredStories.filter(s => s.status === 'done'),
      inProgress: filteredStories.filter(s => s.status === 'inProgress'),
      todo: filteredStories.filter(s => s.status === 'todo'),
      blocked: filteredStories.filter(s => s.status === 'blocked'),
      toTest: filteredStories.filter(s => s.status === 'toTest')
    };
    
    if (byStatus.done.length > 0) {
      summary += `### ✅ Terminées (${byStatus.done.length})\n`;
      byStatus.done.forEach(story => {
        const priority = story.priority === 'high' ? '🔴' : story.priority === 'medium' ? '🟡' : '🟢';
        summary += `${priority} **${story.title}** - ${story.estimation || '?'} jours`;
        if (story.epic) summary += ` (${story.epic})`;
        summary += '\n';
      });
      summary += '\n';
    }
    
    if (byStatus.inProgress.length > 0) {
      summary += `### 🔄 En cours (${byStatus.inProgress.length})\n`;
      byStatus.inProgress.forEach(story => {
        const priority = story.priority === 'high' ? '🔴' : story.priority === 'medium' ? '🟡' : '🟢';
        summary += `${priority} **${story.title}** - ${story.estimation || '?'} jours`;
        if (story.epic) summary += ` (${story.epic})`;
        summary += '\n';
      });
      summary += '\n';
    }
    
    if (byStatus.todo.length > 0) {
      summary += `### ⏳ À faire (${byStatus.todo.length})\n`;
      byStatus.todo.forEach(story => {
        const priority = story.priority === 'high' ? '🔴' : story.priority === 'medium' ? '🟡' : '🟢';
        summary += `${priority} **${story.title}** - ${story.estimation || '?'} jours`;
        if (story.epic) summary += ` (${story.epic})`;
        summary += '\n';
      });
      summary += '\n';
    }
    
    if (byStatus.blocked.length > 0) {
      summary += `### 🚧 En difficulté (${byStatus.blocked.length})\n`;
      byStatus.blocked.forEach(story => {
        const priority = story.priority === 'high' ? '🔴' : story.priority === 'medium' ? '🟡' : '🟢';
        summary += `${priority} **${story.title}** - ${story.estimation || '?'} jours`;
        if (story.epic) summary += ` (${story.epic})`;
        summary += '\n';
      });
      summary += '\n';
    }
    
    if (byStatus.toTest.length > 0) {
      summary += `### 🧪 À recetter (${byStatus.toTest.length})\n`;
      byStatus.toTest.forEach(story => {
        const priority = story.priority === 'high' ? '🔴' : story.priority === 'medium' ? '🟡' : '🟢';
        summary += `${priority} **${story.title}** - ${story.estimation || '?'} jours`;
        if (story.epic) summary += ` (${story.epic})`;
        summary += '\n';
      });
      summary += '\n';
    }
    
    summary = summary.replace(/\\n/g, '\n');
    
    return { 
      content: [{ 
        type: "text", 
        text: summary 
      }] 
    };
  }
);
