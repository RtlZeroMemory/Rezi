/*
  src/platform/win32/zr_win32_conpty_test.c — ConPTY harness helpers for integration tests.

  Why: Provides a small, deterministic ConPTY runner (spawn self + capture output) so
  win32 integration tests can validate backend VT sequences and wake behavior without
  depending on an interactive console.
*/

#define WIN32_LEAN_AND_MEAN
#include <Windows.h>

#include "platform/win32/zr_win32_conpty_test.h"

#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

/* Windows SDKs that predate ConPTY do not define this attribute constant. */
#ifndef PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE
#define PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE 0x00020016
#endif

typedef HANDLE zr_win32_hpc_t;

typedef HRESULT(WINAPI* zr_win32_create_pseudoconsole_fn)(COORD size, HANDLE h_in, HANDLE h_out, DWORD flags, zr_win32_hpc_t* out_hpc);
typedef void(WINAPI* zr_win32_close_pseudoconsole_fn)(zr_win32_hpc_t hpc);

/* --- ConPTY runner limits --- */
#define ZR_WIN32_CONPTY_CHILD_TIMEOUT_MS 4000ull

static void zr_win32_strcpy_reason(char* dst, size_t cap, const char* s) {
  if (!dst || cap == 0u) {
    return;
  }
  if (!s) {
    dst[0] = '\0';
    return;
  }
  size_t i = 0u;
  for (; i + 1u < cap && s[i] != '\0'; i++) {
    dst[i] = s[i];
  }
  dst[i] = '\0';
}

static bool zr_win32_conpty_load(zr_win32_create_pseudoconsole_fn* out_create,
                                 zr_win32_close_pseudoconsole_fn* out_close,
                                 char* out_skip_reason,
                                 size_t out_skip_reason_cap) {
  if (!out_create || !out_close) {
    return false;
  }
  *out_create = NULL;
  *out_close = NULL;

  HMODULE k32 = GetModuleHandleW(L"kernel32.dll");
  if (!k32) {
    zr_win32_strcpy_reason(out_skip_reason, out_skip_reason_cap, "kernel32.dll not available");
    return false;
  }

  zr_win32_create_pseudoconsole_fn create_fn = (zr_win32_create_pseudoconsole_fn)(void*)GetProcAddress(k32, "CreatePseudoConsole");
  zr_win32_close_pseudoconsole_fn close_fn = (zr_win32_close_pseudoconsole_fn)(void*)GetProcAddress(k32, "ClosePseudoConsole");
  if (!create_fn || !close_fn) {
    zr_win32_strcpy_reason(out_skip_reason, out_skip_reason_cap, "ConPTY APIs not available (CreatePseudoConsole/ClosePseudoConsole)");
    return false;
  }

  *out_create = create_fn;
  *out_close = close_fn;
  return true;
}

static bool zr_win32_make_pipe(HANDLE* out_read, HANDLE* out_write) {
  if (!out_read || !out_write) {
    return false;
  }
  *out_read = NULL;
  *out_write = NULL;

  SECURITY_ATTRIBUTES sa;
  memset(&sa, 0, sizeof(sa));
  sa.nLength = sizeof(sa);
  sa.bInheritHandle = FALSE;
  sa.lpSecurityDescriptor = NULL;

  HANDLE r = NULL;
  HANDLE w = NULL;
  if (!CreatePipe(&r, &w, &sa, 0u)) {
    return false;
  }

  *out_read = r;
  *out_write = w;
  return true;
}

static bool zr_win32_read_pipe_best_effort(HANDLE h_read, uint8_t* out_bytes, size_t out_cap, size_t* inout_len) {
  if (!h_read || !out_bytes || !inout_len) {
    return false;
  }
  if (*inout_len >= out_cap) {
    return true;
  }

  DWORD avail = 0u;
  if (!PeekNamedPipe(h_read, NULL, 0u, NULL, &avail, NULL)) {
    return false;
  }
  if (avail == 0u) {
    return true;
  }

  size_t remaining = out_cap - *inout_len;
  DWORD want = avail;
  if ((size_t)want > remaining) {
    want = (DWORD)remaining;
  }

  DWORD got = 0u;
  if (!ReadFile(h_read, out_bytes + *inout_len, want, &got, NULL)) {
    return false;
  }
  *inout_len += (size_t)got;
  return true;
}

static zr_result_t zr_win32_get_self_path(char* out_path, size_t out_cap) {
  if (!out_path || out_cap == 0u) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  out_path[0] = '\0';

  DWORD n = GetModuleFileNameA(NULL, out_path, (DWORD)out_cap);
  if (n == 0u || n >= (DWORD)out_cap) {
    out_path[0] = '\0';
    return ZR_ERR_PLATFORM;
  }
  return ZR_OK;
}

static char* zr_win32_build_cmdline(const char* exe_path, const char* child_args) {
  if (!exe_path) {
    return NULL;
  }
  if (!child_args) {
    child_args = "";
  }

  size_t exe_len = strlen(exe_path);
  size_t args_len = strlen(child_args);

  /*
    Format: "<exe_path>" <child_args>
    Worst case: quotes + space + NUL.
  */
  size_t cap = exe_len + args_len + 4u;
  char* cmd = (char*)HeapAlloc(GetProcessHeap(), 0u, cap);
  if (!cmd) {
    return NULL;
  }

  int rc = snprintf(cmd, cap, "\"%s\" %s", exe_path, child_args);
  if (rc < 0 || (size_t)rc >= cap) {
    HeapFree(GetProcessHeap(), 0u, cmd);
    return NULL;
  }
  cmd[cap - 1u] = '\0';
  return cmd;
}

zr_result_t zr_win32_conpty_run_self_capture(const char* child_args,
                                             uint8_t* out_bytes,
                                             size_t out_cap,
                                             size_t* out_len,
                                             uint32_t* out_exit_code,
                                             char* out_skip_reason,
                                             size_t out_skip_reason_cap) {
  if (!out_len || !out_exit_code || !out_skip_reason || out_skip_reason_cap == 0u) {
    return ZR_ERR_INVALID_ARGUMENT;
  }
  *out_len = 0u;
  *out_exit_code = 0u;
  out_skip_reason[0] = '\0';

  zr_win32_create_pseudoconsole_fn create_pc = NULL;
  zr_win32_close_pseudoconsole_fn close_pc = NULL;
  if (!zr_win32_conpty_load(&create_pc, &close_pc, out_skip_reason, out_skip_reason_cap)) {
    return ZR_ERR_UNSUPPORTED;
  }

  HANDLE conpty_in_r = NULL;
  HANDLE conpty_in_w = NULL;
  HANDLE conpty_out_r = NULL;
  HANDLE conpty_out_w = NULL;
  zr_win32_hpc_t hpc = NULL;
  STARTUPINFOEXA si;
  PROCESS_INFORMATION pi;
  memset(&si, 0, sizeof(si));
  memset(&pi, 0, sizeof(pi));

  char exe_path[MAX_PATH];
  zr_result_t r = zr_win32_get_self_path(exe_path, sizeof(exe_path));
  if (r != ZR_OK) {
    return r;
  }

  COORD size;
  memset(&size, 0, sizeof(size));
  HRESULT hr = 0;
  SIZE_T attr_list_size = 0u;
  char* cmdline = NULL;
  BOOL ok = FALSE;
  uint64_t start_ms = 0ull;
  DWORD exit_code = 0u;

  if (!zr_win32_make_pipe(&conpty_in_r, &conpty_in_w) || !zr_win32_make_pipe(&conpty_out_r, &conpty_out_w)) {
    r = ZR_ERR_PLATFORM;
    goto cleanup;
  }

  size.X = 80;
  size.Y = 25;
  hr = create_pc(size, conpty_in_r, conpty_out_w, 0u, &hpc);
  if (FAILED(hr) || !hpc) {
    zr_win32_strcpy_reason(out_skip_reason, out_skip_reason_cap, "CreatePseudoConsole failed (ConPTY unavailable or blocked)");
    r = ZR_ERR_UNSUPPORTED;
    goto cleanup;
  }

  (void)InitializeProcThreadAttributeList(NULL, 1u, 0u, &attr_list_size);
  if (attr_list_size == 0u) {
    r = ZR_ERR_PLATFORM;
    goto cleanup;
  }

  si.lpAttributeList = (LPPROC_THREAD_ATTRIBUTE_LIST)HeapAlloc(GetProcessHeap(), 0u, attr_list_size);
  if (!si.lpAttributeList) {
    r = ZR_ERR_OOM;
    goto cleanup;
  }
  if (!InitializeProcThreadAttributeList(si.lpAttributeList, 1u, 0u, &attr_list_size)) {
    r = ZR_ERR_PLATFORM;
    goto cleanup;
  }
  if (!UpdateProcThreadAttribute(si.lpAttributeList,
                                 0u,
                                 (DWORD_PTR)PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE,
                                 hpc,
                                 sizeof(hpc),
                                 NULL,
                                 NULL)) {
    r = ZR_ERR_PLATFORM;
    goto cleanup;
  }

  si.StartupInfo.cb = sizeof(si);
  /*
    ConPTY still expects the child to have valid std handles. Keep them pointed
    at the parent's std handles; the pseudo-console attachment is driven by the
    attribute list.
  */
  si.StartupInfo.dwFlags = STARTF_USESTDHANDLES;
  si.StartupInfo.hStdInput = GetStdHandle(STD_INPUT_HANDLE);
  si.StartupInfo.hStdOutput = GetStdHandle(STD_OUTPUT_HANDLE);
  si.StartupInfo.hStdError = GetStdHandle(STD_ERROR_HANDLE);

  cmdline = zr_win32_build_cmdline(exe_path, child_args);
  if (!cmdline) {
    r = ZR_ERR_OOM;
    goto cleanup;
  }

  ok = CreateProcessA(NULL,
                      cmdline,
                      NULL,
                      NULL,
                      FALSE,
                      EXTENDED_STARTUPINFO_PRESENT,
                      NULL,
                      NULL,
                      &si.StartupInfo,
                      &pi);
  HeapFree(GetProcessHeap(), 0u, cmdline);
  cmdline = NULL;
  if (!ok) {
    r = ZR_ERR_PLATFORM;
    goto cleanup;
  }

  /* Close ends owned by the ConPTY instance. */
  CloseHandle(conpty_in_r);
  conpty_in_r = NULL;
  CloseHandle(conpty_out_w);
  conpty_out_w = NULL;

  start_ms = (uint64_t)GetTickCount64();
  for (;;) {
    if (out_bytes && out_cap > 0u) {
      if (!zr_win32_read_pipe_best_effort(conpty_out_r, out_bytes, out_cap, out_len)) {
        r = ZR_ERR_PLATFORM;
        goto cleanup;
      }
    }

    DWORD wait_rc = WaitForSingleObject(pi.hProcess, 0u);
    if (wait_rc == WAIT_OBJECT_0) {
      break;
    }
    if (wait_rc == WAIT_FAILED) {
      r = ZR_ERR_PLATFORM;
      goto cleanup;
    }

    if (((uint64_t)GetTickCount64() - start_ms) > ZR_WIN32_CONPTY_CHILD_TIMEOUT_MS) {
      (void)TerminateProcess(pi.hProcess, 2u);
      (void)WaitForSingleObject(pi.hProcess, 250u);
      r = ZR_ERR_PLATFORM;
      goto cleanup;
    }
    Sleep(10u);
  }

  if (!GetExitCodeProcess(pi.hProcess, &exit_code)) {
    r = ZR_ERR_PLATFORM;
    goto cleanup;
  }
  *out_exit_code = (uint32_t)exit_code;

  /* Final drain. */
  for (int i = 0; i < 32; i++) {
    size_t before = *out_len;
    if (out_bytes && out_cap > 0u) {
      if (!zr_win32_read_pipe_best_effort(conpty_out_r, out_bytes, out_cap, out_len)) {
        r = ZR_ERR_PLATFORM;
        goto cleanup;
      }
    }
    if (*out_len == before) {
      break;
    }
    Sleep(1u);
  }

  r = ZR_OK;

cleanup:
  if (cmdline) {
    HeapFree(GetProcessHeap(), 0u, cmdline);
    cmdline = NULL;
  }

  if (pi.hProcess) {
    DWORD wait_rc = WaitForSingleObject(pi.hProcess, 0u);
    if (wait_rc == WAIT_TIMEOUT) {
      (void)TerminateProcess(pi.hProcess, 2u);
      (void)WaitForSingleObject(pi.hProcess, 250u);
    }
  }

  if (pi.hThread) {
    CloseHandle(pi.hThread);
    pi.hThread = NULL;
  }
  if (pi.hProcess) {
    CloseHandle(pi.hProcess);
    pi.hProcess = NULL;
  }

  if (si.lpAttributeList) {
    DeleteProcThreadAttributeList(si.lpAttributeList);
    HeapFree(GetProcessHeap(), 0u, si.lpAttributeList);
    si.lpAttributeList = NULL;
  }

  if (hpc) {
    close_pc(hpc);
    hpc = NULL;
  }

  if (conpty_in_r) {
    CloseHandle(conpty_in_r);
    conpty_in_r = NULL;
  }
  if (conpty_in_w) {
    CloseHandle(conpty_in_w);
    conpty_in_w = NULL;
  }
  if (conpty_out_r) {
    CloseHandle(conpty_out_r);
    conpty_out_r = NULL;
  }
  if (conpty_out_w) {
    CloseHandle(conpty_out_w);
    conpty_out_w = NULL;
  }

  return r;
}
