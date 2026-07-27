import path from "node:path";
import fs from "node:fs";

/** Root for everything the app writes: the database and the survey videos. */
export function dataDir(): string {
  const dir = process.env.MOVEMAN_DATA_DIR
    ? path.resolve(process.env.MOVEMAN_DATA_DIR)
    : path.join(process.cwd(), "data");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function videoDir(): string {
  const dir = path.join(dataDir(), "videos");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function databasePath(): string {
  return path.join(dataDir(), "moveman.db");
}
