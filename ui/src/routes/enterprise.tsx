import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowUpRight, Lock, ShieldCheck, ScrollText, Server, KeyRound, Users } from "lucide-react";
import { GlassPanel } from "@/components/glass/GlassPanel";
import { GlassButton } from "@/components/glass/GlassButton";
import { SiteNav } from "@/components/site/SiteNav";
import { SiteFooter } from "@/components/site/SiteFooter";

export const Route = createFileRoute("/enterprise")({
  head: () => ({
    meta: [
      { title: "Enterprise — 0101 for regulated and governance-first teams" },
      {
        name: "description",
        content:
          "Private deployment, SSO, audit bundles, per-workspace budgets, signed artifacts. 0101 for regulated industries.",
      },
      { property: "og:title", content: "Enterprise — 0101" },
      {
        property: "og:description",
        content: "Private deployment, SSO, audit bundles, per-workspace budgets, signed artifacts.",
      },
    ],
  }),
  component: EnterprisePage,
});

const PILLARS = [
  {
    icon: Lock,
    title: "Private deployment",
    body: "Self-hosted, single-tenant cloud, or in your VPC. Your model keys, your data, your perimeter.",
  },
  {
    icon: KeyRound,
    title: "SSO & SCIM",
    body: "Okta, Azure AD, Google Workspace. Group-based role mapping, just-in-time provisioning.",
  },
  {
    icon: ShieldCheck,
    title: "Approval & budget controls",
    body: "Per-workspace spend caps, per-role tool policies, per-workflow approval gates.",
  },
  {
    icon: ScrollText,
    title: "Signed audit bundles",
    body: "Every run exportable as a signed bundle: workflow version, prompts, tool calls, approvals, hashes.",
  },
  {
    icon: Server,
    title: "BYO model gateway",
    body: "Route to OpenAI, Anthropic, Azure, Bedrock, on-prem vLLM. Per-workspace provider scoping.",
  },
  {
    icon: Users,
    title: "Multi-company workspaces",
    body: "Hierarchies for agencies and platform companies. Cross-company reporting and chargeback.",
  },
];

function EnterprisePage() {
  return (
    <div className="min-h-screen flex flex-col">
      <SiteNav />
      <main className="flex-1 px-6 pt-36 pb-24">
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <div className="font-mono text-xs tracking-[0.3em] text-rim/80 uppercase mb-4">
              Enterprise
            </div>
            <h1 className="text-4xl md:text-6xl font-semibold tracking-tight text-chrome mb-6">
              Built for the teams that own the consequences.
            </h1>
            <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
              0101 was designed by operators who answer to security, legal, and finance. Every
              primitive — workflows, runs, artifacts, approvals — was built to defend in an audit.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {PILLARS.map((p, i) => (
              <motion.div
                key={p.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
              >
                <GlassPanel padding="lg" rim className="h-full">
                  <p.icon className="size-5 text-rim mb-4" />
                  <h3 className="text-lg font-semibold tracking-tight mb-2">{p.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{p.body}</p>
                </GlassPanel>
              </motion.div>
            ))}
          </div>

          <div className="grid md:grid-cols-2 gap-4 mt-12">
            <GlassPanel padding="lg">
              <div className="font-mono text-[10px] tracking-widest text-rim/80 uppercase mb-3">
                Compliance posture
              </div>
              <ul className="text-sm text-foreground/80 space-y-2">
                <li>· SOC 2 Type II controls in evidence</li>
                <li>· ISO 27001 alignment</li>
                <li>· GDPR & UK-GDPR data processing addendum</li>
                <li>· HIPAA-ready deployment option (BAAs available)</li>
                <li>· Configurable data residency (US, EU, UK)</li>
              </ul>
            </GlassPanel>
            <GlassPanel padding="lg">
              <div className="font-mono text-[10px] tracking-widest text-rim/80 uppercase mb-3">
                Operational guarantees
              </div>
              <ul className="text-sm text-foreground/80 space-y-2">
                <li>· 99.9% uptime SLA for managed cloud</li>
                <li>· Named customer engineer on enterprise tier</li>
                <li>· Quarterly business reviews with usage and spend analysis</li>
                <li>· 24/7 incident response on critical workflows</li>
                <li>· Long-term-support release line</li>
              </ul>
            </GlassPanel>
          </div>

          <div className="mt-20">
            <GlassPanel variant="strong" rim padding="lg" className="text-center py-14">
              <h2 className="text-2xl md:text-4xl font-semibold tracking-tight text-chrome mb-3">
                Talk to us about deployment.
              </h2>
              <p className="text-muted-foreground mb-6 max-w-xl mx-auto">
                We'll scope a pilot against one of your existing workflows and give you a deployment
                plan in a week.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <GlassButton asChild variant="primary" size="lg">
                  <Link to="/pricing">
                    See pricing <ArrowUpRight />
                  </Link>
                </GlassButton>
                <GlassButton asChild variant="glass" size="lg">
                  <Link to="/auth/signup">Start a trial</Link>
                </GlassButton>
              </div>
            </GlassPanel>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
