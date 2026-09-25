import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { ensureIndexes } from '../../src/config/database.js';
// Register the models so ensureIndexes() knows about them.
import '../../src/models/expressionDetection.model.js';
import '../../src/models/user.model.js';
import '../../src/models/authToken.model.js';

/**
 * Gives each test file its own throw-away MongoDB replica set (downloaded once, cached by
 * mongodb-memory-server). Tests never touch a developer's local database.
 */
export function useTestDatabase(): void {
  let server: MongoMemoryReplSet;

  beforeAll(async () => {
    // A replica set (not a standalone server) so transactions and change streams work, like production.
    server = await MongoMemoryReplSet.create({
      replSet: { count: 1, storageEngine: 'wiredTiger' },
    });
    await mongoose.connect(server.getUri('expression_test'));
    await ensureIndexes();
  });

  afterEach(async () => {
    const collections = await mongoose.connection.db?.collections();
    await Promise.all(collections?.map((collection) => collection.deleteMany({})) ?? []);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await server?.stop();
  });
}
