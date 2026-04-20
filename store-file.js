const fs = require("fs");
const path = require("path");

const dataDir = path.join(__dirname, "data");
const storePath = path.join(dataDir, "store.json");

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function defaultStore() {
  return {
    nextUserId: 1,
    users: [],
    loginTokens: [],
    waitlist: [],
  };
}

function load() {
  if (!fs.existsSync(storePath)) {
    return defaultStore();
  }
  try {
    const raw = fs.readFileSync(storePath, "utf8");
    const data = JSON.parse(raw);
    if (!Array.isArray(data.users)) data.users = [];
    if (!Array.isArray(data.loginTokens)) data.loginTokens = [];
    if (!Array.isArray(data.waitlist)) data.waitlist = [];
    if (typeof data.nextUserId !== "number") data.nextUserId = 1;
    return data;
  } catch {
    return defaultStore();
  }
}

function save(data) {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  fs.writeFileSync(storePath, JSON.stringify(data, null, 2), "utf8");
}

function withStore(fn) {
  const data = load();
  const result = fn(data);
  save(data);
  return result;
}

function readOnly(fn) {
  return fn(load());
}

async function init() {
  /* no-op; file is created on first write */
}

async function getUserByEmail(email) {
  const e = normalizeEmail(email);
  return readOnly((d) => d.users.find((u) => u.email === e) || null);
}

async function getUserById(id) {
  const n = Number(id);
  return readOnly((d) => d.users.find((u) => u.id === n) || null);
}

async function createUser(email, passwordHash) {
  const e = normalizeEmail(email);
  return withStore((d) => {
    if (d.users.some((u) => u.email === e)) {
      return { error: "exists" };
    }
    const id = d.nextUserId++;
    d.users.push({ id, email: e, password_hash: passwordHash });
    return { id, email: e };
  });
}

async function replaceLoginTokensForUser(userId, token, expiresAt) {
  const uid = Number(userId);
  withStore((d) => {
    d.loginTokens = d.loginTokens.filter((t) => t.userId !== uid);
    d.loginTokens.push({ token, userId: uid, expiresAt });
  });
}

async function takeLoginToken(token) {
  return withStore((d) => {
    const idx = d.loginTokens.findIndex((t) => t.token === token);
    if (idx === -1) return null;
    const row = d.loginTokens[idx];
    d.loginTokens.splice(idx, 1);
    return row;
  });
}

async function addWaitlistEmail(email) {
  const e = normalizeEmail(email);
  withStore((d) => {
    if (d.waitlist.some((w) => w.email === e)) return;
    d.waitlist.push({ email: e, createdAt: new Date().toISOString() });
  });
}

module.exports = {
  normalizeEmail,
  init,
  getUserByEmail,
  getUserById,
  createUser,
  replaceLoginTokensForUser,
  takeLoginToken,
  addWaitlistEmail,
};
