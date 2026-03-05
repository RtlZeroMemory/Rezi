import type { BackendRawWrite } from "@rezi-ui/core";
import {
  BACKEND_BEGIN_FRAME_MARKER,
  BACKEND_DRAWLIST_VERSION_MARKER,
  BACKEND_FPS_CAP_MARKER,
  BACKEND_MAX_EVENT_BYTES_MARKER,
  BACKEND_RAW_WRITE_MARKER,
} from "@rezi-ui/core";
import type { BackendBeginFrame } from "@rezi-ui/core/backend";

type BackendMarkerOptions = Readonly<{
  requestedDrawlistVersion: number;
  maxEventBytes: number;
  fpsCap: number;
  beginFrame?: BackendBeginFrame | null;
}>;

const backendRawWrite = ((text: string): void => {
  if (typeof text !== "string" || text.length === 0) return;
  try {
    process.stdout.write(text);
  } catch {
    // Preserve backend determinism: clipboard write failures are non-fatal.
  }
}) satisfies BackendRawWrite;

export function attachBackendMarkers<TBackend extends object>(
  backend: TBackend,
  options: BackendMarkerOptions,
): TBackend {
  const descriptors: PropertyDescriptorMap = {
    [BACKEND_DRAWLIST_VERSION_MARKER]: {
      value: options.requestedDrawlistVersion,
      writable: false,
      enumerable: false,
      configurable: false,
    },
    [BACKEND_MAX_EVENT_BYTES_MARKER]: {
      value: options.maxEventBytes,
      writable: false,
      enumerable: false,
      configurable: false,
    },
    [BACKEND_FPS_CAP_MARKER]: {
      value: options.fpsCap,
      writable: false,
      enumerable: false,
      configurable: false,
    },
    [BACKEND_RAW_WRITE_MARKER]: {
      value: backendRawWrite,
      writable: false,
      enumerable: false,
      configurable: false,
    },
  };

  if (options.beginFrame !== null && options.beginFrame !== undefined) {
    descriptors[BACKEND_BEGIN_FRAME_MARKER] = {
      value: options.beginFrame,
      writable: false,
      enumerable: false,
      configurable: false,
    };
  }

  Object.defineProperties(backend, descriptors);
  return backend;
}
