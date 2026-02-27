export const OP_CLEAR = 1;
export const OP_FILL_RECT = 2;
export const OP_DRAW_TEXT = 3;
export const OP_PUSH_CLIP = 4;
export const OP_POP_CLIP = 5;
export const OP_DRAW_TEXT_RUN = 6;
export const OP_SET_CURSOR = 7;
export const OP_DRAW_CANVAS = 8;
export const OP_DRAW_IMAGE = 9;
export const OP_DEF_STRING = 10;
export const OP_FREE_STRING = 11;
export const OP_DEF_BLOB = 12;
export const OP_FREE_BLOB = 13;
export const OP_BLIT_RECT = 14;

export type DrawlistCommandHeader = Readonly<{
  opcode: number;
  size: number;
  offset: number;
  payloadOffset: number;
  payloadSize: number;
}>;

export type DrawTextCommand = Readonly<{
  x: number;
  y: number;
  stringId: number;
  byteOff: number;
  byteLen: number;
  text: string;
}>;

export type DrawTextRunCommand = Readonly<{
  x: number;
  y: number;
  blobId: number;
  blobBytes: Uint8Array | null;
}>;

type ResourceState = Readonly<{
  strings: ReadonlyMap<number, Uint8Array>;
  blobs: ReadonlyMap<number, Uint8Array>;
}>;

const HEADER_SIZE = 64;
const ZRDL_MAGIC = 0x4c44_525a;
const MIN_CMD_SIZE = 8;
const DECODER = new TextDecoder();

function u16(bytes: Uint8Array, off: number): number {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return dv.getUint16(off, true);
}

function i32(bytes: Uint8Array, off: number): number {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return dv.getInt32(off, true);
}

export function u32(bytes: Uint8Array, off: number): number {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return dv.getUint32(off, true);
}

function cloneBytes(bytes: Uint8Array): Uint8Array {
  return Uint8Array.from(bytes);
}

function readCommandBounds(bytes: Uint8Array): Readonly<{ cmdOffset: number; cmdEnd: number }> {
  if (bytes.byteLength < HEADER_SIZE) {
    throw new Error(`drawlist too small for header (len=${String(bytes.byteLength)})`);
  }

  const cmdOffset = u32(bytes, 16);
  const cmdBytes = u32(bytes, 20);
  const cmdEnd = cmdOffset + cmdBytes;
  if (cmdBytes === 0) return { cmdOffset, cmdEnd };
  if (cmdOffset < HEADER_SIZE || cmdOffset > bytes.byteLength) {
    throw new Error(
      `drawlist cmdOffset out of bounds (cmdOffset=${String(cmdOffset)}, len=${String(bytes.byteLength)})`,
    );
  }
  if (cmdEnd < cmdOffset || cmdEnd > bytes.byteLength) {
    throw new Error(
      `drawlist cmd range out of bounds (cmdOffset=${String(cmdOffset)}, cmdBytes=${String(cmdBytes)}, len=${String(bytes.byteLength)})`,
    );
  }
  return { cmdOffset, cmdEnd };
}

export function parseCommandHeaders(bytes: Uint8Array): readonly DrawlistCommandHeader[] {
  const { cmdOffset, cmdEnd } = readCommandBounds(bytes);
  const out: DrawlistCommandHeader[] = [];

  let off = cmdOffset;
  while (off < cmdEnd) {
    const opcode = u16(bytes, off);
    const size = u32(bytes, off + 4);
    if (size < MIN_CMD_SIZE) {
      throw new Error(`command size below minimum at offset ${String(off)} (size=${String(size)})`);
    }
    if ((size & 3) !== 0) {
      throw new Error(`command size not 4-byte aligned at offset ${String(off)} (size=${String(size)})`);
    }
    const next = off + size;
    if (next > cmdEnd) {
      throw new Error(
        `command overruns cmd section at offset ${String(off)} (size=${String(size)}, cmdEnd=${String(cmdEnd)})`,
      );
    }
    out.push({
      opcode,
      size,
      offset: off,
      payloadOffset: off + MIN_CMD_SIZE,
      payloadSize: size - MIN_CMD_SIZE,
    });
    off = next;
  }

  if (off !== cmdEnd) {
    throw new Error(
      `command parse did not end exactly at cmdEnd (off=${String(off)}, cmdEnd=${String(cmdEnd)})`,
    );
  }

  return Object.freeze(out);
}

function parseResourceState(bytes: Uint8Array): ResourceState {
  const headers = parseCommandHeaders(bytes);
  const strings = new Map<number, Uint8Array>();
  const blobs = new Map<number, Uint8Array>();

  for (const cmd of headers) {
    switch (cmd.opcode) {
      case OP_DEF_STRING: {
        if (cmd.size < 16) {
          throw new Error(`DEF_STRING too small at offset ${String(cmd.offset)} size=${String(cmd.size)}`);
        }
        const id = u32(bytes, cmd.offset + 8);
        const byteLen = u32(bytes, cmd.offset + 12);
        const dataStart = cmd.offset + 16;
        const dataEnd = dataStart + byteLen;
        if (dataEnd > cmd.offset + cmd.size) {
          throw new Error(
            `DEF_STRING payload overflow at offset ${String(cmd.offset)} (len=${String(byteLen)}, size=${String(cmd.size)})`,
          );
        }
        strings.set(id, cloneBytes(bytes.subarray(dataStart, dataEnd)));
        break;
      }
      case OP_FREE_STRING: {
        if (cmd.size !== 12) {
          throw new Error(`FREE_STRING wrong size at offset ${String(cmd.offset)} size=${String(cmd.size)}`);
        }
        strings.delete(u32(bytes, cmd.offset + 8));
        break;
      }
      case OP_DEF_BLOB: {
        if (cmd.size < 16) {
          throw new Error(`DEF_BLOB too small at offset ${String(cmd.offset)} size=${String(cmd.size)}`);
        }
        const id = u32(bytes, cmd.offset + 8);
        const byteLen = u32(bytes, cmd.offset + 12);
        const dataStart = cmd.offset + 16;
        const dataEnd = dataStart + byteLen;
        if (dataEnd > cmd.offset + cmd.size) {
          throw new Error(
            `DEF_BLOB payload overflow at offset ${String(cmd.offset)} (len=${String(byteLen)}, size=${String(cmd.size)})`,
          );
        }
        blobs.set(id, cloneBytes(bytes.subarray(dataStart, dataEnd)));
        break;
      }
      case OP_FREE_BLOB: {
        if (cmd.size !== 12) {
          throw new Error(`FREE_BLOB wrong size at offset ${String(cmd.offset)} size=${String(cmd.size)}`);
        }
        blobs.delete(u32(bytes, cmd.offset + 8));
        break;
      }
      default:
        break;
    }
  }

  return Object.freeze({
    strings: strings as ReadonlyMap<number, Uint8Array>,
    blobs: blobs as ReadonlyMap<number, Uint8Array>,
  });
}

function parseInternedStringsSingle(bytes: Uint8Array): readonly string[] {
  const resources = parseResourceState(bytes);
  const ids = [...resources.strings.keys()].sort((a, b) => a - b);
  const out: string[] = [];
  for (const id of ids) {
    const strBytes = resources.strings.get(id);
    if (!strBytes) continue;
    out.push(DECODER.decode(strBytes));
  }
  return Object.freeze(out);
}

export function parseInternedStrings(bytes: Uint8Array): readonly string[] {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < HEADER_SIZE) {
    return Object.freeze([]);
  }

  const merged: string[] = [];
  let off = 0;
  let parsedAny = false;
  while (off + HEADER_SIZE <= bytes.byteLength) {
    const magic = u32(bytes, off + 0);
    const headerSize = u32(bytes, off + 8);
    const totalSize = u32(bytes, off + 12);
    if (
      magic !== ZRDL_MAGIC ||
      headerSize !== HEADER_SIZE ||
      totalSize < HEADER_SIZE ||
      (totalSize & 3) !== 0 ||
      off + totalSize > bytes.byteLength
    ) {
      break;
    }

    parsedAny = true;
    try {
      const list = parseInternedStringsSingle(bytes.subarray(off, off + totalSize));
      merged.push(...list);
    } catch {
      return Object.freeze([]);
    }
    off += totalSize;
  }

  if (parsedAny && off === bytes.byteLength) {
    return Object.freeze(merged);
  }

  try {
    return parseInternedStringsSingle(bytes);
  } catch {
    return Object.freeze([]);
  }
}

export function parseBlobById(bytes: Uint8Array, blobId: number): Uint8Array | null {
  const resources = parseResourceState(bytes);
  const blob = resources.blobs.get(blobId);
  if (!blob) return null;
  return cloneBytes(blob);
}

export function parseDrawTextCommands(bytes: Uint8Array): readonly DrawTextCommand[] {
  const headers = parseCommandHeaders(bytes);
  const strings = new Map<number, Uint8Array>();
  const out: DrawTextCommand[] = [];

  for (const cmd of headers) {
    switch (cmd.opcode) {
      case OP_DEF_STRING: {
        const id = u32(bytes, cmd.offset + 8);
        const byteLen = u32(bytes, cmd.offset + 12);
        const dataStart = cmd.offset + 16;
        const dataEnd = dataStart + byteLen;
        strings.set(id, cloneBytes(bytes.subarray(dataStart, dataEnd)));
        break;
      }
      case OP_FREE_STRING: {
        const id = u32(bytes, cmd.offset + 8);
        strings.delete(id);
        break;
      }
      case OP_DRAW_TEXT: {
        if (cmd.size < 28) break;
        const stringId = u32(bytes, cmd.offset + 16);
        const byteOff = u32(bytes, cmd.offset + 20);
        const byteLen = u32(bytes, cmd.offset + 24);
        const str = strings.get(stringId);
        let text = "";
        if (str) {
          const end = byteOff + byteLen;
          if (end <= str.byteLength) {
            text = DECODER.decode(str.subarray(byteOff, end));
          }
        }
        out.push(
          Object.freeze({
            x: i32(bytes, cmd.offset + 8),
            y: i32(bytes, cmd.offset + 12),
            stringId,
            byteOff,
            byteLen,
            text,
          }),
        );
        break;
      }
      default:
        break;
    }
  }

  return Object.freeze(out);
}

export function parseDrawTextRunCommands(bytes: Uint8Array): readonly DrawTextRunCommand[] {
  const headers = parseCommandHeaders(bytes);
  const blobs = new Map<number, Uint8Array>();
  const out: DrawTextRunCommand[] = [];

  for (const cmd of headers) {
    switch (cmd.opcode) {
      case OP_DEF_BLOB: {
        const id = u32(bytes, cmd.offset + 8);
        const byteLen = u32(bytes, cmd.offset + 12);
        const dataStart = cmd.offset + 16;
        const dataEnd = dataStart + byteLen;
        blobs.set(id, cloneBytes(bytes.subarray(dataStart, dataEnd)));
        break;
      }
      case OP_FREE_BLOB: {
        blobs.delete(u32(bytes, cmd.offset + 8));
        break;
      }
      case OP_DRAW_TEXT_RUN: {
        if (cmd.size < 24) break;
        const blobId = u32(bytes, cmd.offset + 16);
        const blobBytes = blobs.get(blobId) ?? null;
        out.push(
          Object.freeze({
            x: i32(bytes, cmd.offset + 8),
            y: i32(bytes, cmd.offset + 12),
            blobId,
            blobBytes: blobBytes ? cloneBytes(blobBytes) : null,
          }),
        );
        break;
      }
      default:
        break;
    }
  }

  return Object.freeze(out);
}
