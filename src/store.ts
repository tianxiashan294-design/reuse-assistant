import { mkdir, readFile, readdir, realpath, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { confined, digest } from './project.js';
import type { Binding, CheckReport, Decision, SourceResult } from './types.js';
import { decisionNextAction } from './format.js';

export interface Gate { binding: Binding; createdAt: string; decisionId?: string; checkId?: string }
export class Store {
  readonly directory: string;
  constructor(readonly root: string) { this.directory = path.join(root, '.reuse-assistant'); }

  async initialize(): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    await confined(this.root, '.reuse-assistant');
    for (const name of ['checks', 'decisions', 'decision-index', 'cache', 'sessions']) {
      await mkdir(path.join(this.directory, name), { recursive: true });
      await confined(this.root, `.reuse-assistant/${name}`);
    }
  }

  private async file(folder: string, id: string): Promise<string> {
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) throw new Error('Invalid record identifier');
    await this.initialize();
    const dir = await realpath(path.join(this.directory, folder));
    await confined(this.root, path.relative(this.root, dir));
    const result = path.join(dir, `${id}.json`);
    try { await confined(this.root, path.relative(this.root, result)); }
    catch (error: any) { if (error.code !== 'ENOENT') throw error; }
    return result;
  }

  async read<T>(folder: string, id: string): Promise<T | undefined> {
    try { return JSON.parse(await readFile(await this.file(folder, id), 'utf8')) as T; }
    catch (error: any) { if (error.code === 'ENOENT') return undefined; throw error; }
  }

  async write(folder: string, id: string, data: unknown): Promise<void> {
    const target = await this.file(folder, id);
    const temp = `${target}.${randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify(data, null, 2) + '\n', { flag: 'wx' });
    await rename(temp, target);
  }

  check(id: string) { return this.read<CheckReport>('checks', id); }
  saveCheck(report: CheckReport) { return this.write('checks', report.id, report); }
  decision(id: string) { return this.read<Decision>('decisions', id); }
  saveDecision(decision: Decision) { return this.write('decisions', decision.id, decision); }
  async latestDecision(checkId: string): Promise<Decision | undefined> {
    const index = await this.read<{ decisionId: string }>('decision-index', checkId);
    if (index) {
      const existing = await this.decision(index.decisionId);
      return existing ? { ...existing, nextAction: existing.nextAction ?? decisionNextAction(existing.status) } : undefined;
    }
    // Existing v0 records predate the index. Reconstruct it once, without
    // changing the original evidence or validation claim.
    const files = (await readdir(path.join(this.directory, 'decisions'))).filter(f => /^[a-zA-Z0-9_-]+\.json$/.test(f));
    if (files.length > 5000) throw new Error('Decision history is too large for automatic index recovery');
    const matches: Decision[] = [];
    for (const file of files) {
      const d = await this.decision(file.slice(0, -5));
      if (d?.checkId === checkId) matches.push(d);
    }
    const order = { planned: 0, applied: 1, verified: 2 };
    matches.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || order[b.status] - order[a.status]);
    const latest = matches[0];
    if (!latest) return undefined;
    await this.linkDecision(checkId, latest.id);
    return { ...latest, nextAction: latest.nextAction ?? decisionNextAction(latest.status) };
  }
  linkDecision(checkId: string, decisionId: string) { return this.write('decision-index', checkId, { decisionId }); }

  async cache(key: string): Promise<{ createdAt: string; results: SourceResult[] } | undefined> {
    const entry = await this.read<{ createdAt: string; results: SourceResult[] }>('cache', key);
    if (entry && Date.now() - Date.parse(entry.createdAt) < 6 * 60 * 60 * 1000) return entry;
    return undefined;
  }
  saveCache(key: string, results: SourceResult[]) { return this.write('cache', key, { createdAt: new Date().toISOString(), results }); }
  gate(sessionId: string) { return this.read<Gate>('sessions', digest(sessionId)); }
  saveGate(gate: Gate) { return this.write('sessions', digest(gate.binding.sessionId), gate); }
}
