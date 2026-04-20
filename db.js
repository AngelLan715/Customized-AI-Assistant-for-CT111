const postgres = require("postgres");

/**
 * Supabase / Postgres connection via postgres.js
 * https://github.com/porsager/postgres
 */
function createSql() {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) return null;

  return postgres(connectionString, {
    max: 10,
    ssl: process.env.DATABASE_SSL === "false" ? false : "require",
  });
}

let sql;

function getSql() {
  if (sql === undefined) {
    sql = createSql();
  }
  if (!sql) {
    throw new Error("PostgreSQL is not configured (set DATABASE_URL)");
  }
  return sql;
}

async function initTables() {
  const sql = getSql();

  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS login_tokens (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at BIGINT NOT NULL
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_login_tokens_user_id ON login_tokens(user_id)`;
  await sql`
    CREATE TABLE IF NOT EXISTS waitlist (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

module.exports = { getSql, initTables };
