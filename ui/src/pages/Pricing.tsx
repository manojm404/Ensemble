import { motion } from "framer-motion";
import { Check, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

const Pricing = () => {
  const navigate = useNavigate();

  return (
    <div className="w-full min-h-screen bg-[linear-gradient(180deg,#e8edf3_0%,#eef2f7_100%)] font-sans pt-32 pb-20 text-foreground">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center max-w-3xl mx-auto mb-20">
          <motion.h1 
            className="text-5xl md:text-6xl font-black tracking-tighter mb-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            Simple, Transparent <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">Pricing</span>
          </motion.h1>
          <motion.p 
            className="text-xl text-muted-foreground"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            Start for free, then scale your AI workforce as your company grows.
          </motion.p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <PricingCard 
            tier="Starter"
            price="0"
            description="Perfect for individuals and small experiments."
            features={["Up to 3 active workflows", "Access to 50+ basic agents", "Community support", "Standard execution speed", "1,000 monthly execution credits"]}
            buttonText="Get Started"
            onClick={() => navigate('/auth')}
          />
          <PricingCard 
            tier="Pro"
            price="49"
            highlight={true}
            description="For growing teams automating their core business."
            features={["Unlimited active workflows", "All 180+ specialist agents", "Priority support", "3x faster execution paths", "50,000 monthly execution credits", "Custom agent builder"]}
            buttonText="Start 14-Day Trial"
            onClick={() => navigate('/auth')}
          />
          <PricingCard 
            tier="Enterprise"
            price="Custom"
            description="Bank-grade security and limitless orchestration."
            features={["Infinite execution credits", "VPC & On-prem deployment", "SAML/SSO integration", "Dedicated account manager", "Custom LLM fine-tuning", "Immutable audit trails"]}
            buttonText="Contact Sales"
            onClick={() => navigate('/auth')}
          />
        </div>

        <div className="mt-20 text-center text-muted-foreground text-sm">
          <p>All plans include access to GPT-4o, Claude 3.5 Sonnet, and Gemini 2.5 Flash models.</p>
          <p className="mt-2">Prices are in USD. Credits are consumed based on agent reasoning intensity.</p>
        </div>
      </div>
    </div>
  );
};

const PricingCard = ({ tier, price, description, features, buttonText, highlight, onClick }: any) => (
  <motion.div 
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true }}
    className={`p-8 rounded-[2.5rem] border ${highlight ? 'border-slate-300 bg-white shadow-[0_0_40px_rgba(15,23,42,0.08)]' : 'border-slate-200/80 bg-white/75'} flex flex-col shadow-[0_12px_40px_rgba(15,23,42,0.06)]`}
  >
    <div className="mb-8">
      <h3 className="text-xl font-bold mb-2">{tier}</h3>
      <div className="flex items-baseline gap-1">
        <span className="text-4xl font-black">{price === 'Custom' ? '' : '$'}{price}</span>
        {price !== 'Custom' && <span className="text-muted-foreground font-medium">/user/mo</span>}
      </div>
      <p className="text-muted-foreground text-sm mt-4 leading-relaxed">{description}</p>
    </div>

    <div className="flex-1 space-y-4 mb-8">
      {features.map((f: string, i: number) => (
        <div key={i} className="flex items-start gap-3 text-sm">
          <div className="w-5 h-5 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0 mt-0.5">
            <Check className="w-3.5 h-3.5 text-emerald-500" />
          </div>
          <span className="text-foreground">{f}</span>
        </div>
      ))}
    </div>

    <Button 
      variant={highlight ? 'default' : 'outline'} 
      className={`w-full h-12 rounded-full font-bold ${!highlight && 'border-slate-200/80 bg-white/80 hover:bg-white'}`}
      onClick={onClick}
    >
      {buttonText} {highlight && <ArrowRight className="w-4 h-4 ml-2" />}
    </Button>
  </motion.div>
);

export default Pricing;
