import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MousePointer2 } from "lucide-react";

export default function SelectionAssistantSettings() {
  return (
    <div className="p-6 max-w-2xl">
      <h2 className="text-lg font-semibold text-foreground mb-6">Selection Assistant</h2>
      <div className="space-y-0">
        <div className="flex items-center justify-between py-3 border-b border-border/30">
          <div>
            <p className="text-sm font-medium text-foreground">Enable Selection Assistant</p>
            <p className="text-xs text-muted-foreground mt-0.5">Show AI actions when selecting text</p>
          </div>
          <Switch defaultChecked />
        </div>
        <div className="flex items-center justify-between py-3 border-b border-border/30">
          <div>
            <p className="text-sm font-medium text-foreground">Actions</p>
            <p className="text-xs text-muted-foreground mt-0.5">What to show on text selection</p>
          </div>
          <Select defaultValue="all">
            <SelectTrigger className="w-48 bg-secondary/50 border-border/50"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Actions</SelectItem>
              <SelectItem value="translate">Translate Only</SelectItem>
              <SelectItem value="explain">Explain Only</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between py-3 border-b border-border/30">
          <div>
            <p className="text-sm font-medium text-foreground">Show in Input Fields</p>
            <p className="text-xs text-muted-foreground mt-0.5">Also trigger in editable areas</p>
          </div>
          <Switch />
        </div>
      </div>
      <div className="mt-8 text-center py-8">
        <MousePointer2 className="h-12 w-12 mx-auto text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground mt-3">Select any text to see AI actions</p>
      </div>
    </div>
  );
}
