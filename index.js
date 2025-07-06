import cookieParser from "cookie-parser";
import cors from "cors";
import "dotenv/config";
import express from "express";
import session from "express-session";
import jwt from "jsonwebtoken";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import accessRoutes from "./access.routes.js";
import aiChatRoutes from "./ai-chat.routes.js";
import { openDb } from "./db.js";
import importExportRoutes from "./importexport.routes.js";
import projectsRoutes from "./projects.routes.js";
import userStoriesRoutes from "./userstories.routes.js";
import mcpRoutes from "./mcp.routes.js";

import chalk from "chalk";

const app = express();

// CORS dynamique selon l'environnement
const isDevelopment = process.env.NODE_ENV !== "production";
const allowedOrigins = isDevelopment 
  ? ["http://localhost:5173", "http://localhost:3000", "https://accounts.google.com"]
  : ["https://jladmin.fr", "https://api.jladmin.fr", "https://accounts.google.com"];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      console.log(`CORS blocked origin: ${origin}`);
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || "secret",
    resave: false,
    saveUninitialized: false,
    // Pas d'options cookie custom : compatible local/dev/prod via proxy
  })
);
app.use(passport.initialize());
app.use(passport.session());
app.use(cookieParser());

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      callbackURL: process.env.NODE_ENV === "production" 
        ? "https://api.jladmin.fr/auth/google/callback"
        : "http://localhost:3000/auth/google/callback",
    },
    (_accessToken, _refreshToken, profile, done) => {
      done(null, profile);
    }
  )
);

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

function ensureAuth(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) return next();
  res.status(401).json({ error: "Unauthorized" });
}

const userStories = new Map();

app.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);
app.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/" }),
  (req, res) => {
    // Générer le JWT et le placer dans un cookie sécurisé
    const payload = {
      id: req.user.id,
      email: req.user.email,
      displayName: req.user.displayName,
    };
    const token = jwt.sign(payload, process.env.JWT_SECRET || "dev-secret", {
      expiresIn: "2h",
    });
    res.cookie("mcp_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production", // true en prod
      sameSite: "strict",
      maxAge: 2 * 60 * 60 * 1000, // 2h
    });
    // Redirection dynamique selon l'environnement
    const redirectUrl = process.env.FRONTEND_URL || "http://localhost:5173/";
    res.redirect(redirectUrl);
  }
);

app.post("/auth/logout", (req, res) => {
  req.logout(() => res.json({ success: true }));
});

app.get("/user", (req, res) => res.json(req.user || null));

app.get("/userstories", ensureAuth, (req, res) => {
  const id = req.user.id;
  res.json(userStories.get(id) || []);
});

app.post("/userstories", ensureAuth, (req, res) => {
  const id = req.user.id;
  userStories.set(id, req.body || []);
  res.json({ success: true });
});

// --- API thème utilisateur ---
app.get("/user/theme", ensureAuth, (req, res) => {
  const db = openDb();
  const userId = req.user.id;
  const row = db.prepare("SELECT theme FROM users WHERE id = ?").get(userId);
  res.json({ theme: row?.theme || "system" });
});

app.put("/user/theme", ensureAuth, (req, res) => {
  const db = openDb();
  const userId = req.user.id;
  const { theme } = req.body;
  if (!["light", "dark", "system"].includes(theme)) {
    return res.status(400).json({ error: "Thème invalide" });
  }
  db.prepare("UPDATE users SET theme = ? WHERE id = ?").run(theme, userId);
  res.json({ success: true });
});

// --- Liste tous les utilisateurs (admin ou partage)
app.get("/users", ensureAuth, (req, res) => {
  const db = openDb();
  const users = db.prepare("SELECT id, email, displayName FROM users").all();
  res.json(users);
});

// Endpoint pour obtenir un JWT après login Google
app.get("/token", ensureAuth, (req, res) => {
  // On encode l'id, l'email et le displayName dans le token
  const payload = {
    id: req.user.id,
    email: req.user.email,
    displayName: req.user.displayName,
  };
  const token = jwt.sign(payload, process.env.JWT_SECRET || "dev-secret", {
    expiresIn: "2h",
  });
  res.json({ token });
});

// Endpoint de vérification de la connexion à la base de données
app.get("/health/db", (req, res) => {
  try {
    const db = openDb();
    // On fait un SELECT simple sur sqlite_master (toujours présent)
    db.prepare("SELECT name FROM sqlite_master LIMIT 1").get();
    res.json({ status: "ok", message: "Connexion à la base de données réussie." });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// Brancher les routes API projets, user stories, accès, import/export
app.use(projectsRoutes);
app.use(userStoriesRoutes);
app.use(accessRoutes);
app.use(importExportRoutes);
app.use(aiChatRoutes);
app.use(mcpRoutes);

const PORT = process.env.PORT || 3000;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

// Vérification de la configuration en développement
if (process.env.NODE_ENV !== "production") {
  console.log(chalk.yellow("⚠️  Mode développement détecté"));
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    console.log(chalk.red("❌  Variables d'environnement Google manquantes !"));
    console.log(chalk.yellow("📝  Créez un fichier .env dans usm-api/ avec :"));
    console.log(chalk.cyan("   GOOGLE_CLIENT_ID=votre_client_id"));
    console.log(chalk.cyan("   GOOGLE_CLIENT_SECRET=votre_client_secret"));
    console.log(chalk.yellow("📖  Consultez DEVELOPMENT.md pour la configuration"));
  } else {
    console.log(chalk.green("✅  Configuration Google OAuth détectée"));
  }
}

app.listen(PORT, () => {
  const sep = chalk.gray("──────────────────────────────────────────────");
  console.log(`\n${sep}`);
  console.log(chalk.bold.blueBright("🚀  API Server prêt !"));
  console.log(
    chalk.greenBright("🔗  Backend: ") +
      chalk.bold.white(`http://localhost:${PORT}`)
  );
  console.log(
    chalk.magentaBright("🌍  Frontend: ") + chalk.bold.white(FRONTEND_URL)
  );
  console.log(
    chalk.gray("📦  Node ") +
      process.version +
      chalk.gray(" | ") +
      chalk.cyan(`PID: ${process.pid}`)
  );
  console.log(`${sep}\n`);
});
