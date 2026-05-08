import { mkdir, open, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function writeAtomic(path: string, content: string, mode = 0o600): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, content, { mode });
  await rename(tmp, path);
}

export async function withFileLock<T>(path: string, fn: () => Promise<T>): Promise<T> {
  const lockPath = `${path}.lock`;
  await mkdir(dirname(path), { recursive: true });
  let handle;
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      handle = await open(lockPath, "wx", 0o600);
      break;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EEXIST") throw error;
      await sleep(25);
    }
  }

  if (!handle) {
    throw new Error(`Could not acquire file lock: ${lockPath}`);
  }

  try {
    return await fn();
  } finally {
    await handle.close();
    await rm(lockPath, { force: true });
  }
}
