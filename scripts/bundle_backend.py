import os
import subprocess
import sys
import platform
import shutil

def bundle():
    print("🚀 Starting Backend Bundle Process...")
    
    # Paths
    root_dir = os.getcwd()
    entry_point = os.path.join(root_dir, "core", "governance.py")
    dist_dir = os.path.join(root_dir, "ui", "src-tauri", "binaries")
    
    # Ensure dist dir exists
    os.makedirs(dist_dir, exist_ok=True)
    
    # Determine target name with architecture triplet for Tauri 2.0
    # Format: binary-name-target-triple
    # Example: ensemble-backend-aarch64-apple-darwin
    
    system = platform.system().lower()
    arch = platform.machine().lower()
    
    # Map architectures to Rust triples
    if arch == "x86_64":
        triplet_arch = "x86_64"
    elif arch == "arm64" or arch == "aarch64":
        triplet_arch = "aarch64"
    else:
        triplet_arch = arch
        
    if system == "darwin":
        triplet = f"{triplet_arch}-apple-darwin"
    elif system == "windows":
        triplet = f"{triplet_arch}-pc-windows-msvc"
    else:
        triplet = f"{triplet_arch}-unknown-linux-gnu"
        
    binary_name = f"ensemble-backend-{triplet}"
    if system == "windows":
        binary_name += ".exe"
        
    print(f"📦 Target Binary: {binary_name}")
    
    # Build with PyInstaller
    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--onefile",
        "--name", binary_name,
        "--clean",
        "--noconfirm",
        "--additional-hooks-dir", "scripts/hooks",
        "--collect-all", "fastapi",
        "--collect-all", "uvicorn",
        "--collect-all", "metagpt",
        "--collect-all", "sentence_transformers",
        "--add-data", f"core{os.pathsep}core",
        "--add-data", f"data{os.pathsep}data",
        "--add-data", f"skills{os.pathsep}skills",
        "--add-data", f"integrations{os.pathsep}integrations",
        entry_point
    ]
    
    print(f"🛠️  Running: {' '.join(cmd)}")
    subprocess.run(cmd, check=True)
    
    # Move to Tauri binaries folder
    bundled_file = os.path.join("dist", binary_name)
    target_file = os.path.join(dist_dir, binary_name)
    
    if os.path.exists(bundled_file):
        shutil.move(bundled_file, target_file)
        print(f"✅ Success! Binary moved to: {target_file}")
    else:
        print(f"❌ Error: Bundled file not found at {bundled_file}")
        sys.exit(1)

if __name__ == "__main__":
    bundle()
