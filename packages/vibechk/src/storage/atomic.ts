import { writeFileSync, readFileSync, existsSync, renameSync, appendFileSync } from 'fs'
import { randomBytes } from 'crypto'

/** Atomically write JSON to a file (write to tmp, then rename) */
export function writeJson<T>(filePath: string, data: T): void {
  const tmp = filePath + '.tmp.' + randomBytes(6).toString('hex')
  writeFileSync(tmp, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o600 })
  renameSync(tmp, filePath)
}

/** Read and parse a JSON file, returning null if not found */
export function readJson<T>(filePath: string): T | null {
  if (!existsSync(filePath)) return null
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as T
  } catch {
    return null
  }
}

/** Append a JSONL line to a file */
export function appendJsonl<T>(filePath: string, entry: T): void {
  const line = JSON.stringify(entry) + '\n'
  appendFileSync(filePath, line, { encoding: 'utf8', mode: 0o600 })
}

/** Read all JSONL entries from a file */
export function readJsonl<T>(filePath: string): T[] {
  if (!existsSync(filePath)) return []
  try {
    const content = readFileSync(filePath, 'utf8')
    return content
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as T)
  } catch {
    return []
  }
}
