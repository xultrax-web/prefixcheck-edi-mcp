// ============================================================
// @prefixcheck/edi · EDIFACT tokenizer + envelope handling
//
// Universal layer that turns raw EDIFACT text into a structured
// object tree. The schema layer (CODECO/COPRAR validation) runs
// on top of this and is loaded separately so new message types
// can be added without touching the parser.
//
// EDIFACT delimiter conventions:
//   element separator    default '+'
//   composite separator  default ':'
//   segment terminator   default "'"
//   release character    default '?'  (escapes the next char)
//   decimal              default '.'  (or ',')
//   repetition           default '*'
//
// The optional UNA segment at the start of an interchange overrides
// the defaults. Format: `UNA:+.? '` — exactly 6 single-character
// overrides in the order: composite, element, decimal, release,
// repetition, segment.
// ============================================================

import type { Delimiters, Interchange, Message, ParsedMessage, Segment } from "./types.js";

export const DEFAULT_DELIMITERS: Delimiters = Object.freeze({
  element: "+",
  composite: ":",
  segment: "'",
  release: "?",
  decimal: ".",
  repetition: "*",
}) as Delimiters;

interface UNAResult {
  delimiters: Delimiters;
  rest: string;
}

function parseUNA(raw: string): UNAResult {
  if (raw.length < 9 || raw.slice(0, 3) !== "UNA") {
    return { delimiters: { ...DEFAULT_DELIMITERS }, rest: raw };
  }
  const spec = raw.slice(3, 9);
  return {
    delimiters: {
      composite: spec[0],
      element: spec[1],
      decimal: spec[2],
      release: spec[3],
      repetition: spec[4],
      segment: spec[5],
    },
    rest: raw.slice(9),
  };
}

/**
 * Split text by an unescaped delimiter character. A delimiter preceded
 * by the release character (default `?`) is a literal, not a delimiter.
 *
 * Note: this function PRESERVES release-character escape sequences in
 * the output. The escape (`?X`) stays as `?X` so that downstream splits
 * (e.g., element → composite → sub-element) can also honour escapes.
 * The final value layer strips escapes with `unescape()`.
 */
function splitUnescaped(text: string, delim: string, release: string): string[] {
  const parts: string[] = [];
  let buf = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === release && i + 1 < text.length) {
      buf += c + text[i + 1];
      i++;
      continue;
    }
    if (c === delim) {
      parts.push(buf);
      buf = "";
      continue;
    }
    buf += c;
  }
  parts.push(buf);
  return parts;
}

/**
 * Strip release-character escape sequences from a sub-element value.
 * Called only at the leaf layer, after all splitting is done.
 */
function unescape(text: string, release: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    if (text[i] === release && i + 1 < text.length) {
      out += text[i + 1];
      i++;
    } else {
      out += text[i];
    }
  }
  return out;
}

/**
 * Strip whitespace following each segment terminator without touching
 * content inside segments. Human-readable transmission commonly
 * inserts `\r\n` after each terminator; not part of the standard
 * but ubiquitous in archived files and operator pastes.
 */
function normalizeWhitespace(text: string, segDelim: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    out += c;
    if (c === segDelim) {
      while (i + 1 < text.length && /\s/.test(text[i + 1])) i++;
    }
  }
  return out;
}

interface EnvelopeResult {
  interchange: Interchange | null;
  message: Message | null;
  envelopeWarnings: string[];
}

function extractEnvelopes(segments: Segment[]): EnvelopeResult {
  let interchange: Interchange | null = null;
  let message: Message | null = null;
  const warnings: string[] = [];

  const first = segments[0];
  const last = segments[segments.length - 1];

  if (first && first.tag === "UNB") {
    interchange = {
      syntaxId: (first.elements[0] || [])[0] || "",
      syntaxVer: (first.elements[0] || [])[1] || "",
      sender: (first.elements[1] || [])[0] || "",
      senderQual: (first.elements[1] || [])[1] || "",
      recipient: (first.elements[2] || [])[0] || "",
      recipQual: (first.elements[2] || [])[1] || "",
      dateTime: (first.elements[3] || []).join(":") || "",
      controlRef: (first.elements[4] || [])[0] || "",
    };
    if (!last || last.tag !== "UNZ") {
      warnings.push("UNB interchange header found but no UNZ trailer.");
    }
  }

  for (let i = 0; i < segments.length; i++) {
    if (segments[i].tag === "UNH") {
      const unh = segments[i];
      message = {
        controlRef: (unh.elements[0] || [])[0] || "",
        type: (unh.elements[1] || [])[0] || "",
        version: (unh.elements[1] || [])[1] || "",
        release: (unh.elements[1] || [])[2] || "",
        agency: (unh.elements[1] || [])[3] || "",
        assocCode: (unh.elements[1] || [])[4] || "",
      };
      break;
    }
  }
  if (!message) {
    warnings.push("No UNH message header found. Parsed as raw segment body.");
  }

  return { interchange, message, envelopeWarnings: warnings };
}

/**
 * Tokenize a raw EDIFACT string into structured form.
 *
 * Accepts any of:
 * - bare message body (UNH ... UNT)
 * - full interchange (optional UNA, UNB ... UNZ wrapping one or more messages)
 * - whitespace-separated segments (newlines between `'` terminators)
 *
 * @example
 * ```ts
 * import { parse } from "@prefixcheck/edi";
 * const parsed = parse("UNH+1+CODECO:D:00B:UN:SMDG21'BGM+34+REF+9'...");
 * console.log(parsed.message?.type); // "CODECO"
 * ```
 */
export function parse(rawInput: string): ParsedMessage {
  if (!rawInput || typeof rawInput !== "string") {
    return {
      interchange: null,
      message: null,
      segments: [],
      delimiters: { ...DEFAULT_DELIMITERS },
      envelopeWarnings: ["Empty input."],
    };
  }

  // Strip BOM + outer whitespace
  const trimmed = rawInput.replace(/^﻿/, "").trim();
  const unaResult = parseUNA(trimmed);
  const delim = unaResult.delimiters;
  const body = normalizeWhitespace(unaResult.rest, delim.segment);

  const rawSegments = splitUnescaped(body, delim.segment, delim.release);
  const segments: Segment[] = [];
  let bodyIndex = 0;
  for (let s = 0; s < rawSegments.length; s++) {
    const segText = rawSegments[s].trim();
    if (!segText) continue;
    const elements = splitUnescaped(segText, delim.element, delim.release);
    const tagRaw = elements.shift() || "";
    const tag = unescape(tagRaw, delim.release);
    // Composite split → unescape each leaf sub-element value.
    const composed = elements.map((el) =>
      splitUnescaped(el, delim.composite, delim.release).map((v) => unescape(v, delim.release)),
    );
    segments.push({
      tag,
      index: bodyIndex++,
      elements: composed,
      raw: unescape(segText, delim.release),
    });
  }

  const env = extractEnvelopes(segments);
  return {
    interchange: env.interchange,
    message: env.message,
    segments,
    delimiters: delim,
    envelopeWarnings: env.envelopeWarnings,
  };
}

/**
 * Extract every ISO 6346-shaped container number (4 letters + 7 digits)
 * found anywhere in the parsed message. Useful for cross-referencing
 * to a registry or driving downstream linking.
 */
export function extractContainerNumbers(parsed: ParsedMessage): string[] {
  const pattern = /\b[A-Z]{4}\d{7}\b/g;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const seg of parsed.segments) {
    const matches = seg.raw.match(pattern) || [];
    for (const m of matches) {
      if (!seen.has(m)) {
        seen.add(m);
        out.push(m);
      }
    }
  }
  return out;
}

/**
 * Extract every UN/LOCODE-shaped token (5 chars: 2-letter country
 * code + 3-letter/digit location code) from LOC segments specifically.
 */
export function extractUNLocodes(parsed: ParsedMessage): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const seg of parsed.segments) {
    if (seg.tag !== "LOC") continue;
    const place = (seg.elements[1] || [])[0];
    if (place && /^[A-Z]{2}[A-Z0-9]{3}$/.test(place) && !seen.has(place)) {
      seen.add(place);
      out.push(place);
    }
  }
  return out;
}
