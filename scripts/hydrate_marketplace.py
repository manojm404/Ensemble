import os
import shutil
import json
import zipfile

SOURCE_REPO = "/tmp/agency-agents-repo"
MARKETPLACE_DIR = "data/marketplace"
PACKS_PATH = os.path.join(MARKETPLACE_DIR, "packs")
ZIPS_PATH = os.path.join(MARKETPLACE_DIR, "zips")
MANIFEST_PATH = os.path.join(MARKETPLACE_DIR, "packs.json")

os.makedirs(PACKS_PATH, exist_ok=True)
os.makedirs(ZIPS_PATH, exist_ok=True)

packs_meta = []

def create_pack(pack_id, name, description, emoji, author, agent_sources):
    print(f"📦 Creating {pack_id}...")
    pack_dir = os.path.join(PACKS_PATH, pack_id)
    if os.path.exists(pack_dir):
        shutil.rmtree(pack_dir)
    os.makedirs(pack_dir, exist_ok=True)
    
    agent_files = []
    
    for src_path in agent_sources:
        full_src = os.path.join(SOURCE_REPO, src_path)
        if os.path.exists(full_src):
            fname = os.path.basename(full_src)
            shutil.copy(full_src, os.path.join(pack_dir, fname))
            agent_files.append(fname)
        else:
            print(f"⚠️ Source missing: {src_path}")
            
    if not agent_files:
        print(f"❌ Skipping {pack_id}, no agents found.")
        return

    # Create pack.json
    pack_data = {
        "pack_id": pack_id,
        "name": name,
        "description": description,
        "version": "1.0.0",
        "author": author,
        "agents": [{"file": f} for f in agent_files]
    }
    with open(os.path.join(pack_dir, "pack.json"), "w") as f:
        json.dump(pack_data, f, indent=2)
        
    # ZIP the pack
    zip_filename = f"{pack_id}.zip"
    zip_file_path = os.path.join(ZIPS_PATH, zip_filename)
    with zipfile.ZipFile(zip_file_path, "w") as zipf:
        for file in os.listdir(pack_dir):
            zipf.write(os.path.join(pack_dir, file), file)
    
    print(f"✅ Zipped {zip_filename}")
            
    # Add to manifest
    packs_meta.append({
        "id": pack_id,
        "name": name,
        "description": description,
        "emoji": emoji,
        "version": "1.0.0",
        "author": author,
        "download_url": f"http://127.0.0.1:8089/static/marketplace/zips/{zip_filename}",
        "agent_files": agent_files
    })

# Definitions
create_pack(
    "game-dev-pack",
    "Game Dev Pack",
    "Unity, Unreal, and Godot specialists for cross-engine workflows.",
    "🎮",
    "Ensemble (from agency-agents)",
    [
        "game-development/unity/unity-architect.md",
        "game-development/unreal-engine/unreal-systems-engineer.md",
        "game-development/godot/godot-gameplay-scripter.md",
        "game-development/technical-artist.md"
    ]
)

create_pack(
    "china-market-pack",
    "China Market Mastery",
    "Navigate Douyin, WeChat, Xiaohongshu, and Baidu SEO with ease.",
    "🏮",
    "Ensemble (from agency-agents)",
    [
        "marketing/marketing-douyin-strategist.md",
        "marketing/marketing-private-domain-operator.md",
        "marketing/marketing-china-market-localization-strategist.md",
        "marketing/marketing-baidu-seo-specialist.md"
    ]
)

create_pack(
    "paid-media-pack",
    "Paid Media Specialists",
    "Advanced PPC, Search Analysis, and Ad Creative Strategists.",
    "📈",
    "Ensemble (from agency-agents)",
    [
        "paid-media/paid-media-ppc-strategist.md",
        "paid-media/paid-media-search-query-analyst.md",
        "paid-media/paid-media-creative-strategist.md",
        "paid-media/paid-media-auditor.md"
    ]
)

create_pack(
    "testing-qa-pack",
    "Elite QA & Reliability",
    "Evidence collection, API testing, and reality checking specialists.",
    "🧪",
    "Ensemble (from agency-agents)",
    [
        "testing/testing-evidence-collector.md",
        "testing/testing-reality-checker.md",
        "testing/testing-api-tester.md",
        "testing/testing-performance-benchmarker.md"
    ]
)

create_pack(
    "spatial-computing-pack",
    "Spatial Computing Suite",
    "Meta Metal, visionOS, and XR Interface architects.",
    "🥽",
    "Ensemble (from agency-agents)",
    [
        "spatial-computing/macos-spatial-metal-engineer.md",
        "spatial-computing/visionos-spatial-engineer.md",
        "spatial-computing/xr-immersive-developer.md",
        "spatial-computing/xr-interface-architect.md"
    ]
)

# Finally, write the main packs.json manifest
with open(MANIFEST_PATH, "w") as f:
    json.dump({"packs": packs_meta}, f, indent=2)

print("\n🚀 Marketplace Hydration Cycle Complete.")
