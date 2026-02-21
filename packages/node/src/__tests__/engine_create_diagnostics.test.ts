import assert from "node:assert/strict";
import test from "node:test";
import { buildEngineCreateFailureDetail } from "../backend/engineCreateDiagnostics.js";

test("engineCreate diagnostics: unsupported includes actionable ABI mismatch guidance", () => {
  let destroyedEngineId = 0;
  const detail = buildEngineCreateFailureDetail(
    -4,
    {
      requestedEngineAbiMajor: 1,
      requestedEngineAbiMinor: 2,
      requestedEngineAbiPatch: 0,
      requestedDrawlistVersion: 5,
      requestedEventBatchVersion: 1,
    },
    {
      nativeModuleHint: "@rezi-ui/native",
      probeFns: {
        probe: (cfg) => {
          const abiMajor = cfg["requestedEngineAbiMajor"];
          const abiMinor = cfg["requestedEngineAbiMinor"];
          const abiPatch = cfg["requestedEngineAbiPatch"];
          const drawlistVersion = cfg["requestedDrawlistVersion"];
          if (abiMajor === 1 && abiMinor === 1 && abiPatch === 0 && drawlistVersion === 2) {
            return 7;
          }
          return -4;
        },
        destroy: (engineId) => {
          destroyedEngineId = engineId;
        },
      },
    },
  );

  assert.match(detail, /engine_create failed: code=-4 \(ZR_ERR_UNSUPPORTED\)\./);
  assert.match(detail, /Requested pins: engine ABI 1\.2\.0, drawlist v5, event batch v1\./);
  assert.match(detail, /Current Rezi pins: engine ABI 1\.2\.0, drawlist v5, event batch v1\./);
  assert.match(detail, /Detected native compatibility with legacy pins engine ABI 1\.1\.0 \+ drawlist v2\./);
  assert.match(detail, /build:native/);
  assert.match(detail, /Native module: @rezi-ui\/native\./);
  assert.equal(destroyedEngineId, 7);
});

test("engineCreate diagnostics: platform errors include tty guidance", () => {
  const detail = buildEngineCreateFailureDetail(-6, {}, {});
  assert.match(detail, /engine_create failed: code=-6 \(ZR_ERR_PLATFORM\)\./);
  assert.match(detail, /no TTY or unsupported terminal mode/);
  assert.match(detail, /ZIREAEL_POSIX_PIPE_MODE=1/);
});
