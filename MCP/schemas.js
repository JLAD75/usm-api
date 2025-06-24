import { z } from "zod";

// 1. Schéma Zod pour un jour férié
const holidaySchema = z.object({
  title: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  id: z.string(),
});

// 2. Schéma Zod pour les settings du projet
const settingsSchema = z.object({
  projectStartDate: z.string(),
  workdays: z.object({
    monday: z.boolean(),
    tuesday: z.boolean(),
    wednesday: z.boolean(),
    thursday: z.boolean(),
    friday: z.boolean(),
    saturday: z.boolean(),
    sunday: z.boolean(),
  }),
  holidays: z.array(holidaySchema),
  theme: z.string(),
});

// 3. Schéma Zod complet d’un projet (settings déjà parsé)
export const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  ownerId: z.string(),
  settings: settingsSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

// 4. Schéma pour la liste de projets (outputSchema)
export const projectsListSchema = z.object({
  projects: z.array(projectSchema),
});
