import { useState } from "react";
import { Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

interface Props {
  onAdd: (app: { id: string; name: string; url: string; logoUrl: string }) => void;
}

export function AddCustomAppDialog({ onAdd }: Props) {
  const [open, setOpen] = useState(false);
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [logoUrl, setLogoUrl] = useState("");

  const handleSave = () => {
    if (!id.trim() || !name.trim() || !url.trim()) return;
    const finalLogo = logoUrl.trim() || `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=128`;
    onAdd({ id: id.trim().toLowerCase(), name: name.trim(), url: url.trim(), logoUrl: finalLogo });
    setId("");
    setName("");
    setUrl("");
    setLogoUrl("");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="flex flex-col items-center gap-1.5 group rounded-lg p-2 hover:bg-background/60 transition-colors">
          <div className="h-10 w-10 rounded-xl border-2 border-dashed border-border/40 flex items-center justify-center group-hover:border-primary/40 group-hover:bg-primary/5 transition-all duration-200">
            <Plus className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
          <span className="text-[10px] font-medium text-muted-foreground group-hover:text-foreground transition-colors">
            Custom
          </span>
        </button>
      </DialogTrigger>
      <DialogContent className="glass border-border/40 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Custom App</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label className="text-xs">
              <span className="text-destructive">*</span> ID
            </Label>
            <Input value={id} onChange={(e) => setId(e.target.value)} placeholder="Enter ID" className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">
              <span className="text-destructive">*</span> Name
            </Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter name" className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">
              <span className="text-destructive">*</span> URL
            </Label>
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com" className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Logo URL</Label>
            <Input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="Enter logo URL (optional)" className="h-9" />
          </div>
          <Button onClick={handleSave} disabled={!id.trim() || !name.trim() || !url.trim()} className="w-full">
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
