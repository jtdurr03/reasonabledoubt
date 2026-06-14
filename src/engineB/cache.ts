/**
 * Cache and dialogue artifact storage.
 *
 * Performed lines are cached by caseId, characterId, questionId, claimId, and
 * the minimal revealed-state key. The bake pass stores only validated lines
 * into a dialogue artifact (a sidecar file next to the bible, clearly marked as
 * generated). The runtime reads baked lines and makes no model calls.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import type { Id } from "../types/caseBible.js";

export interface DialogueEntry {
  characterId: Id;
  questionId: Id;
  claimId: Id;
  stateKey: string;
  line: string;
  usedFallback: boolean;
}

export interface DialogueArtifact {
  generatedBy: string;
  caseId: string;
  performerModel: string;
  verifierModel: string;
  /** Performed lines keyed by the composite key. */
  lines: Record<string, DialogueEntry>;
}

/** The composite cache key for one performed line. */
export function buildKey(
  caseId: string,
  characterId: Id,
  questionId: Id,
  claimId: Id,
  stateKey: string,
): string {
  return `${caseId}|${characterId}|${questionId}|${claimId}|${stateKey}`;
}

export function emptyArtifact(caseId: string, performerModel: string, verifierModel: string): DialogueArtifact {
  return { generatedBy: "engineB", caseId, performerModel, verifierModel, lines: {} };
}

export function loadArtifact(path: string): DialogueArtifact | undefined {
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, "utf8")) as DialogueArtifact;
}

export function saveArtifact(path: string, artifact: DialogueArtifact): void {
  writeFileSync(path, JSON.stringify(artifact, null, 2) + "\n");
}

/** The sidecar path for a bible file: <stem>.dialogue.json next to it. */
export function dialoguePathFor(biblePath: string): string {
  return biblePath.replace(/\.case\.json$/, ".dialogue.json").replace(/\.json$/, ".dialogue.json");
}

/**
 * A runtime lookup over a baked artifact. Returns the performed line for a tuple,
 * or undefined on a cache miss (the runner then falls back to the plain spine).
 */
export interface DialogueProvider {
  getLine(characterId: Id, questionId: Id, claimId: Id, stateKey: string): string | undefined;
}

export function dialogueProvider(artifact: DialogueArtifact): DialogueProvider {
  return {
    getLine(characterId, questionId, claimId, stateKey) {
      const entry = artifact.lines[buildKey(artifact.caseId, characterId, questionId, claimId, stateKey)];
      return entry?.line;
    },
  };
}
