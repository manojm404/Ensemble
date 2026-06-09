import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowUpRight, Check } from "lucide-react";
import { GlassPanel } from "@/components/glass/GlassPanel";
import { GlassButton } from "@/components/glass/GlassButton";
import { SiteNav } from "@/components/site/SiteNav";
import { SiteFooter } from "@/components/site/SiteFooter";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — 0101 plans for teams, companies, and enterprises" },
      {
        name: "description",
        content:
          "Transparent plans: free for solo operators, team for production workflows, enterprise for private deployment.",
      },
      { property: "og:title", content: "Pricing — 0101" },
      {
        property: "og:description",
        content: "Free, Team, and Enterprise plans for governed AI agent workflows.",
      },
    ],
  }),
  component: PricingPage,
});

const PLANS = [
  {
    name: "Free",
    price: "$0",
    cadence: "forever",
    summary: "For solo operators evaluating 0101 on real work.",
    features: [
      "1 workspace, 1 company",
      "Up to 3 active workflows",
      "100 runs / month",
      "Community agent packs",
      "Email support",
    ],
    cta: { label: "Start free", to: "/auth/signup" as const, variant: "glass" as const },
  },
  {
    name: "Team",
    price: "$49",
    cadence: "per active operator / month",
    summary: "For teams running governed workflows in production.",
    features: [
      "Unlimited workspaces and companies",
      "Unlimited workflows",
      "Per-workspace budgets & approval gates",
      "Marketplace agent packs",
      "BYO model keys (OpenAI, Anthropic, Azure, Bedrock)",
      "Audit bundle export",
      "Standard support, business hours",
    ],
    featured: true,
    cta: { label: "Start a Team trial", to: "/auth/signup" as const, variant: "primary" as const },
  },
  {
    name: "Enterprise",
    price: "Custom",
    cadence: "annual commitment",
    summary: "For regulated teams and platform companies.",
    features: [
      "Private deployment (VPC, on-prem, self-hosted)",
      "SSO + SCIM (Okta, Azure AD, Google)",
      "Signed audit bundles, data residency controls",
      "Per-company chargeback & reporting",
      "Named customer engineer, 24/7 incident response",
      "Custom SLA and DPA",
    ],
    cta: { label: "Talk to us", to: "/enterprise" as const, variant: "glass" as const },
  },
];

function PricingPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <SiteNav />
      <main className="flex-1 px-6 pt-36 pb-24">
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <div className="font-mono text-xs tracking-[0.3em] text-rim/80 uppercase mb-4">
              Pricing
            </div>
            <h1 className="text-4xl md:text-6xl font-semibold tracking-tight text-chrome mb-6">
              Priced per operator, not per token.
            </h1>
            <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
              Bring your own model keys. Pay for the seats that ship work, not for the tokens your
              agents burn.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            {PLANS.map((plan, i) => (
              <motion.div
                key={plan.name}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.06 }}
              >
                <GlassPanel
                  padding="lg"
                  rim={plan.featured}
                  className={`h-full flex flex-col ${plan.featured ? "border-rim/30" : ""}`}
                >
                  {plan.featured && (
                    <div className="self-start font-mono text-[10px] tracking-widest text-rim uppercase mb-3 px-2 py-1 rounded-full border border-rim/30 bg-rim/[0.05]">
                      Most popular
                    </div>
                  )}
                  <h3 className="text-xl font-semibold tracking-tight mb-1">{plan.name}</h3>
                  <p className="text-sm text-muted-foreground mb-6">{plan.summary}</p>
                  <div className="mb-6">
                    <div className="text-4xl font-semibold tracking-tight text-chrome">
                      {plan.price}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">{plan.cadence}</div>
                  </div>
                  <ul className="space-y-2 mb-8 flex-1">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm text-foreground/80">
                        <Check className="size-3.5 text-rim mt-1 shrink-0" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <GlassButton asChild variant={plan.cta.variant} size="md" className="w-full">
                    <Link to={plan.cta.to}>
                      {plan.cta.label} <ArrowUpRight />
                    </Link>
                  </GlassButton>
                </GlassPanel>
              </motion.div>
            ))}
          </div>

          <div className="mt-16 text-center text-sm text-muted-foreground">
            All plans include unlimited workflow versions, audit history, and agent marketplace
            access. Cancel any time. No per-token markup.
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
