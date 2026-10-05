import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

const connectionString = process.env.DATABASE_URL;

let db;
let client;

if (connectionString) {
  client = postgres(connectionString, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: 'prefer',
  });
  db = drizzle(client, { schema });
} else {
  // Graceful fallback if DATABASE_URL not yet configured
  db = null;
}

export { db, client };
