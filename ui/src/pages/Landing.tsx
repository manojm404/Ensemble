import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { 
  ArrowRight, Bot, Workflow, Zap, Shield, Sparkles, 
  Code2, BarChart3, Users, ChevronRight, CheckCircle2, Globe, FileText, Blocks
} from "lucide-react";

const Landing = () => {
  const navigate = useNavigate();

  const fadeIn = {
    initial: { opacity: 0, y: 20 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true },
    transition: { duration: 0.6 }
  };

  const staggerContainer = {
    whileInView: {
      transition: { staggerChildren: 0.1 }
    },
    viewport: { once: true }
  };

  return (
    <div className="w-full overflow-hidden bg-[linear-gradient(180deg,#e8edf3_0%,#eef2f7_100%)] font-sans text-foreground">
      {/* Background decorations */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-primary/20 rounded-full blur-[150px] pointer-events-none" />
      <div className="absolute top-[30%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 rounded-full blur-[150px] pointer-events-none" />

      {/* --- HERO SECTION --- */}
      <section className="relative pt-32 pb-20 md:pt-48 md:pb-32 px-6 max-w-7xl mx-auto flex flex-col lg:flex-row items-center gap-12 z-10">
        <div className="flex-1 text-center lg:text-left">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary mb-8 text-sm font-bold tracking-wide"
          >
            <Sparkles className="w-4 h-4" />
            <span>Esemble OS 1.0 is Live</span>
          </motion.div>

          <motion.h1
            className="text-5xl md:text-7xl font-black tracking-tighter text-foreground leading-[1.1] mb-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            The Operating System for your <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-blue-400 to-accent">AI Workforce</span>
          </motion.h1>

          <motion.p
            className="text-xl text-foreground/80 mb-10 max-w-2xl mx-auto lg:mx-0 leading-relaxed"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            Scale your company infinitely without adding headcount. Deploy specialized AI agents, orchestrate complex workflows, and automate your entire business backend.
          </motion.p>

          <motion.div
            className="flex flex-col sm:flex-row items-center gap-4 justify-center lg:justify-start"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            <Button
              size="lg"
              className="h-14 px-8 text-lg font-bold rounded-full shadow-[0_0_30px_rgba(var(--primary),0.3)] hover:shadow-[0_0_40px_rgba(var(--primary),0.5)] transition-all w-full sm:w-auto"
              onClick={() => navigate('/auth')}
            >
              Start Free Trial <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
            <Button
              size="lg"
              variant="outline"
            className="h-14 px-8 text-lg font-bold rounded-full border-border/60 bg-background/75 hover:bg-background backdrop-blur-md transition-all w-full sm:w-auto"
              onClick={() => navigate('/about')}
            >
              Book a Demo
            </Button>
          </motion.div>
          
          <motion.div 
            className="mt-10 flex items-center justify-center lg:justify-start gap-4 text-sm font-medium text-foreground/70"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 0.8 }}
          >
            <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> No credit card required</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> 14-day enterprise trial</span>
          </motion.div>
        </div>

        {/* Hero Visual - Abstract Dashboard Representation */}
        <motion.div 
          className="flex-1 w-full max-w-[600px] lg:max-w-none relative"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, delay: 0.3 }}
        >
          <div className="relative rounded-2xl border border-border/60 bg-card/85 backdrop-blur-xl shadow-2xl overflow-hidden aspect-[4/3] flex flex-col">
            <div className="h-12 border-b border-border/60 flex items-center px-4 gap-2 bg-muted/50">
              <div className="flex gap-1.5"><div className="w-3 h-3 rounded-full bg-rose-500/80"/><div className="w-3 h-3 rounded-full bg-amber-500/80"/><div className="w-3 h-3 rounded-full bg-emerald-500/80"/></div>
              <div className="ml-4 h-6 w-64 bg-muted/80 rounded-md" />
            </div>
            <div className="flex-1 p-6 flex gap-6">
              <div className="w-1/3 flex flex-col gap-4">
                <div className="h-24 rounded-xl border border-primary/20 bg-primary/5 flex items-center justify-center"><Bot className="w-8 h-8 text-primary/50" /></div>
                <div className="h-24 rounded-xl border border-border/60 bg-background/75" />
                <div className="h-24 rounded-xl border border-border/60 bg-background/75" />
              </div>
              <div className="w-2/3 border border-border/60 bg-muted/40 rounded-xl relative overflow-hidden p-6">
                 {/* Fake nodes connecting */}
                 <div className="absolute top-1/4 left-1/4 w-12 h-12 rounded-lg bg-blue-500/20 border border-blue-500/40" />
                 <div className="absolute top-1/2 right-1/4 w-12 h-12 rounded-lg bg-emerald-500/20 border border-emerald-500/40" />
                 <svg className="absolute inset-0 w-full h-full stroke-slate-300 pointer-events-none" preserveAspectRatio="none" viewBox="0 0 100 100" fill="none">
                   <path d="M 30 35 C 50 35, 50 60, 70 60" strokeWidth="1" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
                 </svg>
              </div>
            </div>
          </div>
          {/* Floating badge */}
          <motion.div 
            animate={{ y: [0, -10, 0] }}
            transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
            className="absolute -bottom-6 -left-6 p-4 rounded-xl bg-card/90 border border-border/60 shadow-xl flex items-center gap-4"
          >
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center"><Zap className="w-6 h-6 text-emerald-500" /></div>
            <div>
              <p className="text-xs text-foreground/70 font-bold uppercase tracking-wider">Productivity</p>
              <p className="text-xl font-black">+400%</p>
            </div>
          </motion.div>
        </motion.div>
      </section>

      {/* --- TRUST BADGES --- */}
      <section className="py-12 border-y border-border/60 bg-background/70">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <p className="text-sm font-bold text-foreground/65 uppercase tracking-widest mb-8">Trusted by forward-thinking engineering teams</p>
          <div className="flex flex-wrap justify-center gap-12 md:gap-24 opacity-40 grayscale">
            {/* Placeholder Logos for Demo */}
            <div className="flex items-center gap-2 font-black text-xl"><Globe className="w-6 h-6"/> GlobalCorp</div>
            <div className="flex items-center gap-2 font-black text-xl"><Blocks className="w-6 h-6"/> BlockTech</div>
            <div className="flex items-center gap-2 font-black text-xl"><Shield className="w-6 h-6"/> SecureNet</div>
            <div className="flex items-center gap-2 font-black text-xl"><BarChart3 className="w-6 h-6"/> DataFlow</div>
          </div>
        </div>
      </section>

      {/* --- CORE PILLARS (Features) --- */}
      <section className="py-32 px-6 relative z-10">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20">
            <h2 className="text-4xl md:text-5xl font-black tracking-tight mb-6">Built for the Enterprise</h2>
            <p className="text-xl text-foreground/80 max-w-3xl mx-auto">
              We've abstracted away the complexity of LLMs, prompts, and memory management. You focus on the business logic; we handle the intelligence.
            </p>
          </div>

          <motion.div
            variants={staggerContainer}
            initial="initial"
            whileInView="whileInView"
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8"
          >
            <FeatureCard
              icon={Bot}
              title="180+ Specialized Agents"
              description="Access our marketplace of pre-trained agents—from Senior Backend Engineers to Digital Marketers—ready to deploy instantly."
            />
            <FeatureCard
              icon={Workflow}
              title="Visual DAG Editor"
              description="Design complex, multi-step workflows using our drag-and-drop Directed Acyclic Graph (DAG) canvas. No coding required."
            />
            <FeatureCard
              icon={Code2}
              title="Bring Your Own Code"
              description="Seamlessly integrate custom Python, Node, or Go scripts into your workflows. Extend capabilities infinitely."
            />
            <FeatureCard
              icon={Shield}
              title="Bank-Grade Security"
              description="SOC2 compliant infrastructure. Strict Role-Based Access Control (RBAC) and total data isolation between agent runs."
            />
            <FeatureCard
              icon={BarChart3}
              title="Real-Time Analytics"
              description="Monitor agent performance, track token usage, and optimize costs with granular, real-time telemetry dashboards."
            />
            <FeatureCard
              icon={Users}
              title="Human-in-the-Loop"
              description="Pause workflows for human approval. Ensure high-stakes decisions are always verified by your team before execution."
            />
          </motion.div>
        </div>
      </section>

      {/* --- HOW IT WORKS --- */}
      <section className="py-32 px-6 bg-background/70 border-y border-border/60 relative">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col lg:flex-row gap-16 items-center">
            <div className="flex-1 space-y-12">
              <div>
                <h2 className="text-4xl md:text-5xl font-black tracking-tight mb-6">How Esemble Works</h2>
                <p className="text-xl text-foreground/80">Go from idea to automated execution in minutes, not months.</p>
              </div>

              <div className="space-y-8">
                <Step number="01" title="Select your Agents" description="Choose from our library of specialized AI workers or build your own custom agents tailored to your specific domain." />
                <Step number="02" title="Connect the Pipeline" description="Wire them together in the visual editor. Define how data flows from one agent to the next." />
                <Step number="03" title="Deploy & Monitor" description="Hit run. Watch as agents collaborate in real-time to solve complex tasks. Review the final generated artifacts." />
              </div>
            </div>
            <div className="flex-1 w-full">
              {/* Mock UI window for "How it works" */}
              <div className="rounded-2xl border border-border/60 bg-card/80 p-2 shadow-2xl">
                <div className="rounded-xl border border-border/60 bg-muted/30 overflow-hidden aspect-[4/3] flex flex-col relative">
                  {/* Decorative workflow lines */}
                  <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-5" />
                  <div className="p-8 flex flex-col justify-center h-full gap-8">
                     <div className="flex items-center gap-4 p-4 rounded-xl border border-primary/30 bg-primary/5 w-3/4">
                       <Bot className="text-primary" /> <span className="font-bold text-sm">Data Analyst Agent</span>
                     </div>
                     <div className="flex items-center gap-4 p-4 rounded-xl border border-blue-500/30 bg-blue-500/5 w-3/4 self-end">
                       <FileText className="text-blue-400" /> <span className="font-bold text-sm">Report Writer Agent</span>
                     </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* --- CTA SECTION --- */}
      <section className="py-32 px-6 relative z-10">
        <div className="max-w-5xl mx-auto text-center">
          <motion.div 
            className="p-12 md:p-20 rounded-[3rem] border border-border/60 bg-gradient-to-b from-card/90 to-background/90 relative overflow-hidden"
            {...fadeIn}
          >
            <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-10 mix-blend-overlay" />
            
            <h2 className="text-4xl md:text-6xl font-black tracking-tight mb-8 relative z-10">
              Ready to automate your operations?
            </h2>
            <p className="text-xl text-foreground/80 mb-12 max-w-2xl mx-auto relative z-10">
              Join leading companies orchestrating their future with Esemble. Stop doing manual work and start managing intelligent systems.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center relative z-10">
              <Button
                size="lg"
                className="h-16 px-10 text-xl font-bold rounded-full shadow-[0_0_30px_rgba(15,23,42,0.12)] hover:scale-105 transition-transform"
                onClick={() => navigate('/auth')}
              >
                Create Free Account
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-16 px-10 text-xl font-bold rounded-full border-border/60 bg-background/75 hover:bg-background transition-transform"
                onClick={() => navigate('/about')}
              >
                Contact Sales
              </Button>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
};

// --- Helper Components ---

const FeatureCard = ({ icon: Icon, title, description }: { icon: any, title: string, description: string }) => {
  return (
    <motion.div
      variants={{
        initial: { opacity: 0, y: 20 },
        whileInView: { opacity: 1, y: 0, transition: { duration: 0.5 } }
      }}
      className="p-8 rounded-3xl border border-border/60 bg-card/85 backdrop-blur-sm hover:bg-card hover:border-border transition-all duration-300 group shadow-[0_12px_40px_rgba(15,23,42,0.06)]"
    >
      <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-6 group-hover:scale-110 group-hover:bg-primary/20 transition-all">
        <Icon className="w-7 h-7 text-primary" />
      </div>
      <h3 className="text-2xl font-bold text-foreground mb-3">{title}</h3>
      <p className="text-foreground/75 leading-relaxed text-base">{description}</p>
    </motion.div>
  );
};

const Step = ({ number, title, description }: { number: string, title: string, description: string }) => (
  <div className="flex gap-6 group">
    <div className="flex flex-col items-center">
      <div className="w-12 h-12 rounded-full border-2 border-border/60 bg-background/80 flex items-center justify-center font-black text-foreground group-hover:bg-foreground group-hover:text-background transition-colors">
        {number}
      </div>
      <div className="w-0.5 h-full bg-border my-2 group-last:hidden" />
    </div>
    <div className="pb-8">
      <h3 className="text-2xl font-bold mb-2 text-foreground">{title}</h3>
      <p className="text-foreground/75 text-lg">{description}</p>
    </div>
  </div>
);

export default Landing;
