import os, shutil, yaml

# Use relative paths from project root
ROOT = os.getcwd()
SOURCE = os.path.join(ROOT, "skills")
TARGET = os.path.join(ROOT, "data/agents/native")

def migrate(dry_run=True):
    print(f"🚀 Starting Migration (Dry Run: {dry_run})")
    print(f"ROOT: {ROOT}\n")
    
    if not os.path.exists(TARGET) and not dry_run:
        os.makedirs(TARGET, exist_ok=True)

    count = 0
    for f in os.listdir(SOURCE):
        if not f.endswith(".md"): continue
        
        # 1. Clean Prefix: support-support-X.md -> X.md
        clean_name = f.replace("support-support-", "").replace("agency-", "").replace("testing-testing-", "")
        
        # 2. Extract Category (e.g. support, research, unity)
        category = "general"
        if "-" in clean_name:
            category_parts = clean_name.split("-")
            category = category_parts[0].lower()
            clean_name = "-".join(category_parts[1:])

        t_dir = os.path.join(TARGET, category)
        t_path = os.path.join(t_dir, clean_name)

        if dry_run:
            print(f"MAPPING: {f} -> {category}/{clean_name}")
        else:
            os.makedirs(t_dir, exist_ok=True)
            _merge_copy(os.path.join(SOURCE, f), t_path, category)
        
        count += 1

    print(f"\n✅ {'Dry run' if dry_run else 'Migration'} complete. Processed {count} agents.")

def _merge_copy(src, dst, category):
    """Smarter copy: preserves existing YAML and adds category."""
    with open(src, 'r', encoding='utf-8') as f: content = f.read()
    
    meta = {}
    body = content
    if content.startswith("---"):
        parts = content.split("---", 2)
        if len(parts) >= 3:
            try:
                meta = yaml.safe_load(parts[1]) or {}
                body = parts[2]
            except: pass

    # Smart Merge
    meta["category"] = category.capitalize()
    if "name" not in meta:
        meta["name"] = os.path.basename(dst).replace(".md", "").replace("_", " ").title()
    if "emoji" not in meta: meta["emoji"] = "🤖"
    
    header = f"---\n{yaml.dump(meta, sort_keys=False)}---\n"
    with open(dst, 'w', encoding='utf-8') as f:
        f.write(header + body.strip())

if __name__ == "__main__":
    import sys
    is_live = "--live" in sys.argv
    migrate(dry_run=not is_live)
