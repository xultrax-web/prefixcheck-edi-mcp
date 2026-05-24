// ============================================================
// @prefixcheck/edi · CODECO + COPRAR schemas, code lists, diagnostics
//
// Sourced from:
//   - UN/EDIFACT D.00B directories (UNECE)
//   - SMDG 2.1.3 ST VGM CODECO + COPRAR Implementation Guides
//   - SMDG Recommendation 07 (code lists), JM4/120 (FTX), JM4/272 (damage)
//   - DAKOSY, Valenciaport PCS, Transnet, EPB Bilbao operator guides
// ============================================================

import type {
  Diagnostic,
  MatchedContainer,
  MessageSchema,
  MessageType,
  ParsedMessage,
  ReconcileDiff,
  ReconcileReport,
  Segment,
} from "./types.js";

// ── ISO 6346 check-digit (Mod-11 weighted-letter algorithm) ────
const LETTER_VALUES: Record<string, number> = {
  A: 10,
  B: 12,
  C: 13,
  D: 14,
  E: 15,
  F: 16,
  G: 17,
  H: 18,
  I: 19,
  J: 20,
  K: 21,
  L: 23,
  M: 24,
  N: 25,
  O: 26,
  P: 27,
  Q: 28,
  R: 29,
  S: 30,
  T: 31,
  U: 32,
  V: 34,
  W: 35,
  X: 36,
  Y: 37,
  Z: 38,
};

/**
 * Validate an ISO 6346 container number's check digit (11th character).
 * Letter values skip every multiple of 11.
 */
export function validateCheckDigit(code: string): boolean {
  if (!/^[A-Z]{4}\d{7}$/.test(code)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const ch = code[i];
    const v = i < 4 ? LETTER_VALUES[ch] : Number(ch);
    sum += v * (1 << i);
  }
  return (sum % 11) % 10 === Number(code[10]);
}

// ── Segment dictionary ────────────────────────────────────────
export interface SegmentInfo {
  name: string;
  brief: string;
}

export const SEGMENTS: Record<string, SegmentInfo> = {
  UNA: {
    name: "Service String Advice",
    brief: "Optional delimiter override at the start of an interchange.",
  },
  UNB: {
    name: "Interchange Header",
    brief: "Envelope · sender, recipient, control reference, syntax level.",
  },
  UNZ: { name: "Interchange Trailer", brief: "Envelope close · message count + ref echo of UNB." },
  UNH: {
    name: "Message Header",
    brief: "Message envelope open · message type + version + SMDG implementation tag.",
  },
  UNT: {
    name: "Message Trailer",
    brief: "Message envelope close · segment count + ref echo of UNH.",
  },
  BGM: {
    name: "Beginning of Message",
    brief: "Document type + reference number + function (original / replacement / change).",
  },
  DTM: {
    name: "Date / Time / Period",
    brief:
      "Timestamps qualified by purpose (137 issue date, 132 ETA, 134 ATA, 178 actual gate, 798 stuffing).",
  },
  LOC: {
    name: "Place / Location Identification",
    brief: "UN/LOCODE for ports, terminals, depots, plus stowage cell + next port of call.",
  },
  NAD: {
    name: "Name and Address",
    brief:
      "Parties to the message (CA carrier, CF container operator, TR terminal, CN consignee, CZ consignor).",
  },
  CTA: { name: "Contact Information", brief: "Contact person within a NAD party." },
  COM: { name: "Communication Contact", brief: "Phone / email / fax for a CTA." },
  CNI: {
    name: "Consignment Information",
    brief:
      "Consignment identifier on IFTSTA — sequence + reference (B/L, booking, waybill). One per consignment block; many SG5 status events can attach to one CNI.",
  },
  RFF: {
    name: "Reference",
    brief:
      "External references — booking (BN), B/L (BM), equipment (EQ), release (AAY), voyage (VON).",
  },
  EQD: {
    name: "Equipment Details",
    brief: "Container: type CN, BIC code, ISO size-type, supplier indicator, full/empty status.",
  },
  EQN: { name: "Number of Units", brief: "Number of equipment units in a group." },
  EQA: {
    name: "Attached Equipment",
    brief: "Chassis (CH) or reefer gen-set (RG) attached to the container.",
  },
  TMD: {
    name: "Transport Movement Details",
    brief: "FCL / LCL movement type, transport service code.",
  },
  HAN: {
    name: "Handling Instructions",
    brief:
      "How the container should be handled (handle with care, keep upright, reefer pre-cool, etc.).",
  },
  MEA: {
    name: "Measurements",
    brief:
      "Weights, dimensions, VGM — qualified (AAE gross, AAL tare, AAJ payload, VGM verified gross mass).",
  },
  DIM: {
    name: "Dimensions",
    brief: "Out-of-gauge dimensions (over-length, over-height, over-width).",
  },
  TMP: { name: "Temperature", brief: "Reefer setpoint temperature." },
  RNG: { name: "Range Details", brief: "Reefer temperature range / acceptable variance." },
  SEL: {
    name: "Seal Number",
    brief:
      "Container seal identifiers + applying party (CA carrier, SH shipper, TR terminal, CU customs).",
  },
  FTX: {
    name: "Free Text",
    brief:
      "Operator-readable narrative qualified by purpose (AAA general, DAR damage, OSI other info, ABS condition).",
  },
  DGS: {
    name: "Dangerous Goods",
    brief: "IMDG class, UN number, packing group, flashpoint — SOLAS-relevant.",
  },
  TDT: {
    name: "Details of Transport",
    brief: "Vessel name + voyage + IMO number + carrier (mode 1 sea, 2 rail, 3 road).",
  },
  TPL: {
    name: "Transport Placement",
    brief: "Stowage cell on the vessel: 6-digit BBBRRTT (bay-row-tier).",
  },
  DAM: {
    name: "Damage",
    brief: "Damage location + severity per SMDG JM4/272 (lifts ISO 9897 damage catalogue).",
  },
  COD: { name: "Component Details", brief: "Component code + damage detail for DAM segment." },
  DOC: {
    name: "Document / Message Details",
    brief: "Document reference (EIR ID, gate receipt no., survey no.).",
  },
  GID: { name: "Goods Item Details", brief: "Description of goods inside the container." },
  GDS: { name: "Nature of Cargo", brief: "Cargo nature classification." },
  PIA: { name: "Additional Product Identification", brief: "Additional product identification." },
  CNT: {
    name: "Control Total",
    brief: "CNT+16:n = number of equipment units. CNT+7:n = total TEU.",
  },
  STS: {
    name: "Status",
    brief:
      "Container event status (1 empty, 2 full/loaded, gate-in, gate-out, on-hire, off-hire, hold).",
  },
};

// ── Code lists ────────────────────────────────────────────────
type CodeList = Record<string, string>;

export const CODE_LISTS: Record<string, CodeList> = {
  "BGM.docname": {
    "12": "Container release order (COREOR)",
    "23": "Transport status report (IFTSTA)",
    "34": "Transport equipment gate-in report (CODECO)",
    "35": "Transport equipment gate-out report (CODECO)",
    "36": "Transport equipment movement (CODECO)",
    "45": "Container loading order (COPRAR Load)",
    "46": "Container discharge order (COPRAR Discharge)",
    "244": "Container loading list",
    "245": "Pre-loading list",
    "350": "Despatch advice",
  },
  "BGM.function": {
    "1": "Cancellation",
    "4": "Change (delta)",
    "5": "Replacement (full re-issue)",
    "6": "Confirmation",
    "7": "Duplicate",
    "9": "Original",
  },
  "DTM.qualifier": {
    "7": "Effective date/time",
    "11": "Despatch date/time",
    "132": "ETA (estimated arrival)",
    "133": "ETD (estimated departure)",
    "134": "ATA (actual arrival)",
    "136": "Document/message date",
    "137": "Document/message issue date and time",
    "178": "Actual arrival/gate of equipment",
    "200": "Pick-up date/time, planned",
    "201": "Delivery date/time, planned",
    "203": "Execution date/time, actual",
    "234": "Equipment pick-up planned (gate-out)",
    "798": "Container stuffing date/time",
  },
  "DTM.format": {
    "101": "YYMMDD",
    "102": "CCYYMMDD",
    "203": "CCYYMMDDHHMM (SMDG-mandated)",
    "204": "CCYYMMDDHHMMSS",
    "718": "CCYYMMDD–CCYYMMDD range",
  },
  "LOC.qualifier": {
    "5": "Place of departure",
    "7": "Place of delivery (final destination)",
    "8": "Place of loading",
    "9": "Port/place of loading (POL)",
    "11": "Port/place of discharge (POD)",
    "12": "Port of transhipment",
    "13": "Place of transhipment",
    "14": "Place of arrival",
    "17": "Stowage cell",
    "18": "Place of receipt",
    "19": "Place of departure of carrier",
    "27": "Country of origin",
    "35": "Final place of delivery",
    "76": "Place of consignment origin",
    "83": "Place of final delivery",
    "88": "Place of acceptance",
    "92": "Routing",
    "147": "Stowage cell / container position on board",
    "152": "Container terminal",
    "153": "Storage location",
    "154": "Customs office",
    "165": "Next port of call",
    "168": "Container yard",
    "172": "Estimated place of arrival",
    "174": "Estimated place of departure",
    "175": "Place of mooring",
    "178": "Inland depot",
    "197": "Country of origin of goods",
    "248": "Empty container depot",
  },
  "EQD.type": {
    AE: "Auxiliary equipment",
    AF: "Aircraft ULD",
    AL: "Aircraft / liner equipment",
    BB: "Break bulk",
    CH: "Chassis",
    CN: "Container",
    FF: "Flat",
    GS: "General set",
    PL: "Platform",
    RG: "Reefer gen-set",
    RR: "Rail car",
    TE: "Trailer",
  },
  "EQD.supplier": {
    "1": "Shipper-supplied",
    "2": "Carrier-supplied",
    "3": "Lessor / pool-supplied",
    "4": "Buyer-supplied",
    "5": "Container operator-supplied",
  },
  "EQD.fullEmpty": {
    "4": "Full",
    "5": "Empty",
  },
  "STS.code": {
    "1": "Empty",
    "2": "Full / loaded",
    "3": "Damaged",
    "4": "On-hire",
    "5": "Off-hire",
    "6": "In-service",
    "7": "Out of service",
    "8": "Available",
    "9": "Hold",
    "10": "Released",
    "11": "Customs hold",
    "14": "Inspection",
    "16": "Repair required",
    "17": "Cleaning required",
    AAJ: "Inland transit equipment",
    AAW: "Gate-in inspection done",
    AE: "Equipment movement reported",
    AKO: "Active reefer (plugged in)",
    AKD: "Reefer unplugged",
    LDD: "Loaded onto vessel",
    UNL: "Unloaded from vessel",
    RST: "Restow",
    SHF: "Shifting",
    OK: "Acceptable for next use",
    TARE: "Tare weight verified",
  },
  // STS.qualifier (DE 3215) — type of status, the first element on
  // IFTSTA STS segments. Specifies WHICH thing the status applies to.
  "STS.qualifier": {
    "1": "Equipment / container status",
    "2": "Consignment status",
    "3": "Goods item status",
    "4": "Transport status",
    "5": "Status at requested place",
    "6": "Status reported by message sender",
  },
  // STS.detail (DE 4405) — what physically happened. The heart of
  // IFTSTA. Covers booking through delivery + holds.
  "STS.detail": {
    "1": "Booking received",
    "2": "Booking confirmed",
    "3": "Empty container released from depot",
    "5": "Equipment positioned at stuffing location",
    "6": "Stuffing completed",
    "11": "Goods received from shipper",
    "14": "Gate-in at origin terminal (full export)",
    "22": "Loaded onto vessel",
    "23": "Vessel departed POL",
    "24": "Transhipment loaded",
    "25": "Transhipment discharged",
    "27": "Vessel arrived POD",
    "28": "Discharged from vessel",
    "29": "Gate-out at destination terminal (full import)",
    "32": "Empty container returned to depot",
    "35": "Container delivered to consignee",
    "40": "Customs cleared",
    "89": "Bill of lading released",
    "144": "Container hold placed",
    "192": "Estimated time of arrival reported",
    "198": "Estimated time of departure reported",
    "201": "Damage reported",
  },
  // STS.reason (DE 9013) — why a status was set, especially for
  // holds and exceptions.
  "STS.reason": {
    "1": "Awaiting documents",
    "2": "Awaiting payment",
    "3": "Customs hold",
    "4": "Port authority hold",
    "5": "Damage to equipment",
    "6": "Damage to cargo",
    "7": "Equipment unavailable",
    "8": "Vessel delay",
    "9": "Weather delay",
    "10": "Strike / labour action",
    "11": "Equipment off-hire",
    "12": "Reefer plug failure",
    "13": "Refused by consignee",
    "14": "Awaiting customs inspection",
    "15": "Quarantine hold",
    "16": "Mis-routed / mis-loaded",
    "17": "VGM missing",
    "18": "Restow required",
    ZZZ: "Mutually defined",
  },
  // CNI.qualifier — consignment reference qualifier on IFTSTA
  // CNI segments. Reuses RFF qualifier semantics in practice.
  "CNI.qualifier": {
    BM: "Bill of lading number",
    BN: "Booking reference number",
    HB: "House bill of lading",
    MB: "Master bill of lading",
    XX: "Mutually defined reference",
  },
  "RFF.qualifier": {
    AAY: "Release order number",
    ABO: "Transhipment number",
    ABT: "Internal customer number",
    ACW: "Reference assigned by trade agent (e.g., survey no.)",
    BN: "Booking reference number",
    BM: "Bill of lading number",
    CN: "Carrier reference number",
    EQ: "Equipment number",
    FF: "Freight forwarder reference",
    GN: "Government reference",
    HB: "House bill of lading",
    MB: "Master bill of lading",
    ON: "Order number",
    RE: "Release number",
    SI: "Shipper reference",
    VON: "Voyage number",
    XX: "Mutually defined reference",
    ZZZ: "Mutually defined (alt)",
  },
  "NAD.party": {
    AG: "Agent (carrier local agent)",
    BO: "Bill of lading recipient",
    CA: "Carrier (NVOCC, line, road, rail)",
    CC: "Claimant",
    CF: "Container operator (line owning the box)",
    CN: "Consignee",
    CZ: "Consignor (shipper)",
    FW: "Freight forwarder",
    MR: "Message recipient",
    MS: "Document / message issuer / sender",
    OS: "Original shipper",
    SLS: "Shipping line service",
    TCO: "Transit customs office",
    TR: "Terminal operator",
  },
  "MEA.qualifier": {
    AAE: "Gross weight",
    AAL: "Tare weight",
    AAJ: "Maximum payload",
    AET: "Equipment gross weight",
    G: "Gross weight",
    T: "Tare weight",
    LP: "Payload",
    VGM: "Verified Gross Mass (SOLAS VI/2 §4-6)",
    LDM: "Loading metres",
    AAW: "Cargo volume",
  },
  "MEA.unit": {
    KGM: "kilograms",
    LBR: "pounds",
    TNE: "metric tonnes",
    MTQ: "cubic metres",
    MTR: "metres",
    FTI: "feet",
    CMT: "centimetres",
    CEL: "°C",
    FAH: "°F",
  },
  "VGM.method": {
    SM1: "Method 1 — physical weighing",
    SM2: "Method 2 — calculated (sum of package + tare)",
  },
  "HAN.code": {
    HBB: "Handle by both ends",
    HBC: "Handle with care",
    HKP: "Keep upright",
    HKD: "Keep dry",
    HKC: "Keep cool",
    HFR: "Fragile",
    HRD: "Reefer — pre-cool",
    HSL: "Shock load — handle carefully",
    HRR: "Rapid response required",
    HXR: "Refrigerate / freeze",
    EXP: "Export-loaded",
    IMP: "Import-loaded",
    RES: "Restow",
    SHF: "Shifting",
    TRH: "Transhipment",
  },
  "SEL.party": {
    CA: "Carrier",
    SH: "Shipper",
    TR: "Terminal",
    CU: "Customs",
  },
  "FTX.qualifier": {
    AAA: "General information",
    AAI: "Cargo description",
    ABS: "Equipment condition",
    DAR: "Damage remarks",
    HAN: "Handling instruction text",
    OSI: "Other service information",
    REG: "Regulatory information",
  },
  "TDT.mode": {
    "1": "Maritime",
    "2": "Rail",
    "3": "Road",
    "4": "Air",
    "8": "Inland waterway",
    "9": "Not applicable",
  },
  "TDT.idCodeList": {
    "87": "UN/EDIFACT party code",
    "103": "Vessel call sign",
    "146": "IMO ship number",
    "172": "Carrier SCAC code",
  },
  "CNT.qualifier": {
    "7": "Total TEU",
    "16": "Number of equipment units",
    "11": "Number of line items",
  },
  "UNB.syntax": {
    UNOA: "Level A (uppercase, digits, punctuation, delimiters)",
    UNOB: "Level B (adds lowercase)",
    UNOC: "Level C (ISO 8859-1 Latin-1)",
    UNOY: "UTF-8",
  },
};

/**
 * Decode a 4-character ISO 6346 size-type code into operator-readable
 * parts: size, type group, height/variant, variant digit.
 *
 * Returns `null` if the input doesn't look like a valid size-type code.
 *
 * @example
 * ```ts
 * decodeISOSizeType("45R1"); // "40ft · Integral reefer · 9ft 6in (high cube) · variant 1"
 * decodeISOSizeType("22G1"); // "20ft · General purpose · 8ft 6in (standard) · variant 1"
 * ```
 */
export function decodeISOSizeType(code: string): string | null {
  if (!/^[A-Z0-9]{4}$/.test(code)) return null;
  const sizeMap: Record<string, string> = {
    "1": "10ft",
    "2": "20ft",
    "3": "30ft",
    "4": "40ft",
    L: "45ft",
    M: "48ft",
    N: "49ft",
  };
  const heightMap: Record<string, string> = {
    "0": "8ft",
    "2": "8ft 6in (standard)",
    "3": "8ft 6in",
    "4": "9ft",
    "5": "9ft 6in (high cube)",
    "6": ">9ft 6in",
    "8": "4ft 3in",
    "9": "9ft 6in high cube",
  };
  const typeGroupMap: Record<string, string> = {
    G: "General purpose",
    V: "Ventilated",
    B: "Bulk",
    R: "Integral reefer",
    H: "Refrigerated/heated",
    U: "Open top",
    P: "Platform / flat rack",
    T: "Tank",
    A: "Air/surface",
    F: "Folding",
    S: "Named cargo (livestock/auto)",
  };
  const size = sizeMap[code[0]];
  const height = heightMap[code[1]];
  const type = typeGroupMap[code[2]];
  if (!size || !type) return null;
  return `${size} · ${type} · ${height || code[1]} · variant ${code[3]}`;
}

// ── Message schemas ───────────────────────────────────────────
export const CODECO: MessageSchema = {
  name: "CODECO",
  longName: "Container Gate-In / Gate-Out Report",
  purpose:
    "Terminal/depot → carrier. Confirms physical equipment moves through a gate or status changes inside a facility. The terminal's response to a COPRAR plan, and the depot's daily heartbeat to the carrier and lessor.",
  bgmCodes: ["34", "35", "36"],
  headerRequired: ["UNH", "BGM", "DTM"],
  bodyRequired: ["TDT", "NAD", "EQD"],
  trailerRequired: ["CNT", "UNT"],
};

export const COPRAR: MessageSchema = {
  name: "COPRAR",
  longName: "Container Discharge / Loading Order",
  purpose:
    "Carrier → terminal. The load (BGM 45) or discharge (BGM 46) order for a specific vessel call. The basis on which the terminal pre-receives boxes and the planner builds the stow.",
  bgmCodes: ["45", "46", "244", "245"],
  headerRequired: ["UNH", "BGM", "DTM"],
  bodyRequired: ["TDT", "NAD", "EQD"],
  trailerRequired: ["CNT", "UNT"],
};

export const IFTSTA: MessageSchema = {
  name: "IFTSTA",
  longName: "International Multimodal Status Report",
  purpose:
    "Carrier / terminal / depot → cargo owner. Asynchronous push of 'what happened, where, when, why' for one or more containers. Always reports an event that has occurred — gate-in, loaded, discharged, gate-out, delivered, hold, ETA/ETD revision. One IFTSTA can carry many consignments (CNI) and many status events (SG5) per container.",
  bgmCodes: ["23"],
  headerRequired: ["UNH", "BGM", "DTM"],
  bodyRequired: ["NAD", "CNI", "STS"],
  trailerRequired: ["UNT"],
};

export const COREOR: MessageSchema = {
  name: "COREOR",
  longName: "Container Release Order",
  purpose:
    "Carrier → terminal / depot. Authorises a third party (consignee, trucker, agent) to collect a container. Import: full release once B/L surrendered + freight paid + customs cleared. Export-empty: empty release from depot to shipper. One release reference (RFF+AAY) per message; up to 999 containers can share the release.",
  bgmCodes: ["12", "350"],
  headerRequired: ["UNH", "BGM", "DTM"],
  bodyRequired: ["RFF", "TDT", "NAD", "EQD"],
  trailerRequired: ["UNT"],
};

/**
 * Detect whether the parsed message is CODECO, COPRAR, or unknown.
 * Inspects UNH.type first, then falls back to BGM document code.
 */
export function detectMessageType(parsed: ParsedMessage): MessageType {
  if (parsed.message && parsed.message.type) {
    const t = parsed.message.type.toUpperCase();
    if (t === "CODECO" || t === "COPRAR" || t === "IFTSTA" || t === "COREOR") return t;
  }
  for (const s of parsed.segments) {
    if (s.tag === "BGM") {
      const doc = (s.elements[0] || [])[0];
      if (doc === "34" || doc === "35" || doc === "36") return "CODECO";
      if (doc === "45" || doc === "46" || doc === "244" || doc === "245") return "COPRAR";
      if (doc === "23") return "IFTSTA";
      if (doc === "12" || doc === "350") return "COREOR";
    }
  }
  return null;
}

/** Look up a code in a named list. Returns null if the list or code is unknown. */
export function lookup(listName: string, code: string): string | null {
  const list = CODE_LISTS[listName];
  if (!list) return null;
  return list[code] || null;
}

/** Get the segment dictionary entry for a 3-letter tag. */
export function segmentInfo(tag: string): SegmentInfo {
  return (
    SEGMENTS[tag] || { name: tag, brief: "Unknown segment — not in CODECO/COPRAR dictionary." }
  );
}

// ── Diagnostic engine ─────────────────────────────────────────
/**
 * Run all single-message diagnostic rules against a parsed CODECO
 * or COPRAR. Returns an array of diagnostics (empty = clean message).
 *
 * Rules implemented:
 *   - BAD_CHECK_DIGIT      · ISO 6346 mod-11 fails on any EQD container number
 *   - BAD_BIC_FORMAT       · EQD container ID not in 4-letter + 7-digit shape
 *   - BAD_LOCODE_FORMAT    · LOC place doesn't match 5-char UN/LOCODE pattern
 *   - DTM_FORMAT           · DTM format not 203 (SMDG mandates 203)
 *   - MISSING_NAD_CF       · Required container operator party absent
 *   - EMPTY_BUT_HEAVY      · EQD declared empty but gross weight exceeds tare
 *   - UNKNOWN_SIZETYPE     · ISO 4-character size-type not in catalogue
 *   - UNT_COUNT_WRONG      · UNT segment count doesn't match actual UNH→UNT count
 *   - CNT_EQD_MISMATCH     · CNT+16 declared count != actual EQD count
 *   - REEFER_WITHOUT_TMP   · R-type ISO size but no TMP segment
 *   - LOAD_BUT_EMPTY       · COPRAR Load (BGM 45) but EQD declares empty
 *   - MISSING_VGM          · Full container on Load order missing SOLAS VGM
 *   - CHARSET_LOWERCASE    · UNB declares UNOA but body contains lowercase
 */
export function diagnoseSingle(parsed: ParsedMessage): Diagnostic[] {
  const diags: Diagnostic[] = [];
  const type = detectMessageType(parsed);
  const segments = parsed.segments;

  if (segments.length === 0) {
    return [
      {
        level: "error",
        code: "EMPTY",
        message: "No segments found. Paste a CODECO or COPRAR message.",
      },
    ];
  }

  // 1. Bad container check digit
  segments.forEach((s, i) => {
    if (s.tag !== "EQD") return;
    const num = (s.elements[1] || [])[0];
    if (num && /^[A-Z]{4}\d{7}$/.test(num)) {
      if (!validateCheckDigit(num)) {
        diags.push({
          level: "error",
          code: "BAD_CHECK_DIGIT",
          message: `Container number ${num} fails ISO 6346 check-digit validation.`,
          segmentIndex: i,
          tag: "EQD",
        });
      }
    } else if (num) {
      diags.push({
        level: "warn",
        code: "BAD_BIC_FORMAT",
        message: `Equipment ID ${num} is not in valid ISO 6346 format (4 letters + 7 digits).`,
        segmentIndex: i,
        tag: "EQD",
      });
    }
  });

  // 2. UN/LOCODE format
  segments.forEach((s, i) => {
    if (s.tag !== "LOC") return;
    const place = (s.elements[1] || [])[0];
    if (place && !/^[A-Z]{2}[A-Z0-9]{3}$/.test(place)) {
      diags.push({
        level: "warn",
        code: "BAD_LOCODE_FORMAT",
        message: `Location ${place} does not match the 5-character UN/LOCODE shape (2-letter country + 3-char place).`,
        segmentIndex: i,
        tag: "LOC",
      });
    }
  });

  // 3. DTM format (SMDG mandates 203)
  segments.forEach((s, i) => {
    if (s.tag !== "DTM") return;
    const fmt = (s.elements[0] || [])[2];
    if (fmt && fmt !== "203") {
      diags.push({
        level: fmt === "204" ? "info" : "warn",
        code: "DTM_FORMAT",
        message: `DTM format ${fmt} used — SMDG mandates 203 (CCYYMMDDHHMM).`,
        segmentIndex: i,
        tag: "DTM",
      });
    }
  });

  // 4. NAD+CF required
  const hasCF = segments.some((s) => s.tag === "NAD" && (s.elements[0] || [])[0] === "CF");
  if (!hasCF) {
    diags.push({
      level: "error",
      code: "MISSING_NAD_CF",
      message: "No NAD+CF (container operator) segment. SMDG requires it at message level.",
    });
  }

  // 5. Empty but heavy
  // EQD element positions: 0=type, 1=container, 2=size-type, 3=condition,
  // 4=supplier, 5=full/empty (DE 8169), 6=status.
  segments.forEach((s, i) => {
    if (s.tag !== "EQD") return;
    const fullEmpty = (s.elements[5] || [])[0];
    if (fullEmpty !== "5") return;
    // MEA structure: elements[0] = purpose (DE 6311 — AAE, AAL, VGM, ...),
    // elements[1] = value qualifier composite (DE 6313 — often G, T, AET),
    // elements[2] = value composite (DE 6411 unit + DE 6314 value).
    let aae: number | null = null;
    let aal: number | null = null;
    for (let j = i + 1; j < segments.length; j++) {
      if (segments[j].tag === "EQD") break;
      if (segments[j].tag === "MEA") {
        const q = (segments[j].elements[0] || [])[0];
        const v = parseFloat((segments[j].elements[2] || [])[1]);
        if (q === "AAE" && !isNaN(v)) aae = v;
        if (q === "AAL" && !isNaN(v)) aal = v;
      }
    }
    if (aae !== null && (aal === null || aae > aal + 100)) {
      diags.push({
        level: "error",
        code: "EMPTY_BUT_HEAVY",
        message: `EQD declared EMPTY but gross weight ${aae} kg exceeds tare ${aal ?? "?"} kg.`,
        segmentIndex: i,
        tag: "EQD",
      });
    }
  });

  // 6. Unknown ISO size-type
  segments.forEach((s, i) => {
    if (s.tag !== "EQD") return;
    const sz = (s.elements[2] || [])[0];
    if (sz && decodeISOSizeType(sz) === null) {
      diags.push({
        level: "warn",
        code: "UNKNOWN_SIZETYPE",
        message: `ISO size-type ${sz} not in standard 4-character catalogue.`,
        segmentIndex: i,
        tag: "EQD",
      });
    }
  });

  // 7. UNT segment count
  let unhIdx = -1;
  let untIdx = -1;
  for (let k = 0; k < segments.length; k++) {
    if (segments[k].tag === "UNH" && unhIdx < 0) unhIdx = k;
    if (segments[k].tag === "UNT") untIdx = k;
  }
  if (unhIdx >= 0 && untIdx >= 0) {
    const declared = parseInt((segments[untIdx].elements[0] || [])[0], 10);
    const actual = untIdx - unhIdx + 1;
    if (!isNaN(declared) && declared !== actual) {
      diags.push({
        level: "error",
        code: "UNT_COUNT_WRONG",
        message: `UNT declares ${declared} segments but actual count is ${actual} (UNH to UNT inclusive).`,
        segmentIndex: untIdx,
        tag: "UNT",
      });
    }
  }

  // 8. CNT+16 vs EQD count
  const eqdCount = segments.filter((s) => s.tag === "EQD").length;
  segments.forEach((s, i) => {
    if (s.tag !== "CNT") return;
    const cq = (s.elements[0] || [])[0];
    const cv = parseInt((s.elements[0] || [])[1], 10);
    if (cq === "16" && !isNaN(cv) && cv !== eqdCount) {
      diags.push({
        level: "error",
        code: "CNT_EQD_MISMATCH",
        message: `CNT+16 declares ${cv} equipment units but ${eqdCount} EQD segments are present.`,
        segmentIndex: i,
        tag: "CNT",
      });
    }
  });

  // 9. Reefer without TMP
  segments.forEach((s, i) => {
    if (s.tag !== "EQD") return;
    const sz = (s.elements[2] || [])[0];
    if (!sz || sz[2] !== "R") return;
    let hasTmp = false;
    for (let j = i + 1; j < segments.length; j++) {
      if (segments[j].tag === "EQD") break;
      if (segments[j].tag === "TMP") {
        hasTmp = true;
        break;
      }
    }
    if (!hasTmp) {
      diags.push({
        level: "warn",
        code: "REEFER_WITHOUT_TMP",
        message: `Reefer container (size-type ${sz}) has no TMP setpoint segment.`,
        segmentIndex: i,
        tag: "EQD",
      });
    }
  });

  // 10. COPRAR Load (BGM 45) but EQD empty + missing VGM
  if (type === "COPRAR") {
    const bgm = segments.find((s) => s.tag === "BGM");
    const docCode = bgm ? (bgm.elements[0] || [])[0] : null;
    if (docCode === "45") {
      segments.forEach((s, i) => {
        if (s.tag === "EQD" && (s.elements[5] || [])[0] === "5") {
          diags.push({
            level: "warn",
            code: "LOAD_BUT_EMPTY",
            message:
              "COPRAR Load order (BGM 45) but EQD declares EMPTY — use COPRAR Discharge or COPARN for empty repositioning.",
            segmentIndex: i,
            tag: "EQD",
          });
        }
      });
      segments.forEach((s, i) => {
        if (s.tag !== "EQD") return;
        if ((s.elements[5] || [])[0] !== "4") return;
        let hasVgm = false;
        for (let j = i + 1; j < segments.length; j++) {
          if (segments[j].tag === "EQD") break;
          if (segments[j].tag === "MEA" && (segments[j].elements[0] || [])[0] === "VGM") {
            hasVgm = true;
            break;
          }
        }
        if (!hasVgm) {
          diags.push({
            level: "warn",
            code: "MISSING_VGM",
            message:
              "Full container on a COPRAR Load order is missing VGM (SOLAS VI/2 §4-6, mandatory since 2016).",
            segmentIndex: i,
            tag: "EQD",
          });
        }
      });
    }
  }

  // 11. UNB UNOA charset vs lowercase in body
  if (parsed.interchange && parsed.interchange.syntaxId === "UNOA") {
    const bodyText = segments.map((s) => s.raw).join("|");
    if (/[a-z]/.test(bodyText)) {
      diags.push({
        level: "warn",
        code: "CHARSET_LOWERCASE",
        message:
          "UNB declares UNOA (uppercase only) but lowercase letters appear in the body. Likely partner-side rejection.",
      });
    }
  }

  // ── IFTSTA-specific rules ────────────────────────────────────
  if (type === "IFTSTA") {
    // 12. Missing CNI segment — SMDG requires at least one consignment block
    const hasCNI = segments.some((s) => s.tag === "CNI");
    if (!hasCNI) {
      diags.push({
        level: "error",
        code: "MISSING_CNI",
        message: "IFTSTA has no CNI consignment segment. SMDG requires at least one.",
      });
    }

    // 13. STS without a DTM+334 (status timestamp) is unusable downstream
    let lastSeenSTSIndex = -1;
    segments.forEach((s, i) => {
      if (s.tag === "STS") {
        // Look ahead until next STS or end for a DTM with qualifier 334 or 7
        let hasTimestamp = false;
        for (let j = i + 1; j < segments.length; j++) {
          if (segments[j].tag === "STS") break;
          if (segments[j].tag === "DTM") {
            const q = (segments[j].elements[0] || [])[0];
            if (q === "334" || q === "7" || q === "178") {
              hasTimestamp = true;
              break;
            }
          }
        }
        if (!hasTimestamp) {
          diags.push({
            level: "error",
            code: "MISSING_STS_DTM",
            message:
              "STS status event has no DTM timestamp (qualifier 334 / 7 / 178). Status without a date is unusable to downstream systems.",
            segmentIndex: i,
            tag: "STS",
          });
        }
        lastSeenSTSIndex = i;
      }
    });

    // 14. STS_FUTURE_TIMESTAMP — DTM+334 more than 15 min ahead of now
    segments.forEach((s, i) => {
      if (s.tag !== "DTM") return;
      const q = (s.elements[0] || [])[0];
      if (q !== "334") return;
      const dtVal = (s.elements[0] || [])[1];
      const fmt = (s.elements[0] || [])[2];
      if (!dtVal || fmt !== "203" || dtVal.length !== 12) return;
      const yr = parseInt(dtVal.slice(0, 4), 10);
      const mo = parseInt(dtVal.slice(4, 6), 10) - 1;
      const day = parseInt(dtVal.slice(6, 8), 10);
      const hr = parseInt(dtVal.slice(8, 10), 10);
      const mn = parseInt(dtVal.slice(10, 12), 10);
      const eventTime = Date.UTC(yr, mo, day, hr, mn);
      const now = Date.now();
      if (eventTime - now > 15 * 60 * 1000) {
        diags.push({
          level: "warn",
          code: "STS_FUTURE_TIMESTAMP",
          message: `DTM+334 status timestamp ${dtVal} is more than 15 min in the future. Likely a clock or timezone error at the sending system.`,
          segmentIndex: i,
          tag: "DTM",
        });
      }
    });
  }

  // ── COREOR-specific rules ────────────────────────────────────
  if (type === "COREOR") {
    // 15. MISSING_AAY — every COREOR must carry exactly one release order ref
    const aayRefs = segments.filter((s) => s.tag === "RFF" && (s.elements[0] || [])[0] === "AAY");
    if (aayRefs.length === 0) {
      diags.push({
        level: "error",
        code: "MISSING_AAY",
        message:
          "COREOR has no RFF+AAY (release order number). A release without an order number is invalid.",
      });
    }
    // 16. MULTIPLE_AAY — SMDG rule: one release per message
    if (aayRefs.length > 1) {
      diags.push({
        level: "error",
        code: "MULTIPLE_AAY",
        message: `COREOR has ${aayRefs.length} RFF+AAY release-order references. SMDG profile: exactly one release per message.`,
      });
    }

    // 17. RELEASE_WITHOUT_ADDRESSEE — at least one CN or BO required
    const hasCN = segments.some((s) => s.tag === "NAD" && (s.elements[0] || [])[0] === "CN");
    const hasBO = segments.some((s) => s.tag === "NAD" && (s.elements[0] || [])[0] === "BO");
    if (!hasCN && !hasBO) {
      diags.push({
        level: "error",
        code: "RELEASE_WITHOUT_ADDRESSEE",
        message:
          "COREOR has no NAD+CN (consignee) or NAD+BO (B/L recipient). A release must name who is authorised to collect.",
      });
    }

    // 18. EXPIRED_RELEASE — DTM+36 (expiration) in the past
    segments.forEach((s, i) => {
      if (s.tag !== "DTM") return;
      const q = (s.elements[0] || [])[0];
      if (q !== "36") return;
      const dtVal = (s.elements[0] || [])[1];
      const fmt = (s.elements[0] || [])[2];
      if (!dtVal || fmt !== "203" || dtVal.length !== 12) return;
      const yr = parseInt(dtVal.slice(0, 4), 10);
      const mo = parseInt(dtVal.slice(4, 6), 10) - 1;
      const day = parseInt(dtVal.slice(6, 8), 10);
      const hr = parseInt(dtVal.slice(8, 10), 10);
      const mn = parseInt(dtVal.slice(10, 12), 10);
      const expiry = Date.UTC(yr, mo, day, hr, mn);
      if (expiry < Date.now()) {
        diags.push({
          level: "error",
          code: "EXPIRED_RELEASE",
          message: `COREOR release validity (DTM+36) ${dtVal} is in the past. Terminal will reject the gate-out attempt.`,
          segmentIndex: i,
          tag: "DTM",
        });
      }
    });

    // 19. EMPTY_ON_IMPORT_RELEASE — BGM 12 with EQD empty is suspicious
    const bgm = segments.find((s) => s.tag === "BGM");
    const docCode = bgm ? (bgm.elements[0] || [])[0] : null;
    if (docCode === "12") {
      segments.forEach((s, i) => {
        if (s.tag !== "EQD") return;
        if ((s.elements[5] || [])[0] === "5") {
          diags.push({
            level: "warn",
            code: "EMPTY_ON_IMPORT_RELEASE",
            message:
              "COREOR release order (BGM 12) but EQD declares EMPTY. Import release is typically for full containers; verify intent.",
            segmentIndex: i,
            tag: "EQD",
          });
        }
      });
    }

    // 20. MISSING_IMO — TDT names a vessel but no IMO number (code list 146)
    segments.forEach((s, i) => {
      if (s.tag !== "TDT") return;
      const vesselId = (s.elements[7] || [])[0];
      const vesselName = (s.elements[7] || [])[3];
      const idCodeList = (s.elements[7] || [])[2];
      if (vesselName && (!vesselId || idCodeList !== "146")) {
        diags.push({
          level: "warn",
          code: "MISSING_IMO",
          message: `TDT names vessel '${vesselName}' but lacks an IMO number (code list 146). SMDG strongly recommends including the IMO.`,
          segmentIndex: i,
          tag: "TDT",
        });
      }
    });
  }

  return diags;
}

// ── Reconcile (COPRAR ↔ CODECO) ────────────────────────────────
interface EqdRecord {
  number: string;
  sizeType: string;
  fullEmpty: string;
  pol: string;
  pod: string;
  grossKgm: number | null;
  tareKgm: number | null;
  vgmKgm: number | null;
  booking: string;
  bl: string;
  tempC: number | null;
}

function buildEqdMap(parsed: ParsedMessage): Record<string, EqdRecord> {
  const map: Record<string, EqdRecord> = {};
  let current: EqdRecord | null = null;
  for (const s of parsed.segments) {
    if (s.tag === "EQD") {
      const num = (s.elements[1] || [])[0];
      if (!num) {
        current = null;
        continue;
      }
      current = {
        number: num,
        sizeType: (s.elements[2] || [])[0] || "",
        fullEmpty: (s.elements[5] || [])[0] || "",
        pol: "",
        pod: "",
        grossKgm: null,
        tareKgm: null,
        vgmKgm: null,
        booking: "",
        bl: "",
        tempC: null,
      };
      map[num] = current;
    } else if (current) {
      if (s.tag === "LOC") {
        const lq = (s.elements[0] || [])[0];
        const lv = (s.elements[1] || [])[0];
        if (lq === "9" && lv) current.pol = lv;
        if (lq === "11" && lv) current.pod = lv;
      } else if (s.tag === "MEA") {
        const mq = (s.elements[0] || [])[0];
        const mv = parseFloat((s.elements[2] || [])[1]);
        if (!isNaN(mv)) {
          if (mq === "AAE") current.grossKgm = mv;
          if (mq === "AAL") current.tareKgm = mv;
          if (mq === "VGM") current.vgmKgm = mv;
        }
      } else if (s.tag === "RFF") {
        const rq = (s.elements[0] || [])[0];
        const rv = (s.elements[0] || [])[1];
        if (rq === "BN" && rv) current.booking = rv;
        if (rq === "BM" && rv) current.bl = rv;
      } else if (s.tag === "TMP") {
        const t = parseFloat((s.elements[1] || [])[0]);
        if (!isNaN(t)) current.tempC = t;
      }
    }
  }
  return map;
}

/**
 * Cross-message reconciliation between a COPRAR and its matching CODECO.
 * Returns container-by-container matches with field-level diffs and
 * unmatched-container lists.
 *
 * Tolerances:
 *   - Gross weight: ±2%
 *   - VGM: ±5%
 *   - Reefer temperature: ±1°C
 *
 * @example
 * ```ts
 * import { parse, reconcile } from "@prefixcheck/edi";
 * const coprar = parse(coprarText);
 * const codeco = parse(codecoText);
 * const report = reconcile(coprar, codeco);
 * console.log(`${report.matched.length} matched, ${report.inCoprarOnly.length} expected but not gated`);
 * ```
 */
export function reconcile(coprar: ParsedMessage, codeco: ParsedMessage): ReconcileReport {
  const coprarMap = buildEqdMap(coprar);
  const codecoMap = buildEqdMap(codeco);
  const allKeys = new Set<string>([...Object.keys(coprarMap), ...Object.keys(codecoMap)]);

  const matched: MatchedContainer[] = [];
  const inCoprarOnly: string[] = [];
  const inCodecoOnly: string[] = [];

  allKeys.forEach((num) => {
    const c = coprarMap[num];
    const d = codecoMap[num];
    if (c && d) {
      const diffs: ReconcileDiff[] = [];
      if (c.sizeType && d.sizeType && c.sizeType !== d.sizeType) {
        diffs.push({
          field: "ISO size-type",
          coprar: c.sizeType,
          codeco: d.sizeType,
          severity: "error",
        });
      }
      if (c.fullEmpty && d.fullEmpty && c.fullEmpty !== d.fullEmpty) {
        diffs.push({
          field: "Full/empty",
          coprar: c.fullEmpty,
          codeco: d.fullEmpty,
          severity: "error",
        });
      }
      if (c.pol && d.pol && c.pol !== d.pol) {
        diffs.push({ field: "POL", coprar: c.pol, codeco: d.pol, severity: "error" });
      }
      if (c.pod && d.pod && c.pod !== d.pod) {
        diffs.push({ field: "POD", coprar: c.pod, codeco: d.pod, severity: "error" });
      }
      if (c.booking && d.booking && c.booking !== d.booking) {
        diffs.push({ field: "Booking", coprar: c.booking, codeco: d.booking, severity: "warn" });
      }
      if (c.grossKgm !== null && d.grossKgm !== null) {
        const deltaPct = (Math.abs(c.grossKgm - d.grossKgm) / Math.max(c.grossKgm, 1)) * 100;
        if (deltaPct > 2) {
          diffs.push({
            field: "Gross weight",
            coprar: `${c.grossKgm} kg`,
            codeco: `${d.grossKgm} kg`,
            severity: "warn",
          });
        }
      }
      if (c.vgmKgm !== null && d.vgmKgm !== null) {
        const vDelta = (Math.abs(c.vgmKgm - d.vgmKgm) / Math.max(c.vgmKgm, 1)) * 100;
        if (vDelta > 5) {
          diffs.push({
            field: "VGM",
            coprar: `${c.vgmKgm} kg`,
            codeco: `${d.vgmKgm} kg`,
            severity: "warn",
          });
        }
      }
      if (c.tempC !== null && d.tempC !== null) {
        if (Math.abs(c.tempC - d.tempC) > 1) {
          diffs.push({
            field: "Reefer temp",
            coprar: `${c.tempC}°C`,
            codeco: `${d.tempC}°C`,
            severity: "warn",
          });
        }
      }
      matched.push({ number: num, diffs });
    } else if (c) {
      inCoprarOnly.push(num);
    } else {
      inCodecoOnly.push(num);
    }
  });

  return {
    coprarCount: Object.keys(coprarMap).length,
    codecoCount: Object.keys(codecoMap).length,
    matched,
    inCoprarOnly,
    inCodecoOnly,
    coprarType: detectMessageType(coprar),
    codecoType: detectMessageType(codeco),
  };
}
