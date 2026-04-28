import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles } from "lucide-react";

export default function QuickAssistantSettings() {
  return (
    <div className="p-6 max-w-2xl">
      <h2 className="text-lg font-semibold text-foreground mb-6">Quick Assistant</h2>
      <div className="space-y-0">
        <div className="flex items-center justify-between py-3 border-b border-border/30">
          <div>
            <p className="text-sm font-medium text-foreground">Enable Quick Assistant</p>
            <p className="text-xs text-muted-foreground mt-0.5">Show floating assistant for quick queries</p>
          </div>
          <Switch defaultChecked />
        </div>
        <div className="flex items-center justify-between py-3 border-b border-border/30">
          <div>
            <p className="text-sm font-medium text-foreground">Trigger</p>
            <p className="text-xs text-muted-foreground mt-0.5">How to invoke the quick assistant</p>
          </div>
          <Select defaultValue="hotkey">
            <SelectTrigger className="w-40 bg-secondary/50 border-border/50"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="hotkey">Hotkey (⌘ Space)</SelectItem>
              <SelectItem value="click">Click</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between py-3 border-b border-border/30">
          <div>
            <p className="text-sm font-medium text-foreground">Model</p>
          </div>
          <Select defaultValue="fast">
            <SelectTrigger className="w-48 bg-secondary/50 border-border/50"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="fast">Quick Model (GPT-4o Mini)</SelectItem>
              <SelectItem value="default">Default Model</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="mt-8 text-center py-8">
        <Sparkles className="h-12 w-12 mx-auto text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground mt-3">Press ⌘ Space anywhere to invoke</p>
      </div>
    </div>
  );
}
