import { strict as assert } from "node:assert";
import { describe, test } from "node:test";
import { type SnapshotMatchOptions, matchesSnapshot } from "./snapshot.js";

const assertWithSnapshot = assert as typeof assert & {
  matchesSnapshot: (actualValue: string, snapshotName: string, opts?: SnapshotMatchOptions) => void;
};

assertWithSnapshot.matchesSnapshot = (
  actualValue: string,
  snapshotName: string,
  opts?: SnapshotMatchOptions,
) => {
  matchesSnapshot(actualValue, snapshotName, opts);
};

export { assert, describe, test };
