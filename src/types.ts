// ============================================================
// @prefixcheck/edi · public type surface
//
// Shared interfaces for the parser, schema, and diagnostic layers.
// ============================================================

/**
 * EDIFACT delimiter set. Defaults are `+ : ' ? . *`. Overridden by
 * the optional UNA service segment at the head of an interchange.
 */
export interface Delimiters {
  element: string;
  composite: string;
  segment: string;
  release: string;
  decimal: string;
  repetition: string;
}

/**
 * A single tokenized EDIFACT segment. Composite elements appear as
 * arrays of sub-element strings; simple elements appear as single-
 * element arrays (`["9"]`).
 */
export interface Segment {
  /** 3-letter segment tag (UNH, BGM, EQD, LOC, ...). */
  tag: string;
  /** 0-based position in the message body, in order encountered. */
  index: number;
  /** Element-by-element decomposition. Each element is an array of sub-elements. */
  elements: string[][];
  /** Raw segment text as encountered, minus the segment terminator. */
  raw: string;
}

/** Interchange envelope metadata from the UNB segment. */
export interface Interchange {
  syntaxId: string;
  syntaxVer: string;
  sender: string;
  senderQual: string;
  recipient: string;
  recipQual: string;
  dateTime: string;
  controlRef: string;
}

/** Message envelope metadata from the UNH segment. */
export interface Message {
  controlRef: string;
  type: string;
  version: string;
  release: string;
  agency: string;
  assocCode: string;
}

/** A complete parse result. */
export interface ParsedMessage {
  interchange: Interchange | null;
  message: Message | null;
  segments: Segment[];
  delimiters: Delimiters;
  envelopeWarnings: string[];
}

/** A diagnostic raised by the validation engine. */
export interface Diagnostic {
  level: "error" | "warn" | "info";
  /** Stable machine-readable code (e.g. `BAD_CHECK_DIGIT`). */
  code: string;
  /** Operator-grade human-readable explanation. */
  message: string;
  /** Index into the parsed `segments` array, when the diag is segment-scoped. */
  segmentIndex?: number;
  /** 3-letter segment tag, when scoped. */
  tag?: string;
}

/** One field-level diff in a reconciliation result. */
export interface ReconcileDiff {
  field: string;
  coprar: string;
  codeco: string;
  severity: "error" | "warn";
}

/** A matched container in a reconciliation report. */
export interface MatchedContainer {
  number: string;
  diffs: ReconcileDiff[];
}

/** The full reconciliation report from `reconcile(coprar, codeco)`. */
export interface ReconcileReport {
  coprarCount: number;
  codecoCount: number;
  matched: MatchedContainer[];
  /** Containers in COPRAR but missing from CODECO (expected, not gated). */
  inCoprarOnly: string[];
  /** Containers in CODECO but not on the COPRAR (gated, unexpected). */
  inCodecoOnly: string[];
  coprarType: string | null;
  codecoType: string | null;
}

/** Detected message type. */
export type MessageType = "CODECO" | "COPRAR" | null;

/** A successfully recognised message schema. */
export interface MessageSchema {
  name: "CODECO" | "COPRAR";
  longName: string;
  purpose: string;
  bgmCodes: string[];
  headerRequired: string[];
  bodyRequired: string[];
  trailerRequired: string[];
}
