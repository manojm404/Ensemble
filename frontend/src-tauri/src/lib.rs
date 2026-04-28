use tauri_plugin_shell::ShellExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      // Manual sidecar spawn for maximum robustness
      let binary_name = if cfg!(target_os = "windows") { "ensemble-backend.exe" } else { "ensemble-backend" };
      
      let mut path = std::env::current_exe().unwrap();
      path.pop();
      path.push(binary_name);
      
      println!("🔍 Resolved backend path: {:?}", path);
      if path.exists() {
        match std::process::Command::new(&path)
          .stdout(std::process::Stdio::inherit())
          .stderr(std::process::Stdio::inherit())
          .spawn() {
            Ok(_) => { println!("🚀 Backend spawned manually with inherited output"); }
            Err(e) => { eprintln!("❌ Manual spawn failed: {}", e); }
          }
      } else {
        eprintln!("❌ Resolved path does not exist: {:?}", path);
      }

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
