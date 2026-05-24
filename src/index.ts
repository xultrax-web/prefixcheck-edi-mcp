#!/usr/bin/env node
/**
 * @prefixcheck/edi-mcp
 *
 * MCP server exposing operator-grade EDIFACT CODECO + COPRAR
 * tooling to any MCP client (Claude Desktop, Cursor, Cline,
 * Continue, Claude Code, etc.).
 *
 * Wraps the same parser + schemas that power:
 *   - https://prefixcheck.com/container-edi/    (in-browser tool)
 *   - https://prefixcheck.com/api/edi/decode    (HTTP API)
 *   - @prefixcheck/edi                          (npm library)
 *
 * Nine tools + six resources. Pure stdio MCP — no HTTP server,
 * no auth, no state.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { parse, extractContainerNumbers, extractUNLocodes } from "./parser.js";
import {
  CODECO,
  COPRAR,
  IFTSTA,
  COREOR,
  CODE_LISTS,
  SEGMENTS,
  decodeISOSizeType,
  detectMessageType,
  diagnoseSingle,
  lookup,
  reconcile,
  segmentInfo,
  validateCheckDigit,
} from "./schemas.js";
import { SAMPLE_CODECO, SAMPLE_COPRAR, SAMPLE_IFTSTA, SAMPLE_COREOR } from "./samples.js";

// -------------------------------------------------------------
// Server setup
// -------------------------------------------------------------

const SERVER_NAME = "prefixcheck-edi-mcp";
const SERVER_VERSION = "0.2.0";

const server = new Server(
  { name: SERVER_NAME, version: SERVER_VERSION },
  { capabilities: { tools: {}, resources: {} } },
);

// -------------------------------------------------------------
// Tools
// -------------------------------------------------------------

interface ToolDef {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, { type: string; description: string }>;
    required?: string[];
  };
}

const TOOLS: ToolDef[] = [
  {
    name: "parse_message",
    description:
      "Tokenize a raw EDIFACT CODECO, COPRAR, IFTSTA, or COREOR message into structured segments + envelope metadata. Handles UNA delimiter overrides, UNB/UNZ + UNH/UNT envelopes, and release-character escapes. Returns the full ParsedMessage structure.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Raw EDIFACT message text." },
      },
      required: ["text"],
    },
  },
  {
    name: "diagnose_message",
    description:
      "Parse a CODECO, COPRAR, IFTSTA, or COREOR message and run all 11 SMDG-grade diagnostic rules against it. Returns the list of findings (errors + warnings + info). Empty list = clean message.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Raw EDIFACT message text." },
      },
      required: ["text"],
    },
  },
  {
    name: "reconcile_messages",
    description:
      "Cross-message reconciliation between a COPRAR (carrier → terminal load list) and its matching CODECO (terminal → carrier gate report). Returns container-by-container field-level diff report. Tolerances: gross weight ±2%, VGM ±5%, reefer temp ±1°C.",
    inputSchema: {
      type: "object",
      properties: {
        coprar: { type: "string", description: "Raw EDIFACT COPRAR text." },
        codeco: { type: "string", description: "Raw EDIFACT CODECO text." },
      },
      required: ["coprar", "codeco"],
    },
  },
  {
    name: "validate_container_number",
    description:
      "Validate an ISO 6346 container number's check digit (mod-11 weighted-letter algorithm). Returns { valid: boolean, code, computed_check_digit }.",
    inputSchema: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description: "11-character container number (e.g. 'MSCU1234566').",
        },
      },
      required: ["code"],
    },
  },
  {
    name: "decode_size_type",
    description:
      "Decode a 4-character ISO 6346 size-type code (e.g. '45R1') into operator-readable parts: size, type, height/variant, variant digit.",
    inputSchema: {
      type: "object",
      properties: {
        code: { type: "string", description: "4-character ISO 6346 size-type code." },
      },
      required: ["code"],
    },
  },
  {
    name: "lookup_code",
    description:
      "Decode any code-list value to plain English. Lists available: BGM.docname, BGM.function, DTM.qualifier, DTM.format, LOC.qualifier, EQD.type, EQD.supplier, EQD.fullEmpty, STS.code, RFF.qualifier, NAD.party, MEA.qualifier, MEA.unit, VGM.method, HAN.code, SEL.party, FTX.qualifier, TDT.mode, TDT.idCodeList, CNT.qualifier, UNB.syntax.",
    inputSchema: {
      type: "object",
      properties: {
        list_name: { type: "string", description: "Code list name (e.g. 'DTM.qualifier')." },
        code: { type: "string", description: "Code value (e.g. '137')." },
      },
      required: ["list_name", "code"],
    },
  },
  {
    name: "segment_info",
    description:
      "Get the operator-grade English name + brief explanation for a 3-letter EDIFACT segment tag (e.g. 'EQD', 'LOC', 'TDT').",
    inputSchema: {
      type: "object",
      properties: {
        tag: { type: "string", description: "3-letter segment tag." },
      },
      required: ["tag"],
    },
  },
  {
    name: "extract_containers",
    description:
      "Extract every ISO 6346-shaped container number (4 letters + 7 digits) from anywhere in an EDIFACT message. Returns deduplicated list.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Raw EDIFACT message text." },
      },
      required: ["text"],
    },
  },
  {
    name: "extract_locodes",
    description:
      "Extract every 5-character UN/LOCODE (2-letter country + 3-char place) from LOC segments in an EDIFACT message. Returns deduplicated list.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Raw EDIFACT message text." },
      },
      required: ["text"],
    },
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const a = (args || {}) as Record<string, unknown>;

  try {
    switch (name) {
      case "parse_message": {
        const text = String(a.text || "");
        const parsed = parse(text);
        return jsonResult({
          message_type: detectMessageType(parsed),
          interchange: parsed.interchange,
          message: parsed.message,
          segments: parsed.segments,
          delimiters: parsed.delimiters,
          envelope_warnings: parsed.envelopeWarnings,
        });
      }
      case "diagnose_message": {
        const text = String(a.text || "");
        const parsed = parse(text);
        const diagnostics = diagnoseSingle(parsed);
        return jsonResult({
          message_type: detectMessageType(parsed),
          diagnostics,
          counts: {
            errors: diagnostics.filter((d) => d.level === "error").length,
            warnings: diagnostics.filter((d) => d.level === "warn").length,
            infos: diagnostics.filter((d) => d.level === "info").length,
          },
        });
      }
      case "reconcile_messages": {
        const coprar = parse(String(a.coprar || ""));
        const codeco = parse(String(a.codeco || ""));
        return jsonResult({
          report: reconcile(coprar, codeco),
          coprar_warnings: coprar.envelopeWarnings,
          codeco_warnings: codeco.envelopeWarnings,
        });
      }
      case "validate_container_number": {
        const code = String(a.code || "");
        const valid = validateCheckDigit(code);
        return jsonResult({ code, valid });
      }
      case "decode_size_type": {
        const code = String(a.code || "");
        const decoded = decodeISOSizeType(code);
        return jsonResult({ code, decoded });
      }
      case "lookup_code": {
        const list_name = String(a.list_name || "");
        const code = String(a.code || "");
        const decoded = lookup(list_name, code);
        return jsonResult({ list_name, code, decoded });
      }
      case "segment_info": {
        const tag = String(a.tag || "").toUpperCase();
        return jsonResult({ tag, ...segmentInfo(tag) });
      }
      case "extract_containers": {
        const parsed = parse(String(a.text || ""));
        return jsonResult({ container_numbers: extractContainerNumbers(parsed) });
      }
      case "extract_locodes": {
        const parsed = parse(String(a.text || ""));
        return jsonResult({ un_locodes: extractUNLocodes(parsed) });
      }
      default:
        return jsonResult({ error: `Unknown tool: ${name}` }, true);
    }
  } catch (err) {
    return jsonResult(
      { error: err instanceof Error ? err.message : "Unknown error", tool: name },
      true,
    );
  }
});

function jsonResult(payload: unknown, isError = false) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
    ...(isError ? { isError: true } : {}),
  };
}

// -------------------------------------------------------------
// Resources
// -------------------------------------------------------------

const RESOURCES = [
  {
    uri: "edi://schema/codeco",
    name: "CODECO schema",
    description: "CODECO message metadata: name, longName, purpose, BGM codes, required segments.",
    mimeType: "application/json",
  },
  {
    uri: "edi://schema/coprar",
    name: "COPRAR schema",
    description: "COPRAR message metadata: name, longName, purpose, BGM codes, required segments.",
    mimeType: "application/json",
  },
  {
    uri: "edi://schema/iftsta",
    name: "IFTSTA schema",
    description: "IFTSTA message metadata.",
    mimeType: "application/json",
  },
  {
    uri: "edi://schema/coreor",
    name: "COREOR schema",
    description: "COREOR message metadata.",
    mimeType: "application/json",
  },
  {
    uri: "edi://sample/codeco",
    name: "CODECO sample",
    description:
      "Real-shape SMDG D.00B CODECO sample message (gate-in, terminal → carrier, MSCU1234566 full 40HC NLRTM → USNYC).",
    mimeType: "text/plain",
  },
  {
    uri: "edi://sample/coprar",
    name: "COPRAR sample",
    description:
      "Real-shape SMDG D.00B COPRAR Load sample message (carrier → terminal, 3 containers including 1 reefer, matched-pair with the CODECO sample on MSCU1234566).",
    mimeType: "text/plain",
  },
  {
    uri: "edi://sample/iftsta",
    name: "IFTSTA sample",
    description:
      "Real-shape SMDG D.00B IFTSTA sample (terminal → carrier status report, two status events chained: loaded onto vessel + gate-out full import, same MSCU1234566 container).",
    mimeType: "text/plain",
  },
  {
    uri: "edi://sample/coreor",
    name: "COREOR sample",
    description:
      "Real-shape SMDG D.00B COREOR Container Release Order sample (carrier MSC releases MSCU1234566 to consignee ACME at APMT NYC; one RFF+AAY release ref, expiration date set).",
    mimeType: "text/plain",
  },
  {
    uri: "edi://segments",
    name: "Segment dictionary",
    description:
      "Full 32-segment dictionary with operator-grade name + brief for every common CODECO/COPRAR segment.",
    mimeType: "application/json",
  },
  {
    uri: "edi://codes",
    name: "Code lists index",
    description:
      "Index of all 21 code lists available via lookup_code. Each list has 5-40 codes with English decodes.",
    mimeType: "application/json",
  },
];

server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: RESOURCES }));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uri = request.params.uri;
  switch (uri) {
    case "edi://schema/codeco":
      return {
        contents: [{ uri, mimeType: "application/json", text: JSON.stringify(CODECO, null, 2) }],
      };
    case "edi://schema/coprar":
      return {
        contents: [{ uri, mimeType: "application/json", text: JSON.stringify(COPRAR, null, 2) }],
      };
    case "edi://schema/iftsta":
      return {
        contents: [{ uri, mimeType: "application/json", text: JSON.stringify(IFTSTA, null, 2) }],
      };
    case "edi://schema/coreor":
      return {
        contents: [{ uri, mimeType: "application/json", text: JSON.stringify(COREOR, null, 2) }],
      };
    case "edi://sample/codeco":
      return { contents: [{ uri, mimeType: "text/plain", text: SAMPLE_CODECO }] };
    case "edi://sample/coprar":
      return { contents: [{ uri, mimeType: "text/plain", text: SAMPLE_COPRAR }] };
    case "edi://sample/iftsta":
      return { contents: [{ uri, mimeType: "text/plain", text: SAMPLE_IFTSTA }] };
    case "edi://sample/coreor":
      return { contents: [{ uri, mimeType: "text/plain", text: SAMPLE_COREOR }] };
    case "edi://segments":
      return {
        contents: [{ uri, mimeType: "application/json", text: JSON.stringify(SEGMENTS, null, 2) }],
      };
    case "edi://codes": {
      const index = Object.fromEntries(
        Object.entries(CODE_LISTS).map(([k, v]) => [
          k,
          { code_count: Object.keys(v).length, codes: v },
        ]),
      );
      return {
        contents: [{ uri, mimeType: "application/json", text: JSON.stringify(index, null, 2) }],
      };
    }
    default:
      throw new Error(`Unknown resource: ${uri}`);
  }
});

// -------------------------------------------------------------
// Boot
// -------------------------------------------------------------

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(
    `${SERVER_NAME} v${SERVER_VERSION} ready · 9 tools · 10 resources · CODECO + COPRAR + IFTSTA + COREOR\n`,
  );
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
