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
const allowedOrigins = ["http://localhost:5173", "https://jladmin.fr", "https://api.jladmin.fr","https://accounts.google.com"];
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
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
      callbackURL: "/auth/google/callback",
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

// Brancher les routes API projets, user stories, accès, import/export
app.use(projectsRoutes);
app.use(userStoriesRoutes);
app.use(accessRoutes);
app.use(importExportRoutes);
app.use(aiChatRoutes);
app.use(mcpRoutes);

const PORT = process.env.PORT || 3000;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

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
