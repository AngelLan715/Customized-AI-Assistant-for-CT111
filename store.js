/**
 * Data layer:
 * - prefers PostgreSQL when DATABASE_URL is set
 * - automatically falls back to local JSON store if PostgreSQL init fails
 */
const pgImpl = require("./store-pg");
const fileImpl = require("./store-file");

let backend = "file";
let impl = fileImpl;

async function init() {
  const wantsPg = Boolean(process.env.DATABASE_URL && String(process.env.DATABASE_URL).trim());
  if (!wantsPg) {
    backend = "file";
    impl = fileImpl;
    await impl.init();
    return;
  }

  try {
    await pgImpl.init();
    backend = "postgres";
    impl = pgImpl;
  } catch (err) {
    console.warn("[store] PostgreSQL init failed. Falling back to file store.");
    console.warn(`[store] Reason: ${err.message}`);
    backend = "file";
    impl = fileImpl;
    await impl.init();
  }
}

module.exports = {
  get backend() {
    return backend;
  },
  init,
  normalizeEmail: (...args) => impl.normalizeEmail(...args),
  getUserByEmail: (...args) => impl.getUserByEmail(...args),
  getUserById: (...args) => impl.getUserById(...args),
  createUser: (...args) => impl.createUser(...args),
  replaceLoginTokensForUser: (...args) => impl.replaceLoginTokensForUser(...args),
  takeLoginToken: (...args) => impl.takeLoginToken(...args),
  addWaitlistEmail: (...args) => impl.addWaitlistEmail(...args),
};
