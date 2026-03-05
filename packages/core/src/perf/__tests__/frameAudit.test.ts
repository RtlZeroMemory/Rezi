import { assert, describe, test } from "@rezi-ui/testkit";
import { drawlistFingerprint } from "../frameAudit.js";

function createDrawlistBytesWithTwoCommands(): Uint8Array {
  const bytes = new Uint8Array(48);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  view.setUint32(12, 48, true); // total size
  view.setUint32(16, 32, true); // command section offset
  view.setUint32(20, 16, true); // command section bytes
  view.setUint32(24, 2, true); // command count

  // Command 1
  view.setUint16(32, 7, true); // opcode
  view.setUint16(34, 0, true); // flags/reserved
  view.setUint32(36, 8, true); // size

  // Command 2
  view.setUint16(40, 9, true); // opcode
  view.setUint16(42, 0, true); // flags/reserved
  view.setUint32(44, 8, true); // size

  return bytes;
}

describe("frame audit", () => {
  test("drawlistFingerprint decodes histogram for a valid command stream", () => {
    const fingerprint = drawlistFingerprint(createDrawlistBytesWithTwoCommands());

    assert.equal(fingerprint.byteLen, 48);
    assert.equal(fingerprint.cmdCount, 2);
    assert.equal(fingerprint.totalSize, 48);
    assert.equal(fingerprint.cmdStreamValid, true);
    assert.equal(fingerprint.opcodeHistogram["7"], 1);
    assert.equal(fingerprint.opcodeHistogram["9"], 1);
    assert.equal(fingerprint.hash32.startsWith("0x"), true);
    assert.equal(fingerprint.prefixHash32.startsWith("0x"), true);
  });

  test("drawlistFingerprint marks malformed command streams as invalid", () => {
    const malformed = new Uint8Array(32);
    const view = new DataView(malformed.buffer, malformed.byteOffset, malformed.byteLength);
    view.setUint32(12, 32, true);
    view.setUint32(16, 24, true);
    view.setUint32(20, 16, true); // runs past available bytes
    view.setUint32(24, 1, true);

    const fingerprint = drawlistFingerprint(malformed);
    assert.equal(fingerprint.cmdStreamValid, false);
  });
});
