// ============================================================
// JSON File Store — simple file-based CRUD
// ============================================================

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { Version } from "../types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../../data");

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readColl<T>(name: string): T[] {
  ensureDir();
  const p = path.join(DATA_DIR, `${name}.json`);
  if (!fs.existsSync(p)) return [];
  try { return JSON.parse(fs.readFileSync(p, "utf-8")); } catch { return []; }
}

function writeColl<T>(name: string, data: T[]) {
  ensureDir();
  fs.writeFileSync(path.join(DATA_DIR, `${name}.json`), JSON.stringify(data, null, 2));
}

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

export function insertVersion(v: Omit<Version, "id" | "createdAt" | "updatedAt">): Version {
  const docs = readColl<Version>("versions");
  const now = Date.now();
  const doc: Version = { ...v, id: uid(), createdAt: now, updatedAt: now };
  docs.push(doc);
  writeColl("versions", docs);
  return doc;
}

export function listVersions(limit = 50, offset = 0) {
  const docs = readColl<Version>("versions");
  docs.sort((a, b) => b.createdAt - a.createdAt);
  return docs.slice(offset, offset + limit).map((v) => ({
    id: v.id,
    title: v.title,
    description: v.description,
    prompt: v.prompt,
    createdAt: v.createdAt,
  }));
}

export function getVersion(id: string): Version | undefined {
  return readColl<Version>("versions").find((v) => v.id === id);
}

export function deleteVersion(id: string): boolean {
  const docs = readColl<Version>("versions");
  const idx = docs.findIndex((v) => v.id === id);
  if (idx === -1) return false;
  docs.splice(idx, 1);
  writeColl("versions", docs);
  return true;
}

export function deleteVersions(ids: string[]): number {
  const docs = readColl<Version>("versions");
  const toRemove = new Set(ids);
  const filtered = docs.filter((v) => !toRemove.has(v.id));
  const removed = docs.length - filtered.length;
  writeColl("versions", filtered);
  return removed;
}
