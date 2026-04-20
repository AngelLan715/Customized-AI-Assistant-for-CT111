const { getSql, initTables } = require("./db");

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

async function init() {
  await initTables();
}

async function getUserByEmail(email) {
  const e = normalizeEmail(email);
  const sql = getSql();
  const rows = await sql`
    SELECT id, email, password_hash FROM users WHERE email = ${e}
  `;
  return rows[0] || null;
}

async function getUserById(id) {
  const sql = getSql();
  const rows = await sql`
    SELECT id, email FROM users WHERE id = ${Number(id)}
  `;
  return rows[0] || null;
}

async function createUser(email, passwordHash) {
  const e = normalizeEmail(email);
  const sql = getSql();
  try {
    const rows = await sql`
      INSERT INTO users (email, password_hash)
      VALUES (${e}, ${passwordHash})
      RETURNING id, email
    `;
    return { id: rows[0].id, email: rows[0].email };
  } catch (err) {
    if (err.code === "23505") {
      return { error: "exists" };
    }
    throw err;
  }
}

async function replaceLoginTokensForUser(userId, token, expiresAt) {
  const uid = Number(userId);
  const sql = getSql();
  await sql.begin(async (tx) => {
    await tx`DELETE FROM login_tokens WHERE user_id = ${uid}`;
    await tx`
      INSERT INTO login_tokens (token, user_id, expires_at)
      VALUES (${token}, ${uid}, ${expiresAt})
    `;
  });
}

async function takeLoginToken(token) {
  const sql = getSql();
  const rows = await sql`
    DELETE FROM login_tokens WHERE token = ${token}
    RETURNING user_id, expires_at
  `;
  if (!rows.length) return null;
  return {
    userId: rows[0].user_id,
    expiresAt: Number(rows[0].expires_at),
  };
}

async function addWaitlistEmail(email) {
  const e = normalizeEmail(email);
  const sql = getSql();
  await sql`
    INSERT INTO waitlist (email) VALUES (${e})
    ON CONFLICT (email) DO NOTHING
  `;
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
