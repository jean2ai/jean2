fn main() {
  tauri_build::build();

  let target = std::env::var("TARGET").unwrap_or_default();
  if target.contains("apple-ios") {
    println!("cargo:rustc-link-lib=framework=AVFoundation");
    println!("cargo:rustc-link-lib=framework=AudioToolbox");
    println!("cargo:rustc-link-lib=framework=CoreAudio");
  }
}
