import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, beforeEach } from "vitest";

process.env.JWT_SECRET = "test-only-secret-with-sufficient-length";
process.env.JWT_EXPIRES_IN = "1h";
process.env.APP_TIMEZONE = "Asia/Kolkata";
process.env.NODE_ENV = "test";

let mongo;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
});

beforeEach(async () => {
  await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})));
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});
