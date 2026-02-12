use std::env;
use std::path::PathBuf;

fn main() {
  napi_build::setup();

  let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR"));
  let vendor = manifest_dir.join("vendor").join("zireael");
  let include_dir = vendor.join("include");
  let src_dir = vendor.join("src");

  let mut build = cc::Build::new();
  build.include(&include_dir);
  build.include(&src_dir);
  build.warnings(false);

  // The engine assumes a C99-or-newer compiler; C11 is required for atomics on MSVC.
  if build.get_compiler().is_like_msvc() {
    build.flag_if_supported("/std:c11");
    build.flag_if_supported("/experimental:c11atomics");
  } else {
    build.flag_if_supported("-std=c11");
  }

  // Core + unicode + util.
  build.file(src_dir.join("core").join("zr_engine.c"));
  build.file(src_dir.join("core").join("zr_framebuffer.c"));
  build.file(src_dir.join("core").join("zr_drawlist.c"));
  build.file(src_dir.join("core").join("zr_event_pack.c"));
  build.file(src_dir.join("core").join("zr_event_queue.c"));
  build.file(src_dir.join("core").join("zr_metrics.c"));
  build.file(src_dir.join("core").join("zr_input_parser.c"));
  build.file(src_dir.join("core").join("zr_damage.c"));
  build.file(src_dir.join("core").join("zr_config.c"));
  build.file(src_dir.join("core").join("zr_debug_overlay.c"));
  build.file(src_dir.join("core").join("zr_debug_trace.c"));
  build.file(src_dir.join("core").join("zr_diff.c"));
  build.file(src_dir.join("core").join("zr_placeholder.c"));

  build.file(src_dir.join("unicode").join("zr_width.c"));
  build.file(src_dir.join("unicode").join("zr_unicode_data.c"));
  build.file(src_dir.join("unicode").join("zr_utf8.c"));
  build.file(src_dir.join("unicode").join("zr_grapheme.c"));
  build.file(src_dir.join("unicode").join("zr_wrap.c"));

  build.file(src_dir.join("util").join("zr_arena.c"));
  build.file(src_dir.join("util").join("zr_caps.c"));
  build.file(src_dir.join("util").join("zr_ring.c"));
  build.file(src_dir.join("util").join("zr_log.c"));
  build.file(src_dir.join("util").join("zr_assert.c"));
  build.file(src_dir.join("util").join("zr_string_builder.c"));
  build.file(src_dir.join("util").join("zr_vec.c"));

  // Platform selection + backend.
  build.file(src_dir.join("platform").join("zr_platform_select.c"));
  if env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
    build.file(src_dir.join("platform").join("win32").join("zr_plat_win32.c"));
    println!("cargo:rustc-link-lib=dylib=advapi32");
    println!("cargo:rustc-link-lib=dylib=kernel32");
    println!("cargo:rustc-link-lib=dylib=user32");
  } else {
    build.file(src_dir.join("platform").join("posix").join("zr_plat_posix.c"));
  }

  build.compile("zireael_core");

  // Keep rebuilds deterministic when vendored sources change.
  println!("cargo:rerun-if-changed=vendor/VENDOR_COMMIT.txt");
  println!("cargo:rerun-if-changed=vendor/zireael/include");
  println!("cargo:rerun-if-changed=vendor/zireael/src");
}
