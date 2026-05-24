# @prefixcheck/edi-mcp

MCP server exposing operator-grade EDIFACT **CODECO** + **COPRAR** + **IFTSTA** + **COREOR** tooling to any MCP client (Claude Desktop, Cursor, Cline, Continue, Claude Code).

```bash
npx -y @prefixcheck/edi-mcp
```

---

## What it does

Drops EDI parsing, SMDG validation, ISO 6346 check-digit verification, UN/LOCODE extraction, and COPRAR ↔ CODECO reconciliation directly into your AI workflow. Now you can paste a broken EDIFACT message into Claude/Cursor and ask "what's wrong with this?" — and get a real, operator-grade answer.

---

## Quick install · Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "prefixcheck-edi": {
      "command": "npx",
      "args": ["-y", "@prefixcheck/edi-mcp"]
    }
  }
}
```

Restart Claude Desktop. The 9 EDI tools become available.

## Quick install · Cursor

Add to `.cursor/mcp.json` (per-project) or `~/.cursor/mcp.json` (global):

```json
{
  "mcpServers": {
    "prefixcheck-edi": {
      "command": "npx",
      "args": ["-y", "@prefixcheck/edi-mcp"]
    }
  }
}
```

## Quick install · Cline / Continue

Same `mcpServers` shape — both clients use the standard MCP configuration format.

---

## Tools (9)

| Tool                        | Returns                                                    |
| --------------------------- | ---------------------------------------------------------- |
| `parse_message`             | Full ParsedMessage structure for a CODECO/COPRAR text      |
| `diagnose_message`          | All 11 SMDG-grade diagnostic findings                      |
| `reconcile_messages`        | COPRAR ↔ CODECO field-level diff report (8 fields)         |
| `validate_container_number` | ISO 6346 check digit (true/false + computed value)         |
| `decode_size_type`          | 4-character ISO size-type → operator-readable English      |
| `lookup_code`               | Any of 21 code-list values → English (DTM/LOC/EQD/NAD/...) |
| `segment_info`              | Operator-grade name + brief for any 3-letter segment tag   |
| `extract_containers`        | All ISO 6346 container numbers from a message              |
| `extract_locodes`           | All UN/LOCODE values from LOC segments                     |

## Resources (6)

| URI                   | Type | Content                                                               |
| --------------------- | ---- | --------------------------------------------------------------------- |
| `edi://schema/codeco` | json | CODECO message metadata (purpose, BGM codes, required segments)       |
| `edi://schema/coprar` | json | COPRAR message metadata                                               |
| `edi://sample/codeco` | text | Real-shape SMDG D.00B CODECO sample message                           |
| `edi://sample/coprar` | text | Real-shape SMDG D.00B COPRAR sample (matched pair with CODECO sample) |
| `edi://segments`      | json | Full 32-segment dictionary                                            |
| `edi://codes`         | json | All 21 code lists with codes + English decodes                        |

---

## What you can do with it

**Depot dispatcher**: paste a CODECO into Claude, ask "what's wrong?" → tool runs `diagnose_message`, returns the failing rule (bad check digit, wrong DTM format, missing NAD+CF, etc.) with the exact segment that triggered it.

**Developer debugging**: paste a COPRAR your partner rejected → tool surfaces every SMDG validation failure with the rule that caught it.

**Reconciliation**: "here's the COPRAR I sent and the CODECO I got back — do they match?" → tool runs `reconcile_messages`, returns container-by-container field diffs (size-type, full/empty, POL, POD, booking, gross weight ±2%, VGM ±5%, reefer temp ±1°C).

**Reference**: "what does EQD position 5 mean?" → tool reads `edi://segments` + `edi://codes` resources.

**Training**: junior operator pastes a message → AI walks through each segment using `segment_info` + `lookup_code`.

---

## Built on

- [`@prefixcheck/edi`](https://www.npmjs.com/package/@prefixcheck/edi) — the underlying TS library
- [UN/EDIFACT D.00B](https://service.unece.org/trade/untdid/d00b/) — directory
- [SMDG](https://smdg.org/) — 2.1.3 ST VGM CODECO + COPRAR Implementation Guides
- Operator guides from DAKOSY (Hamburg), Valenciaport PCS, Transnet, EPB Bilbao

Companion surfaces:

- **In-browser tool**: [prefixcheck.com/container-edi/](https://prefixcheck.com/container-edi/)
- **Public HTTP API**: `POST /api/edi/decode` + `POST /api/edi/reconcile` at prefixcheck.com
- **Embeddable widget**: `<iframe src="https://prefixcheck.com/embed/edi/">`
- **npm library**: `npm install @prefixcheck/edi`
- **MCP server**: this package

---

## License

MIT
