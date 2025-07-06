import express from "express";
import { OpenAI } from "openai";

const router = express.Router();

// Import direct des fonctions MCP
import { openDb } from "./db.js";

// Fonction pour lister les projets
async function listProjects() {
	try {
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
		return projects;
	} catch (error) {
		console.error("Erreur lors de la récupération des projets:", error);
		throw error;
	}
}

// Fonction pour récupérer les user stories d'un projet
async function getProjectUserStories(projectId) {
	try {
		const userStories = openDb()
			.prepare("SELECT * FROM user_stories WHERE projectId = ?")
			.all(projectId);
		return userStories;
	} catch (error) {
		console.error("Erreur lors de la récupération des user stories:", error);
		throw error;
	}
}

// Fonction pour exécuter les outils MCP directement
async function executeMcpTool(toolCall) {
	try {
		const { name, arguments: args } = toolCall.function;
		const parsedArgs = JSON.parse(args);
		
		switch (name) {
			case "list_projects":
				const projects = await listProjects();
				return projects;
				
			case "get_project_user_stories":
				const userStories = await getProjectUserStories(parsedArgs.projectId);
				return userStories;
				
			case "get_user_story_details":
			case "get_sprint_analysis":
				// Pour l'instant, retourner un message d'information
				return `ℹ️ L'outil ${name} n'est pas encore implémenté dans cette version. Utilisez get_project_metrics pour les métriques du projet.`;
				
			case "get_filtered_user_stories":
				const dbFiltered = openDb();
				let query = "SELECT * FROM user_stories WHERE projectId = ?";
				let params = [parsedArgs.projectId];
				
				// Filtres disponibles
				if (parsedArgs.status) {
					query += " AND status = ?";
					params.push(parsedArgs.status);
				}
				
				if (parsedArgs.epic) {
					query += " AND epic LIKE ?";
					params.push(`%${parsedArgs.epic}%`);
				}
				
				if (parsedArgs.priority) {
					query += " AND priority = ?";
					params.push(parsedArgs.priority);
				}
				
				if (parsedArgs.minEstimation) {
					query += " AND estimation >= ?";
					params.push(parsedArgs.minEstimation);
				}
				
				if (parsedArgs.maxEstimation) {
					query += " AND estimation <= ?";
					params.push(parsedArgs.maxEstimation);
				}
				
				if (parsedArgs.startDate && parsedArgs.endDate) {
					query += " AND estimatedStartDate BETWEEN ? AND ?";
					params.push(parsedArgs.startDate, parsedArgs.endDate);
				}
				
				if (parsedArgs.hasAcceptanceCriteria === true) {
					query += " AND acceptanceCriteria IS NOT NULL AND acceptanceCriteria != '[]' AND acceptanceCriteria != ''";
				}
				
				if (parsedArgs.hasAcceptanceCriteria === false) {
					query += " AND (acceptanceCriteria IS NULL OR acceptanceCriteria = '[]' OR acceptanceCriteria = '')";
				}
				
				// Tri
				const orderBy = parsedArgs.orderBy || "order";
				const orderDirection = parsedArgs.orderDirection || "ASC";
				// Utiliser des guillemets pour éviter les conflits avec les mots réservés SQL
				const safeOrderBy = orderBy === "order" ? '"order"' : orderBy;
				query += ` ORDER BY ${safeOrderBy} ${orderDirection}`;
				
				// Limite
				if (parsedArgs.limit) {
					query += " LIMIT ?";
					params.push(parsedArgs.limit);
				}
				
				const filteredStories = dbFiltered.prepare(query).all(...params);
				
				if (filteredStories.length === 0) {
					return `❌ Aucune user story trouvée avec les critères spécifiés.`;
				}
				
				// Formater le résultat
				let filteredSummary = `## 🔍 User Stories filtrées (${filteredStories.length})\n\n`;
				
				// Ajouter les critères de filtrage utilisés
				const filters = [];
				if (parsedArgs.status) filters.push(`Statut: ${parsedArgs.status}`);
				if (parsedArgs.epic) filters.push(`Epic: ${parsedArgs.epic}`);
				if (parsedArgs.priority) filters.push(`Priorité: ${parsedArgs.priority}`);
				if (parsedArgs.minEstimation) filters.push(`Estimation min: ${parsedArgs.minEstimation} jours`);
				if (parsedArgs.maxEstimation) filters.push(`Estimation max: ${parsedArgs.maxEstimation} jours`);
				if (parsedArgs.startDate && parsedArgs.endDate) filters.push(`Période: ${parsedArgs.startDate} à ${parsedArgs.endDate}`);
				if (parsedArgs.hasAcceptanceCriteria === true) filters.push(`Avec critères d'acceptation`);
				if (parsedArgs.hasAcceptanceCriteria === false) filters.push(`Sans critères d'acceptation`);
				
				if (filters.length > 0) {
					filteredSummary += `### 📋 Critères de filtrage\n`;
					filters.forEach(filter => {
						filteredSummary += `- ${filter}\n`;
					});
					filteredSummary += '\n';
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
					filteredSummary += `### ✅ Terminées (${byStatus.done.length})\n`;
					byStatus.done.forEach(story => {
						const priority = story.priority === 'high' ? '🔴' : story.priority === 'medium' ? '🟡' : '🟢';
						filteredSummary += `${priority} **${story.title}** - ${story.estimation || '?'} jours`;
						if (story.epic) filteredSummary += ` (${story.epic})`;
						filteredSummary += '\n';
					});
					filteredSummary += '\n';
				}
				
				if (byStatus.inProgress.length > 0) {
					filteredSummary += `### 🔄 En cours (${byStatus.inProgress.length})\n`;
					byStatus.inProgress.forEach(story => {
						const priority = story.priority === 'high' ? '🔴' : story.priority === 'medium' ? '🟡' : '🟢';
						filteredSummary += `${priority} **${story.title}** - ${story.estimation || '?'} jours`;
						if (story.epic) filteredSummary += ` (${story.epic})`;
						filteredSummary += '\n';
					});
					filteredSummary += '\n';
				}
				
				if (byStatus.todo.length > 0) {
					filteredSummary += `### ⏳ À faire (${byStatus.todo.length})\n`;
					byStatus.todo.forEach(story => {
						const priority = story.priority === 'high' ? '🔴' : story.priority === 'medium' ? '🟡' : '🟢';
						filteredSummary += `${priority} **${story.title}** - ${story.estimation || '?'} jours`;
						if (story.epic) filteredSummary += ` (${story.epic})`;
						filteredSummary += '\n';
					});
					filteredSummary += '\n';
				}
				
				if (byStatus.blocked.length > 0) {
					filteredSummary += `### 🚧 En difficulté (${byStatus.blocked.length})\n`;
					byStatus.blocked.forEach(story => {
						const priority = story.priority === 'high' ? '🔴' : story.priority === 'medium' ? '🟡' : '🟢';
						filteredSummary += `${priority} **${story.title}** - ${story.estimation || '?'} jours`;
						if (story.epic) filteredSummary += ` (${story.epic})`;
						filteredSummary += '\n';
					});
					filteredSummary += '\n';
				}
				
				if (byStatus.toTest.length > 0) {
					filteredSummary += `### 🧪 À recetter (${byStatus.toTest.length})\n`;
					byStatus.toTest.forEach(story => {
						const priority = story.priority === 'high' ? '🔴' : story.priority === 'medium' ? '🟡' : '🟢';
						filteredSummary += `${priority} **${story.title}** - ${story.estimation || '?'} jours`;
						if (story.epic) filteredSummary += ` (${story.epic})`;
						filteredSummary += '\n';
					});
					filteredSummary += '\n';
				}
				
				return filteredSummary.replace(/\\n/g, "\n");
				
			case "get_user_story_by_title":
				const dbStory = openDb();
				const storyDetails = dbStory.prepare("SELECT * FROM user_stories WHERE title = ? AND projectId = ?").get(parsedArgs.story_title, parsedArgs.projectId);
				if (!storyDetails) {
					return `❌ User story "${parsedArgs.story_title}" non trouvée dans le projet.`;
				}
				
				// Formater les détails de la story
				const statusIcon = {
					'done': '✅',
					'inProgress': '🔄',
					'todo': '⏳',
					'blocked': '🚧',
					'toTest': '🧪'
				}[storyDetails.status] || '❓';
				
				const priorityIcon = {
					'high': '🔴',
					'medium': '🟡',
					'low': '🟢'
				}[storyDetails.priority] || '⚪';
				
				let details = `## 📋 Détails de la User Story\n\n`;
				details += `### ${statusIcon} **${storyDetails.title}**\n\n`;
				details += `| Champ | Valeur |\n`;
				details += `|-------|--------|\n`;
				details += `| **Statut** | ${statusIcon} ${storyDetails.status || 'Non défini'} |\n`;
				details += `| **Priorité** | ${priorityIcon} ${storyDetails.priority || 'Non définie'} |\n`;
				details += `| **Estimation** | ${storyDetails.estimation ? `${storyDetails.estimation} jours` : 'Non estimée'} |\n`;
				details += `| **Epic** | ${storyDetails.epic || 'Non définie'} |\n`;
				details += `| **Rôle utilisateur** | ${storyDetails.userRole || 'Non défini'} |\n`;
				details += `| **Dépendance** | ${storyDetails.dependency || 'Aucune'} |\n`;
				details += `| **ID** | ${storyDetails.id} |\n`;
				
				if (storyDetails.justification) {
					details += `\n### 📝 Justification\n\n${storyDetails.justification}\n`;
				}
				
				if (storyDetails.acceptanceCriteria) {
					details += `\n### ✅ Critères d'acceptation\n\n`;
					try {
						// Essayer de parser les critères d'acceptation comme JSON
						const criteria = JSON.parse(storyDetails.acceptanceCriteria);
						if (Array.isArray(criteria)) {
							criteria.forEach((criterion, index) => {
								const status = criterion.checkedDev ? '✅' : '⏳';
								details += `${status} **AC${index + 1}** : ${criterion.label}\n`;
							});
						} else {
							details += storyDetails.acceptanceCriteria;
						}
					} catch (e) {
						// Si ce n'est pas du JSON, afficher tel quel
						details += storyDetails.acceptanceCriteria;
					}
					details += '\n';
				}
				
				return details;
				
			case "get_project_metrics":
				// Implémenter directement avec le format optimisé
				const db = openDb();
				const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(parsedArgs.projectId);
				if (!project) {
					return "❌ Projet non trouvé avec cet ID.";
				}
				
				const totalStories = db.prepare("SELECT COUNT(*) as count FROM user_stories WHERE projectId = ?").get(parsedArgs.projectId);
				const doneStories = db.prepare("SELECT COUNT(*) as count FROM user_stories WHERE projectId = ? AND status = 'done'").get(parsedArgs.projectId);
				const inProgressStories = db.prepare("SELECT COUNT(*) as count FROM user_stories WHERE projectId = ? AND status = 'inProgress'").get(parsedArgs.projectId);
				const todoStories = db.prepare("SELECT COUNT(*) as count FROM user_stories WHERE projectId = ? AND status = 'todo'").get(parsedArgs.projectId);
				const blockedStories = db.prepare("SELECT COUNT(*) as count FROM user_stories WHERE projectId = ? AND status = 'blocked'").get(parsedArgs.projectId);
				const toTestStories = db.prepare("SELECT COUNT(*) as count FROM user_stories WHERE projectId = ? AND status = 'toTest'").get(parsedArgs.projectId);
				
				const completionRate = totalStories.count > 0 ? Math.round((doneStories.count / totalStories.count) * 100) : 0;
				
				let summary = `## 📊 Métriques du projet: ${project.name}\n`;
				summary += `### 🎯 Progression globale\n`;
				summary += `| Métrique | Valeur | Statut |\n`;
				summary += `|----------|--------|--------|\n`;
				// Logique intelligente pour les indicateurs selon l'âge du projet
				const currentDateForStatus = new Date();
				const projectStartDateForStatus = project.createdAt ? new Date(project.createdAt) : null;
				const daysSinceStartForStatus = projectStartDateForStatus ? Math.floor((currentDateForStatus - projectStartDateForStatus) / (1000 * 60 * 60 * 24)) : 0;
				
				let completionStatus;
				if (completionRate >= 80) {
					completionStatus = '✅';
				} else if (completionRate >= 60) {
					completionStatus = '🟡';
				} else if (completionRate >= 30) {
					if (daysSinceStartForStatus < 90) {
						completionStatus = '🟡'; // Normal pour un projet récent
					} else {
						completionStatus = '🔴';
					}
				} else {
					if (daysSinceStartForStatus < 30) {
						completionStatus = '🟡'; // Normal pour un projet très récent
					} else if (daysSinceStartForStatus < 60) {
						completionStatus = '🟡'; // Acceptable pour un projet en démarrage
					} else {
						completionStatus = '🔴';
					}
				}
				
				summary += `| **Taux de completion** | ${completionRate}% | ${completionStatus} |\n`;
				summary += `| **Stories terminées** | ${doneStories.count} | ✅ |\n`;
				summary += `| **Stories en cours** | ${inProgressStories.count} | 🔄 |\n`;
				summary += `| **Stories à faire** | ${todoStories.count} | ⏳ |\n`;
				summary += `| **Stories en difficulté** | ${blockedStories.count} | 🚧 |\n`;
				summary += `| **Stories à recetter** | ${toTestStories.count} | 🧪 |\n`;
				
				// Répartition par priorité
				const priorityDistribution = db.prepare(`
					SELECT priority, COUNT(*) as count
					FROM user_stories 
					WHERE projectId = ?
					GROUP BY priority
					ORDER BY priority DESC
				`).all(parsedArgs.projectId);
				
				if (priorityDistribution.length > 0) {
					summary += `### 🔴🟡🟢 Répartition par priorité\n`;
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
				}
				
				// Répartition par estimation (limité aux 10 plus fréquentes)
				const estimationDistribution = db.prepare(`
					SELECT estimation, COUNT(*) as count
					FROM user_stories 
					WHERE projectId = ? AND estimation IS NOT NULL
					GROUP BY estimation
					ORDER BY count DESC
					LIMIT 10
				`).all(parsedArgs.projectId);
				
				if (estimationDistribution.length > 0) {
					summary += `### 📈 Répartition par estimation (top 10)\n`;
					summary += `| Jours | Nombre | Complexité |\n`;
					summary += `|--------|--------|------------|\n`;
					estimationDistribution.forEach(e => {
						const level = e.estimation <= 3 ? '🟢' : e.estimation <= 8 ? '🟡' : '🔴';
						const complexity = e.estimation <= 3 ? 'Simple' : e.estimation <= 8 ? 'Moyenne' : 'Complexe';
						summary += `| **${e.estimation}** | ${e.count} | ${level} ${complexity} |\n`;
					});
				}
				
				// Métriques de vélocité par période (basé sur les dates estimées)
				if (parsedArgs.includeSprintData !== false) {
					const currentDate = new Date();
					const currentPeriod = currentDate.toISOString().slice(0, 7); // YYYY-MM
					
					const periodStories = db.prepare(`
						SELECT 
							strftime('%Y-%m', estimatedStartDate) as period,
							COUNT(*) as totalStories,
							SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as completedStories,
							AVG(CAST(estimation AS INTEGER)) as avgEstimation
						FROM user_stories 
						WHERE projectId = ? 
							AND estimatedStartDate IS NOT NULL
							AND strftime('%Y-%m', estimatedStartDate) <= ?
						GROUP BY strftime('%Y-%m', estimatedStartDate)
						ORDER BY period DESC
						LIMIT 10
					`).all(parsedArgs.projectId, currentPeriod);
					
					if (periodStories.length > 0) {
						summary += `### 🏃‍♂️ Vélocité par période (périodes passées)\n`;
						summary += `> 📅 *Analyse basée sur les périodes terminées jusqu'à ${currentPeriod}*\n\n`;
						summary += `| Période | Terminées/Total | Taux | Jours moy. | Performance |\n`;
						summary += `|---------|----------------|------|-------------|-------------|\n`;
						periodStories.reverse().forEach(period => { // Remettre dans l'ordre chronologique
							const completionRate = period.totalStories > 0 ? Math.round((period.completedStories / period.totalStories) * 100) : 0;
							
							// Logique intelligente pour la performance selon l'âge du projet
							let status, performance;
							const periodDate = new Date(period.period + '-01');
							const daysSincePeriod = Math.floor((currentDate - periodDate) / (1000 * 60 * 60 * 24));
							
							if (completionRate >= 80) {
								status = '✅';
								performance = 'Excellent';
							} else if (completionRate >= 60) {
								status = '🟡';
								performance = 'Bon';
							} else if (completionRate >= 30) {
								if (daysSincePeriod < 30) {
									status = '🟡';
									performance = 'En cours';
								} else {
									status = '🔴';
									performance = 'À améliorer';
								}
							} else {
								if (daysSincePeriod < 14) {
									status = '🟡';
									performance = 'Démarrage';
								} else if (daysSincePeriod < 60) {
									status = '🟡';
									performance = 'Normal';
								} else {
									status = '🔴';
									performance = 'À améliorer';
								}
							}
							
							summary += `| **${period.period}** | ${period.completedStories}/${period.totalStories} | ${completionRate}% | ${Math.round(period.avgEstimation || 0)} | ${status} ${performance} |\n`;
						});
					}
				}
				
				// Estimation du temps restant
				const avgEstimation = db.prepare(`
					SELECT AVG(CAST(estimation AS INTEGER)) as avg
					FROM user_stories 
					WHERE projectId = ? AND estimation IS NOT NULL
				`).get(parsedArgs.projectId);
				
				const remainingStories = totalStories.count - doneStories.count;
				const estimatedRemainingDays = avgEstimation.avg ? Math.ceil(remainingStories * avgEstimation.avg / 2) : 0;
				
				summary += `### ⏱️ Estimations\n`;
				summary += `| Métrique | Valeur |\n`;
				summary += `|----------|--------|\n`;
				summary += `| **Estimation moyenne** | ${Math.round(avgEstimation.avg || 0)} jours |\n`;
				summary += `| **Stories restantes** | ${remainingStories} |\n`;
				summary += `| **Temps estimé** | ${estimatedRemainingDays} jours |\n`;
				summary += `| **Hypothèse** | 2 jours/story |\n`;
				
				// Ajouter des insights basés sur les données et la date actuelle
				const currentDate = new Date();
				const projectStartDate = project.createdAt ? new Date(project.createdAt) : null;
				const daysSinceStart = projectStartDate ? Math.floor((currentDate - projectStartDate) / (1000 * 60 * 60 * 24)) : 0;
				
				summary += `> 💡 **Insights (${currentDate.toLocaleDateString('fr-FR')}):** `;
				
				// Logique intelligente basée sur la progression du projet
				if (completionRate >= 80) {
					summary += `Excellent taux de completion ! Le projet progresse très bien.`;
				} else if (completionRate >= 60) {
					summary += `Bon taux de completion. Le projet avance correctement.`;
				} else if (completionRate >= 30) {
					if (daysSinceStart < 30) {
						summary += `Progression normale pour un projet récent (${daysSinceStart} jours). Le taux de completion de ${completionRate}% est cohérent avec le début de projet.`;
					} else if (daysSinceStart < 90) {
						summary += `Progression acceptable pour un projet en cours (${daysSinceStart} jours). Le taux de ${completionRate}% est dans la normale pour cette phase.`;
					} else {
						summary += `Taux de completion modéré (${completionRate}%). Considérez identifier les blocages pour améliorer la vélocité.`;
					}
				} else {
					if (daysSinceStart < 14) {
						summary += `Projet tout récent (${daysSinceStart} jours) - le taux de ${completionRate}% est normal pour cette phase initiale.`;
					} else if (daysSinceStart < 60) {
						summary += `Projet en phase de démarrage (${daysSinceStart} jours). Le taux de ${completionRate}% est cohérent avec cette étape.`;
					} else {
						summary += `Taux de completion faible (${completionRate}%). Analysez les causes et ajustez la planification.`;
					}
				}
				
				// Ajouter des recommandations contextuelles
				summary += `\n`;
				summary += `> 🎯 **Recommandations:** `;
				if (daysSinceStart < 30) {
					summary += `Concentrez-vous sur la définition et la priorisation des stories. La vélocité s'améliorera naturellement.`;
				} else if (daysSinceStart < 90) {
					summary += `Optimisez le workflow et identifiez les goulots d'étranglement pour améliorer la vélocité.`;
				} else {
					summary += `Analysez les patterns de blocage et optimisez les processus pour accélérer la livraison.`;
				}
				summary += `\n`;
				
				return summary;
				
			// Outils d'édition de user stories
			case "create_user_story":
				const dbCreate = openDb();
				const id = `${Date.now()}-${Math.floor(Math.random()*10000)}`;
				dbCreate.prepare(`INSERT INTO user_stories (id, projectId, epic, userRole, title, justification, estimation, priority, dependency, acceptanceCriteria, status, "order") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
					.run(
						id,
						parsedArgs.projectId,
						parsedArgs.epic || null,
						parsedArgs.userRole || null,
						parsedArgs.title,
						parsedArgs.justification || null,
						parsedArgs.estimation || null,
						parsedArgs.priority || null,
						parsedArgs.dependency || null,
						parsedArgs.acceptanceCriteria || "[]", // Valeur par défaut pour éviter la contrainte NOT NULL
						parsedArgs.status || "todo",
						Date.now()
					);
				const story = dbCreate.prepare("SELECT * FROM user_stories WHERE id = ?").get(id);
				return `✅ Nouvelle user story créée :\n\n- **ID** : ${story.id}\n- **Titre** : ${story.title}\n- **Statut** : ${story.status}\n- **Priorité** : ${story.priority || "-"}\n- **Estimation** : ${story.estimation || "-"}\n- **Epic** : ${story.epic || "-"}`;
				
			case "update_user_story_title":
			case "update_user_story_epic":
			case "update_user_story_user_role":
			case "update_user_story_justification":
			case "update_user_story_estimation":
			case "update_user_story_priority":
			case "update_user_story_dependency":
			case "update_user_story_acceptance_criteria":
			case "update_user_story_status":
				const dbUpdate = openDb();
				// Extraire le nom du champ à partir du nom de l'outil
				const fieldName = name.replace('update_user_story_', '');
				const fieldLabel = {
					title: "Titre",
					epic: "Epic",
					user_role: "Rôle utilisateur",
					justification: "Justification",
					estimation: "Estimation",
					priority: "Priorité",
					dependency: "Dépendance",
					acceptance_criteria: "Critères d'acceptation",
					status: "Statut"
				}[fieldName] || fieldName;
				
				// Chercher la story par titre si pas d'ID fourni
				let storyToUpdate;
				if (parsedArgs.id) {
					storyToUpdate = dbUpdate.prepare("SELECT * FROM user_stories WHERE id = ?").get(parsedArgs.id);
				} else if (parsedArgs.story_title) {
					storyToUpdate = dbUpdate.prepare("SELECT * FROM user_stories WHERE title = ? AND projectId = ?").get(parsedArgs.story_title, parsedArgs.projectId);
				}
				
				if (!storyToUpdate) {
					return `❌ User story non trouvée. Vérifiez l'ID ou le titre.`;
				}
				
				// Mettre à jour le champ
				let value = parsedArgs.value || parsedArgs.status || parsedArgs.title || parsedArgs.epic || parsedArgs.user_role || parsedArgs.justification || parsedArgs.estimation || parsedArgs.priority || parsedArgs.dependency || parsedArgs.acceptance_criteria;
				
				// Gérer les valeurs par défaut pour éviter les contraintes NOT NULL
				if (fieldName === 'acceptance_criteria' && !value) {
					value = "[]";
				}
				
				dbUpdate.prepare(`UPDATE user_stories SET ${fieldName} = ? WHERE id = ?`).run(value, storyToUpdate.id);
				
				const updated = dbUpdate.prepare("SELECT * FROM user_stories WHERE id = ?").get(storyToUpdate.id);
				return `✏️ User story modifiée :\n\n- **ID** : ${updated.id}\n- **Titre** : ${updated.title}\n- **${fieldLabel}** : ${updated[fieldName] || "-"}`;
				
			case "delete_user_story":
				const dbDelete = openDb();
				let storyToDelete;
				if (parsedArgs.id) {
					storyToDelete = dbDelete.prepare("SELECT * FROM user_stories WHERE id = ?").get(parsedArgs.id);
				} else if (parsedArgs.story_title) {
					storyToDelete = dbDelete.prepare("SELECT * FROM user_stories WHERE title = ? AND projectId = ?").get(parsedArgs.story_title, parsedArgs.projectId);
				}
				
				if (!storyToDelete) {
					return `❌ User story non trouvée. Vérifiez l'ID ou le titre.`;
				}
				
				dbDelete.prepare("DELETE FROM user_stories WHERE id = ?").run(storyToDelete.id);
				return `🗑️ User story supprimée :\n\n- **ID** : ${storyToDelete.id}\n- **Titre** : ${storyToDelete.title}`;
				
			default:
				throw new Error(`Outil MCP inconnu: ${name}`);
		}
	} catch (error) {
		console.error("Erreur lors de l'exécution du tool MCP:", error);
		return `❌ Erreur lors de l'exécution de l'outil: ${error.message}`;
	}
}

// Endpoint POST /ai-chat : proxy OpenAI Responses API (non-streaming)
router.post("/ai-chat", async (req, res) => {
	const { prompt, openaiApiKey, history, tools, tool_choice, model } = req.body;
	if ((!prompt && !Array.isArray(history)) || !openaiApiKey) {
		return res
			.status(400)
			.json({ error: "Prompt ou historique et clé OpenAI requis." });
	}
	const input =
		Array.isArray(history) && history.length > 0
			? history
			: [
				{
					role: "user",
					content: prompt,
				},
			];

	const client = new OpenAI({ apiKey: openaiApiKey });

	try {
		// Configuration des headers pour JSON (pas SSE)
		res.setHeader("Content-Type", "application/json");
		res.setHeader("Access-Control-Allow-Origin", "*");
		res.setHeader("Access-Control-Allow-Headers", "Content-Type");
		
		// Construction dynamique du payload OpenAI pour intégrer MCP
		const payload = {
			model: model || "gpt-4o-mini",
			messages: input,
			stream: false, // Pas de streaming pour tester
		};
		
		const completion = await client.chat.completions.create(payload);
		
		// Envoyer la réponse complète
		res.json({
			success: true,
			content: completion.choices[0].message.content,
			usage: completion.usage
		});
	} catch (err) {
		console.error("Erreur dans ai-chat:", err);
		res.status(500).json({ error: err.message });
	}
});

// Endpoint POST /ai-chat-stream : proxy OpenAI Responses API (streaming)
router.post("/ai-chat-stream", async (req, res) => {
	const { prompt, openaiApiKey, history, tools, tool_choice, model } = req.body;
	if ((!prompt && !Array.isArray(history)) || !openaiApiKey) {
		return res
			.status(400)
			.json({ error: "Prompt ou historique et clé OpenAI requis." });
	}
	const input =
		Array.isArray(history) && history.length > 0
			? history
			: [
				{
					role: "user",
					content: prompt,
				},
			];

	const client = new OpenAI({ apiKey: openaiApiKey });

	try {
		// Configuration des headers SSE
		res.setHeader("Content-Type", "text/event-stream");
		res.setHeader("Cache-Control", "no-cache");
		res.setHeader("Connection", "keep-alive");
		res.setHeader("Access-Control-Allow-Origin", "*");
		res.setHeader("Access-Control-Allow-Headers", "Content-Type");
		
		let clientClosed = false;
		req.on("close", () => {
			clientClosed = true;
		});
		
		// Construction du payload OpenAI
		const payload = {
			model: model || "gpt-4o-mini",
			messages: input,
			stream: true, // Streaming activé
		};
		
		const stream = await client.chat.completions.create(payload);
		
		// Envoyer un message initial pour maintenir la connexion
		res.write("data: {\"type\": \"connected\"}\n\n");
		res.flush && res.flush();

		// Lire et envoyer les événements immédiatement
		for await (const event of stream) {
			if (clientClosed) {
				break;
			}
			
			// Envoyer immédiatement
			const data = `data: ${JSON.stringify(event)}\n\n`;
			res.write(data);
			
			// Forcer l'envoi
			if (res.flush) {
				res.flush();
			}
		}
		
		if (!clientClosed) {
			res.end();
		}
	} catch (err) {
		console.error("Erreur dans ai-chat-stream:", err);
		try {
			res.write(`data: {\"error\": \"${err.message}\"}\n\n`);
		} catch (writeErr) {
			console.error("Erreur lors de l'écriture de l'erreur:", writeErr);
		}
		res.end();
	}
});

// Endpoint GET /ai-chat-stream-events : endpoint EventSource pour le streaming
router.get("/ai-chat-stream-events", (req, res) => {
	// Configuration des headers SSE
	res.setHeader("Content-Type", "text/event-stream");
	res.setHeader("Cache-Control", "no-cache");
	res.setHeader("Connection", "keep-alive");
	res.setHeader("Access-Control-Allow-Origin", "*");
	res.setHeader("Access-Control-Allow-Headers", "Content-Type");
	
	// Envoyer un message initial
	res.write("data: {\"type\": \"connected\"}\n\n");
	res.flush && res.flush();
	
	// Stocker la connexion pour l'utiliser plus tard
	req.app.locals.eventSourceConnections = req.app.locals.eventSourceConnections || [];
	req.app.locals.eventSourceConnections.push(res);
	
	// Gérer la fermeture de la connexion
	req.on("close", () => {
		const index = req.app.locals.eventSourceConnections.indexOf(res);
		if (index > -1) {
			req.app.locals.eventSourceConnections.splice(index, 1);
		}
	});
});

// Endpoint POST /ai-chat-stream-init : initialiser le streaming
router.post("/ai-chat-stream-init", async (req, res) => {
	const { prompt, openaiApiKey, history, tools, tool_choice, model } = req.body;
	if ((!prompt && !Array.isArray(history)) || !openaiApiKey) {
		return res.status(400).json({ error: "Prompt ou historique et clé OpenAI requis." });
	}
	
	const input = Array.isArray(history) && history.length > 0 ? history : [{ role: "user", content: prompt }];
	const client = new OpenAI({ apiKey: openaiApiKey });
	
	try {
		// Définir les outils MCP comme function calls OpenAI
		const mcpTools = tools ? [
			{
				type: "function",
				function: {
					name: "list_projects",
					description: "Lister tous les projets disponibles",
					parameters: {
						type: "object",
						properties: {},
						required: []
					}
				}
			},
			{
				type: "function",
				function: {
					name: "get_project_user_stories",
					description: "Obtenir les user stories d'un projet spécifique",
					parameters: {
						type: "object",
						properties: {
							projectId: {
								type: "string",
								description: "L'ID du projet"
							}
						},
						required: ["projectId"]
					}
				}
			},
			{
				type: "function",
				function: {
					name: "get_project_metrics",
					description: "Obtenir les métriques détaillées d'un projet (progression, vélocité, estimations)",
					parameters: {
						type: "object",
						properties: {
							projectId: {
								type: "string",
								description: "L'ID du projet"
							}
						},
						required: ["projectId"]
					}
				}
			},
			{
				type: "function",
				function: {
					name: "get_user_story_by_title",
					description: "Obtenir les détails d'une user story spécifique par son titre",
					parameters: {
						type: "object",
						properties: {
							projectId: {
								type: "string",
								description: "L'ID du projet"
							},
							story_title: {
								type: "string",
								description: "Le titre exact de la user story"
							}
						},
						required: ["projectId", "story_title"]
					}
				}
			},
			{
				type: "function",
				function: {
					name: "get_filtered_user_stories",
					description: "Filtrer et afficher les user stories selon des critères spécifiques : statut, epic, priorité, estimation, dates, critères d'acceptation",
					parameters: {
						type: "object",
						properties: {
							projectId: {
								type: "string",
								description: "L'ID du projet"
							},
							status: {
								type: "string",
								description: "Filtrer par statut (done, inProgress, todo, blocked, toTest)"
							},
							epic: {
								type: "string",
								description: "Filtrer par epic (recherche partielle)"
							},
							priority: {
								type: "string",
								description: "Filtrer par priorité (high, medium, low)"
							},
							minEstimation: {
								type: "number",
								description: "Estimation minimale en jours"
							},
							maxEstimation: {
								type: "number",
								description: "Estimation maximale en jours"
							},
							startDate: {
								type: "string",
								description: "Date de début pour le filtrage par période (YYYY-MM-DD)"
							},
							endDate: {
								type: "string",
								description: "Date de fin pour le filtrage par période (YYYY-MM-DD)"
							},
							hasAcceptanceCriteria: {
								type: "boolean",
								description: "Filtrer par présence de critères d'acceptation (true/false)"
							},
							orderBy: {
								type: "string",
								description: "Champ de tri (order, title, priority, estimation, status)"
							},
							orderDirection: {
								type: "string",
								description: "Direction du tri (ASC/DESC)"
							},
							limit: {
								type: "number",
								description: "Limite du nombre de résultats"
							}
						},
						required: ["projectId"]
					}
				}
			},
			// Outils d'édition de user stories
			{
				type: "function",
				function: {
					name: "create_user_story",
					description: "Créer une nouvelle user story dans le projet spécifié",
					parameters: {
						type: "object",
						properties: {
							projectId: {
								type: "string",
								description: "L'ID du projet"
							},
							title: {
								type: "string",
								description: "Le titre de la user story"
							},
							epic: {
								type: "string",
								description: "L'epic de la user story"
							},
							userRole: {
								type: "string",
								description: "Le rôle utilisateur"
							},
							justification: {
								type: "string",
								description: "La justification"
							},
							estimation: {
								type: "number",
								description: "L'estimation en jours"
							},
							priority: {
								type: "string",
								description: "La priorité (high, medium, low)"
							},
							status: {
								type: "string",
								description: "Le statut (todo, inProgress, done, blocked, toTest)"
							}
						},
						required: ["projectId", "title"]
					}
				}
			},
			{
				type: "function",
				function: {
					name: "update_user_story_status",
					description: "Modifier le statut d'une user story",
					parameters: {
						type: "object",
						properties: {
							projectId: {
								type: "string",
								description: "L'ID du projet"
							},
							story_title: {
								type: "string",
								description: "Le titre de la user story à modifier"
							},
							status: {
								type: "string",
								description: "Le nouveau statut (todo, inProgress, done, blocked, toTest)"
							}
						},
						required: ["projectId", "story_title", "status"]
					}
				}
			},
			{
				type: "function",
				function: {
					name: "update_user_story_title",
					description: "Modifier le titre d'une user story",
					parameters: {
						type: "object",
						properties: {
							projectId: {
								type: "string",
								description: "L'ID du projet"
							},
							story_title: {
								type: "string",
								description: "Le titre actuel de la user story"
							},
							title: {
								type: "string",
								description: "Le nouveau titre"
							}
						},
						required: ["projectId", "story_title", "title"]
					}
				}
			},
			{
				type: "function",
				function: {
					name: "delete_user_story",
					description: "Supprimer une user story",
					parameters: {
						type: "object",
						properties: {
							projectId: {
								type: "string",
								description: "L'ID du projet"
							},
							story_title: {
								type: "string",
								description: "Le titre de la user story à supprimer"
							}
						},
						required: ["projectId", "story_title"]
					}
				}
			}
		] : [];
		
		const payload = {
			model: model || "gpt-4o-mini",
			messages: input,
			stream: true,
			tools: mcpTools,
			tool_choice: "auto"
		};
		
		const stream = await client.chat.completions.create(payload);
		
		// Envoyer les événements à toutes les connexions EventSource
		let toolCallInProgress = false;
		let currentToolCall = null;
		
		for await (const event of stream) {
			// Vérifier si c'est un tool call
			if (event.choices && event.choices[0] && event.choices[0].delta && event.choices[0].delta.tool_calls) {
				toolCallInProgress = true;
				if (!currentToolCall) {
					currentToolCall = {
						id: "",
						type: "function",
						function: { name: "", arguments: "" }
					};
				}
				
				// Accumuler les données du tool call
				const toolCall = event.choices[0].delta.tool_calls[0];
				if (toolCall.id) currentToolCall.id = toolCall.id;
				if (toolCall.function && toolCall.function.name) currentToolCall.function.name = toolCall.function.name;
				if (toolCall.function && toolCall.function.arguments) currentToolCall.function.arguments += toolCall.function.arguments;
			}
			
			// Si c'est la fin d'un tool call, l'exécuter
			if (toolCallInProgress && event.choices && event.choices[0] && event.choices[0].finish_reason === "tool_calls") {
									// Exécuter le tool call MCP
					try {
						// Envoyer un message de progression
						const progressEvent = {
							choices: [{
								index: 0,
								delta: {
									role: "assistant",
									content: `🔍 Récupération des données...`
								},
								finish_reason: null
							}]
						};
						
						const progressConnections = req.app.locals.eventSourceConnections || [];
						progressConnections.forEach(connection => {
							try {
								connection.write(`data: ${JSON.stringify(progressEvent)}\n\n`);
								connection.flush && connection.flush();
							} catch (err) {
								console.error("Erreur envoi progress à une connexion:", err);
							}
						});
						
						const result = await executeMcpTool(currentToolCall);
						
						// Formater le résultat pour qu'il soit plus lisible
						let formattedResult;
						if (currentToolCall.function.name === "get_project_user_stories") {
							// Pour les user stories, utiliser le format optimisé
							const userStories = result;
							if (userStories.length === 0) {
								formattedResult = "❌ Aucune user story trouvée pour ce projet.";
							} else {
								let summary = `## 📋 User Stories du projet (${userStories.length})\n`;
								
								// Grouper par statut
								const byStatus = {
									done: userStories.filter(s => s.status === 'done'),
									inProgress: userStories.filter(s => s.status === 'inProgress'),
									todo: userStories.filter(s => s.status === 'todo'),
									blocked: userStories.filter(s => s.status === 'blocked'),
									toTest: userStories.filter(s => s.status === 'toTest')
								};
								
								if (byStatus.done.length > 0) {
									const displayCount = Math.min(byStatus.done.length, 20);
									summary += `### ✅ Terminées (${byStatus.done.length} total, affichage des ${displayCount} plus récentes)\n`;
									byStatus.done.slice(0, displayCount).forEach(story => {
										const priority = story.priority === 'high' ? '🔴' : story.priority === 'medium' ? '🟡' : '🟢';
										summary += `${priority} **${story.title}** - ${story.estimation || '?'} jours\n`;
									});
									if (byStatus.done.length > displayCount) {
										summary += `... et ${byStatus.done.length - displayCount} autres stories terminées\n`;
									}
									summary += '\n';
								}
								
								if (byStatus.inProgress.length > 0) {
									const displayCount = Math.min(byStatus.inProgress.length, 20);
									summary += `### 🔄 En cours (${byStatus.inProgress.length} total, affichage des ${displayCount} plus récentes)\n`;
									byStatus.inProgress.slice(0, displayCount).forEach(story => {
										const priority = story.priority === 'high' ? '🔴' : story.priority === 'medium' ? '🟡' : '🟢';
										summary += `${priority} **${story.title}** - ${story.estimation || '?'} jours\n`;
									});
									if (byStatus.inProgress.length > displayCount) {
										summary += `... et ${byStatus.inProgress.length - displayCount} autres stories en cours\n`;
									}
									summary += '\n';
								}
								
								if (byStatus.todo.length > 0) {
									const displayCount = Math.min(byStatus.todo.length, 20);
									summary += `### ⏳ À faire (${byStatus.todo.length} total, affichage des ${displayCount} plus prioritaires)\n`;
									byStatus.todo.slice(0, displayCount).forEach(story => {
										const priority = story.priority === 'high' ? '🔴' : story.priority === 'medium' ? '🟡' : '🟢';
										summary += `${priority} **${story.title}** - ${story.estimation || '?'} jours\n`;
									});
									if (byStatus.todo.length > displayCount) {
										summary += `... et ${byStatus.todo.length - displayCount} autres stories à faire\n`;
									}
									summary += '\n';
								}
								
								if (byStatus.blocked.length > 0) {
									const displayCount = Math.min(byStatus.blocked.length, 20);
									summary += `### 🚧 En difficulté (${byStatus.blocked.length} total, affichage des ${displayCount} plus récentes)\n`;
									byStatus.blocked.slice(0, displayCount).forEach(story => {
										const priority = story.priority === 'high' ? '🔴' : story.priority === 'medium' ? '🟡' : '🟢';
										summary += `${priority} **${story.title}** - ${story.estimation || '?'} jours\n`;
									});
									if (byStatus.blocked.length > displayCount) {
										summary += `... et ${byStatus.blocked.length - displayCount} autres stories en difficulté\n`;
									}
									summary += '\n';
								}
								
								if (byStatus.toTest.length > 0) {
									const displayCount = Math.min(byStatus.toTest.length, 20);
									summary += `### 🧪 À recetter (${byStatus.toTest.length} total, affichage des ${displayCount} plus récentes)\n`;
									byStatus.toTest.slice(0, displayCount).forEach(story => {
										const priority = story.priority === 'high' ? '🔴' : story.priority === 'medium' ? '🟡' : '🟢';
										summary += `${priority} **${story.title}** - ${story.estimation || '?'} jours\n`;
									});
									if (byStatus.toTest.length > displayCount) {
										summary += `... et ${byStatus.toTest.length - displayCount} autres stories à recetter\n`;
									}
									summary += '\n';
								}
								
								formattedResult = summary;
							}
						} else if (currentToolCall.function.name === "get_project_metrics") {
							// Pour les métriques, le résultat est déjà formaté
							formattedResult = result;
						} else if (currentToolCall.function.name === "get_filtered_user_stories") {
							// Pour le filtrage des user stories, le résultat est déjà formaté en Markdown
							formattedResult = result;
						} else if (currentToolCall.function.name === "get_user_story_by_title") {
							// Pour les détails d'une user story, le résultat est déjà formaté en Markdown
							formattedResult = result;
						} else if (currentToolCall.function.name.startsWith("update_user_story_") || currentToolCall.function.name === "create_user_story" || currentToolCall.function.name === "delete_user_story") {
							// Pour les outils d'édition, le résultat est déjà formaté en Markdown
							formattedResult = result;
						} else {
							// Pour les autres outils, utiliser le format JSON mais plus lisible
							formattedResult = JSON.stringify(result, null, 2);
						}
						
											// Envoyer le résultat du tool call au client
					const toolResultEvent = {
						choices: [{
							index: 0,
							delta: {
								role: "assistant",
								content: formattedResult
							},
							finish_reason: "stop"
						}]
					};
				
				// Envoyer le résultat du tool call
				const connections = req.app.locals.eventSourceConnections || [];
				connections.forEach(connection => {
					try {
						connection.write(`data: ${JSON.stringify(toolResultEvent)}\n\n`);
						connection.flush && connection.flush();
					} catch (err) {
						console.error("Erreur envoi tool result à une connexion:", err);
					}
				});
					
					toolCallInProgress = false;
					currentToolCall = null;
					break;
				} catch (err) {
					console.error("Erreur lors de l'exécution du tool call:", err);
					
					// Envoyer l'erreur du tool call au client
					const toolErrorEvent = {
						choices: [{
							index: 0,
							delta: {
								role: "assistant",
								content: `Désolé, je n'ai pas pu accéder aux données demandées. Erreur: ${err.message}`
							},
							finish_reason: "stop"
						}]
					};
					
					const connections = req.app.locals.eventSourceConnections || [];
					connections.forEach(connection => {
						try {
							connection.write(`data: ${JSON.stringify(toolErrorEvent)}\n\n`);
							connection.flush && connection.flush();
						} catch (writeErr) {
							console.error("Erreur envoi tool error à une connexion:", writeErr);
						}
					});
					
					toolCallInProgress = false;
					currentToolCall = null;
				}
			}
			
			// Envoyer l'événement normalement si pas de tool call en cours
			if (!toolCallInProgress) {
				const connections = req.app.locals.eventSourceConnections || [];
				connections.forEach(connection => {
					try {
						connection.write(`data: ${JSON.stringify(event)}\n\n`);
						connection.flush && connection.flush();
					} catch (err) {
						console.error("Erreur envoi à une connexion:", err);
					}
				});
			}
		}
		
		res.json({ success: true });
	} catch (err) {
		console.error("Erreur dans ai-chat-stream-init:", err);
		
		// Envoyer l'erreur aux clients EventSource connectés
		const connections = req.app.locals.eventSourceConnections || [];
		connections.forEach(connection => {
			try {
				connection.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
				connection.flush && connection.flush();
			} catch (writeErr) {
				console.error("Erreur lors de l'envoi de l'erreur:", writeErr);
			}
		});
		
		res.status(500).json({ error: err.message });
	}
});

export default router;
