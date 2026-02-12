/*
  src/core/zr_input_parser.h — Deterministic input byte parser (VT subset + focus/ext keys).

  Why: Converts platform-provided raw bytes into normalized events without
  relying on terminal/OS APIs, and without ever hanging on malformed inputs.
*/

#ifndef ZR_CORE_ZR_INPUT_PARSER_H_INCLUDED
#define ZR_CORE_ZR_INPUT_PARSER_H_INCLUDED

#include "core/zr_event_queue.h"

#include <stddef.h>
#include <stdint.h>

/*
  zr_input_parse_bytes:
    - Consumes raw input bytes and enqueues normalized events.
    - Always makes progress by consuming at least 1 byte per loop iteration.
    - Unknown/malformed escape sequences are handled deterministically.

  Note: This parser intentionally supports a constrained VT/xterm subset
  (arrows/home/end, focus in/out, basic controls, SGR mouse, CSI-u/modifier
  key forms). Unknown sequences degrade deterministically as Escape/text
  without hangs.
*/
void zr_input_parse_bytes(zr_event_queue_t* q, const uint8_t* bytes, size_t len, uint32_t time_ms);

/*
  zr_input_parse_bytes_prefix:
    - Like zr_input_parse_bytes(), but may stop before a trailing, incomplete
      supported escape sequence so callers can buffer it and retry.

  Returns: number of bytes consumed from the front of {bytes,len}.
*/
size_t zr_input_parse_bytes_prefix(zr_event_queue_t* q, const uint8_t* bytes, size_t len, uint32_t time_ms);

#endif /* ZR_CORE_ZR_INPUT_PARSER_H_INCLUDED */
