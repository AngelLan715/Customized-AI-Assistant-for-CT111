require("dotenv").config();

const crypto = require("crypto");
const path = require("path");
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const store = require("./store");
const { sendMail } = require("./email");
const { generateTextResponse, generateImageResponse } = require("./ai-services");

const PORT = Number(process.env.PORT || 3000);
const BASE_URL = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, "");
const SESSION_SECRET = process.env.SESSION_SECRET || "dev-only-change-me-in-production";

const app = express();
app.set("trust proxy", 1);
app.use(express.json());
app.use(
  session({
    name: "core9.sid",
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  })
);

function publicUser(row) {
  if (!row) return null;
  return { id: row.id, email: row.email };
}

app.post("/api/auth/register", async (req, res) => {
  try {
    const email = store.normalizeEmail(req.body.email);
    const password = String(req.body.password || "");

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Valid email is required" });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    const created = await store.createUser(email, passwordHash);
    if (created.error === "exists") {
      return res.status(409).json({ error: "An account with this email already exists" });
    }

    req.session.userId = created.id;

    await sendMail({
      to: email,
      subject: "Welcome to Core9 AI",
      text: `Hi,\n\nYour Core9 AI account (${email}) is ready.\n\n— Core9 AI`,
      html: `<p>Hi,</p><p>Your Core9 AI account (<strong>${email}</strong>) is ready.</p><p>— Core9 AI</p>`,
    });

    res.status(201).json({ user: publicUser(created) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not create account" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const email = store.normalizeEmail(req.body.email);
    const password = String(req.body.password || "");

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const user = await store.getUserByEmail(email);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    req.session.userId = user.id;
    res.json({ user: publicUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not sign in" });
  }
});

app.post("/api/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("core9.sid");
    res.json({ ok: true });
  });
});

app.get("/api/auth/me", async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.json({ user: null });
    }
    const user = await store.getUserById(req.session.userId);
    res.json({ user: publicUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load session" });
  }
});

/** Passwordless sign-in: POST email → receive link by email (SMTP) or see link in server console (dev). */
app.post("/api/auth/email-link", async (req, res) => {
  try {
    const email = store.normalizeEmail(req.body.email);
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const user = await store.getUserByEmail(email);

    if (!user) {
      return res.json({ ok: true });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = Date.now() + 60 * 60 * 1000;

    await store.replaceLoginTokensForUser(user.id, token, expiresAt);

    const link = `${BASE_URL}/api/auth/email-link/complete?token=${encodeURIComponent(token)}`;

    await sendMail({
      to: email,
      subject: "Your Core9 AI sign-in link",
      text: `Sign in to Core9 AI:\n\n${link}\n\nThis link expires in 1 hour.`,
      html: `<p>Sign in to Core9 AI:</p><p><a href="${link}">${link}</a></p><p>This link expires in 1 hour.</p>`,
    });

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not send sign-in link" });
  }
});

app.get("/api/auth/email-link/complete", async (req, res) => {
  try {
    const token = String(req.query.token || "");
    if (!token) {
      return res.redirect("/login.html?error=missing_token");
    }

    const row = await store.takeLoginToken(token);
    if (!row || row.expiresAt < Date.now()) {
      return res.redirect("/login.html?error=invalid_or_expired_link");
    }

    req.session.userId = row.userId;

    res.redirect("/?signed_in=1");
  } catch (err) {
    console.error(err);
    res.redirect("/login.html?error=invalid_or_expired_link");
  }
});

app.post("/api/ai/text", async (req, res) => {
  try {
    const prompt = String(req.body.prompt || "").trim();
    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required." });
    }
    const result = await generateTextResponse(prompt);
    res.json(result);
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Text model request failed.";
    res.status(500).json({ error: message });
  }
});

app.post("/api/ai/image", async (req, res) => {
  try {
    const prompt = String(req.body.prompt || "").trim();
    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required." });
    }
    const result = await generateImageResponse(prompt);
    res.json(result);
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Image model request failed.";
    res.status(500).json({ error: message });
  }
});

app.use(express.static(path.join(__dirname, "public")));

async function start() {
  await store.init();
  const mode = store.backend === "postgres" ? "PostgreSQL (DATABASE_URL)" : "local file (data/store.json)";
  const server = app.listen(PORT, () => {
    console.log(`Core9 server ready — open in your browser:`);
    console.log(`  http://localhost:${PORT}`);
    console.log(`  http://127.0.0.1:${PORT}`);
    console.log(`Data store: ${mode}`);
    console.log(`Keep this terminal open while you use the app.`);
  });
  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(
        `Port ${PORT} is already in use. Close the other program using it, or set PORT=3001 (or another port) in .env and restart.`,
      );
    } else {
      console.error("Server failed to start:", err);
    }
    process.exit(1);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
