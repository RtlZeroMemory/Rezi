/**
 * Source of truth for ZRDL command payload layouts used by drawlist v3/v4/v5.
 *
 * Offsets are absolute byte offsets from command start (including 8-byte header).
 * The 8-byte command header itself is implicit and emitted by codegen.
 */

export const COMMAND_HEADER_SIZE = 8;

export const STYLE_FIELDS = [
  "fg",
  "bg",
  "attrs",
  "reserved",
  "underlineRgb",
  "linkUriRef",
  "linkIdRef",
] as const;

export type DrawlistFieldType = "u8" | "i8" | "u16" | "u32" | "i32" | "style";

export type DrawlistFieldSpec = Readonly<{
  name: string;
  type: DrawlistFieldType;
  offset: number;
}>;

export type DrawlistCommandSpec = Readonly<{
  name:
    | "CLEAR"
    | "FILL_RECT"
    | "DRAW_TEXT"
    | "PUSH_CLIP"
    | "POP_CLIP"
    | "DRAW_TEXT_RUN"
    | "SET_CURSOR"
    | "DRAW_CANVAS"
    | "DRAW_IMAGE";
  writerName: string;
  opcode: number;
  totalSize: number;
  fields: readonly DrawlistFieldSpec[];
}>;

const COMMANDS = [
  {
    name: "CLEAR",
    writerName: "writeClear",
    opcode: 1,
    totalSize: 8,
    fields: [],
  },
  {
    name: "FILL_RECT",
    writerName: "writeFillRect",
    opcode: 2,
    totalSize: 52,
    fields: [
      { name: "x", type: "i32", offset: 8 },
      { name: "y", type: "i32", offset: 12 },
      { name: "w", type: "i32", offset: 16 },
      { name: "h", type: "i32", offset: 20 },
      { name: "style", type: "style", offset: 24 },
    ],
  },
  {
    name: "DRAW_TEXT",
    writerName: "writeDrawText",
    opcode: 3,
    totalSize: 60,
    fields: [
      { name: "x", type: "i32", offset: 8 },
      { name: "y", type: "i32", offset: 12 },
      { name: "stringIndex", type: "u32", offset: 16 },
      { name: "byteOff", type: "u32", offset: 20 },
      { name: "byteLen", type: "u32", offset: 24 },
      { name: "style", type: "style", offset: 28 },
      { name: "reserved0", type: "u32", offset: 56 },
    ],
  },
  {
    name: "PUSH_CLIP",
    writerName: "writePushClip",
    opcode: 4,
    totalSize: 24,
    fields: [
      { name: "x", type: "i32", offset: 8 },
      { name: "y", type: "i32", offset: 12 },
      { name: "w", type: "i32", offset: 16 },
      { name: "h", type: "i32", offset: 20 },
    ],
  },
  {
    name: "POP_CLIP",
    writerName: "writePopClip",
    opcode: 5,
    totalSize: 8,
    fields: [],
  },
  {
    name: "DRAW_TEXT_RUN",
    writerName: "writeDrawTextRun",
    opcode: 6,
    totalSize: 24,
    fields: [
      { name: "x", type: "i32", offset: 8 },
      { name: "y", type: "i32", offset: 12 },
      { name: "blobIndex", type: "u32", offset: 16 },
      { name: "reserved0", type: "u32", offset: 20 },
    ],
  },
  {
    name: "SET_CURSOR",
    writerName: "writeSetCursor",
    opcode: 7,
    totalSize: 20,
    fields: [
      { name: "x", type: "i32", offset: 8 },
      { name: "y", type: "i32", offset: 12 },
      { name: "shape", type: "u8", offset: 16 },
      { name: "visible", type: "u8", offset: 17 },
      { name: "blink", type: "u8", offset: 18 },
      { name: "reserved0", type: "u8", offset: 19 },
    ],
  },
  {
    name: "DRAW_CANVAS",
    writerName: "writeDrawCanvas",
    opcode: 8,
    totalSize: 32,
    fields: [
      { name: "x", type: "u16", offset: 8 },
      { name: "y", type: "u16", offset: 10 },
      { name: "w", type: "u16", offset: 12 },
      { name: "h", type: "u16", offset: 14 },
      { name: "pxWidth", type: "u16", offset: 16 },
      { name: "pxHeight", type: "u16", offset: 18 },
      { name: "blobOff", type: "u32", offset: 20 },
      { name: "blobLen", type: "u32", offset: 24 },
      { name: "blitterCode", type: "u8", offset: 28 },
      { name: "reserved0", type: "u8", offset: 29 },
      { name: "reserved1", type: "u16", offset: 30 },
    ],
  },
  {
    name: "DRAW_IMAGE",
    writerName: "writeDrawImage",
    opcode: 9,
    totalSize: 40,
    fields: [
      { name: "x", type: "u16", offset: 8 },
      { name: "y", type: "u16", offset: 10 },
      { name: "w", type: "u16", offset: 12 },
      { name: "h", type: "u16", offset: 14 },
      { name: "pxWidth", type: "u16", offset: 16 },
      { name: "pxHeight", type: "u16", offset: 18 },
      { name: "blobOff", type: "u32", offset: 20 },
      { name: "blobLen", type: "u32", offset: 24 },
      { name: "imageId", type: "u32", offset: 28 },
      { name: "formatCode", type: "u8", offset: 32 },
      { name: "protocolCode", type: "u8", offset: 33 },
      { name: "zLayer", type: "i8", offset: 34 },
      { name: "fitCode", type: "u8", offset: 35 },
      { name: "reserved0", type: "u8", offset: 36 },
      { name: "reserved1", type: "u8", offset: 37 },
      { name: "reserved2", type: "u16", offset: 38 },
    ],
  },
] as const satisfies readonly DrawlistCommandSpec[];

export const DRAWLIST_COMMAND_SPECS = Object.freeze(COMMANDS);
