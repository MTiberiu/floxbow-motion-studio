import path from "node:path";

const writes = new Map<string, Promise<unknown>>();

/** Serialize atomic project file updates that share the canonical project.json. */
export async function withProjectWriteLock<T>(
  projectRoot: string,
  write: () => Promise<T>,
): Promise<T> {
  const key = path.resolve(projectRoot);
  const previous = writes.get(key) ?? Promise.resolve();
  const job = previous.catch(() => {}).then(write);
  writes.set(key, job);
  try {
    return await job;
  } finally {
    if (writes.get(key) === job) writes.delete(key);
  }
}
