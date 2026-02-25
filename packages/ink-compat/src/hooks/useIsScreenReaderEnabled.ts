/**
 * Stub implementation of Ink's useIsScreenReaderEnabled hook.
 *
 * Ink detects screen readers via the TERM_PROGRAM or accessibility APIs.
 * In our compat layer we always return false since Rezi's Zireael renderer
 * does not have screen-reader detection yet.
 */
export function useIsScreenReaderEnabled(): boolean {
  return false;
}
