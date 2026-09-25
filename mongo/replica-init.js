// Health check + one-time bootstrap for the production-style replica set.
//
// Runs as mongo1's Docker healthcheck, on *localhost inside the container*,
// every few seconds. It is idempotent:
//   1st run (empty cluster): rs.initiate() → wait for PRIMARY → create the root
//     user. Both are allowed with auth enabled thanks to MongoDB's "localhost
//     exception" (valid only until the first user exists).
//   every run: ensure the least-privilege application user exists, then exit 0
//     only if the replica set has a PRIMARY (otherwise the check fails).
//
// Invoked as: mongosh --quiet "mongodb://localhost:27017/?directConnection=true" /scripts/replica-init.js

const {
  MONGO_ROOT_USERNAME: rootUser,
  MONGO_ROOT_PASSWORD: rootPassword,
  MONGO_APP_USERNAME: appUser,
  MONGO_APP_PASSWORD: appPassword,
  MONGO_APP_DATABASE: appDatabase,
} = process.env;

const REPLICA_SET = {
  _id: 'rs0',
  members: [
    // Higher priority keeps mongo1 as the preferred primary (the bootstrap runs here).
    { _id: 0, host: 'mongo1:27017', priority: 2 },
    { _id: 1, host: 'mongo2:27017', priority: 1 },
    { _id: 2, host: 'mongo3:27017', priority: 1 },
  ],
};
const MAX_WAIT_ITERATIONS = 40;

const admin = db.getSiblingDB('admin');

function authenticateAsRoot() {
  try {
    admin.auth(rootUser, rootPassword);
    return true;
  } catch {
    return false; // the root user does not exist yet
  }
}

function waitForPrimary() {
  for (let i = 0; i < MAX_WAIT_ITERATIONS; i++) {
    if (db.hello().isWritablePrimary) return;
    sleep(500);
  }
  throw new Error('Timed out waiting for this member to become PRIMARY');
}

if (!authenticateAsRoot()) {
  // `hello` needs no authentication; `setName` is absent until the set is initiated.
  if (!db.hello().setName) {
    rs.initiate(REPLICA_SET);
  }
  waitForPrimary();
  admin.createUser({ user: rootUser, pwd: rootPassword, roles: ['root'] });
  admin.auth(rootUser, rootPassword);
  print('Replica set initiated and root user created.');
}

// The API gets readWrite on its own database only — never root.
const appDb = db.getSiblingDB(appDatabase);
if (!appDb.getUser(appUser)) {
  appDb.createUser({
    user: appUser,
    pwd: appPassword,
    roles: [{ role: 'readWrite', db: appDatabase }],
  });
  print(`Application user "${appUser}" created.`);
}

const hasPrimary = rs.status().members.some((member) => member.stateStr === 'PRIMARY');
if (!hasPrimary) throw new Error('Replica set has no PRIMARY yet');
