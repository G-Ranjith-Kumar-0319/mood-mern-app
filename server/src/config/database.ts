import mongoose, { type ClientSession } from 'mongoose';
import { config } from './env.js';
import { logger } from './logger.js';

// Reject filters on paths that are not in the schema instead of silently ignoring them.
mongoose.set('strictQuery', true);

let stopInMemoryServer: (() => Promise<unknown>) | null = null;

/**
 * Development convenience: with no MONGO_URI, start a throw-away in-memory
 * MongoDB so `npm run dev` works without installing anything. Data is lost on
 * restart. `mongodb-memory-server` is a devDependency and is never loaded in
 * production (config validation requires MONGO_URI there).
 */
async function resolveMongoUri(): Promise<string> {
  if (config.mongo.uri) return config.mongo.uri;

  const { MongoMemoryReplSet } = await import('mongodb-memory-server');
  // A one-member replica set (like production) so transactions and change streams work.
  const server = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  stopInMemoryServer = () => server.stop();
  logger.warn('MONGO_URI is not set: using an in-memory MongoDB. Data will NOT be persisted.');
  return server.getUri('expression_detector');
}

function monitorConnection(): void {
  const { connection } = mongoose;
  connection.on('connected', () => logger.info('MongoDB connected'));
  connection.on('reconnected', () => logger.info('MongoDB reconnected'));
  connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  connection.on('error', (error: unknown) => logger.error({ err: error }, 'MongoDB error'));
}

export async function connectDatabase(): Promise<void> {
  monitorConnection();
  const uri = await resolveMongoUri();
  await mongoose.connect(uri, {
    maxPoolSize: config.mongo.maxPoolSize,
    // Fail fast on startup/health checks instead of hanging for 30 s.
    serverSelectionTimeoutMS: 5000,
    // Indexes are created explicitly below and awaited, so startup fails loudly if they cannot be built.
    autoIndex: false,
  });
  await ensureIndexes();
}

/**
 * Creates any missing schema-declared indexes. Idempotent, so several API
 * instances may run it concurrently. Unlike `syncIndexes()` it never drops
 * indexes, so an index added manually by an operator is left alone.
 * Models must be imported (registered) before this runs.
 */
export async function ensureIndexes(): Promise<void> {
  await dropObsoleteIndexes();
  await Promise.all(mongoose.modelNames().map((name) => mongoose.model(name).createIndexes()));
}

/**
 * Indexes replaced by a better one. createIndexes() never drops anything, so
 * superseded indexes are removed explicitly — each costs write time and RAM.
 */
const OBSOLETE_INDEXES = [
  // Superseded by { userId, detectedAt, _id } (supports the tie-broken sort and cursors).
  { collection: 'expressiondetections', name: 'userId_1_detectedAt_-1' },
];

async function dropObsoleteIndexes(): Promise<void> {
  const db = mongoose.connection.db;
  if (!db) return;
  for (const { collection, name } of OBSOLETE_INDEXES) {
    try {
      await db.collection(collection).dropIndex(name);
      logger.info({ collection, index: name }, 'Dropped obsolete index');
    } catch {
      // Not there (fresh database or already dropped): nothing to do.
    }
  }
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
  await stopInMemoryServer?.();
}

export function isDatabaseConnected(): boolean {
  return mongoose.connection.readyState === mongoose.ConnectionStates.connected;
}

/** Round-trip to the server — used by the readiness probe. */
export async function pingDatabase(): Promise<boolean> {
  if (!isDatabaseConnected() || !mongoose.connection.db) return false;
  try {
    await mongoose.connection.db.admin().ping();
    return true;
  } catch {
    return false;
  }
}

let replicaSetCheck: Promise<boolean> | null = null;

/**
 * Transactions and change streams need a replica set (production and the Docker/in-memory
 * setups are one); a developer's standalone mongod is not. Asked once via `hello`.
 */
export function isReplicaSet(): Promise<boolean> {
  replicaSetCheck ??= (async () => {
    const hello = await mongoose.connection.db?.admin().command({ hello: 1 });
    return typeof hello?.setName === 'string';
  })().catch(() => {
    replicaSetCheck = null;
    return false;
  });
  return replicaSetCheck;
}

/**
 * Runs `work` in a multi-document transaction when the server supports it
 * (all writes commit or none do). On a standalone server the same steps run
 * without a transaction, ordered so a partial failure is harmless to retry.
 */
export async function withTransaction<T>(
  work: (session?: ClientSession) => Promise<T>,
): Promise<T> {
  if (!(await isReplicaSet())) {
    logger.warn('MongoDB is not a replica set: running without a transaction');
    return work(undefined);
  }
  return mongoose.connection.transaction((session) => work(session));
}
