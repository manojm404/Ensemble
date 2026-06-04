import { motion } from "framer-motion";
import { Lightbulb, Code, Palette, Megaphone, CheckCircle2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

const Solutions = () => {
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
            Solutions for Every <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent to-blue-400">Department</span>
          </motion.h1>
          <motion.p 
            className="text-xl text-muted-foreground"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            Esemble isn't just for developers. Our pre-trained agents map directly to your organizational structure, ready to take on department-specific workloads.
          </motion.p>
        </div>

        <div className="space-y-32">
          {/* Engineering */}
          <SolutionSection 
            title="Engineering & DevOps"
            icon={Code}
            color="text-blue-400"
            bg="bg-blue-500/10"
            border="border-blue-500/20"
            description="Accelerate your sprint velocity. Esemble agents can review PRs, generate unit tests, architect system designs, and even monitor production logs."
            agents={["Senior Backend Architect", "Smart Contract Developer", "Site Reliability Engineer", "QA Automation Tester"]}
            image="https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&q=80&w=800"
            reverse={false}
          />

          {/* Marketing */}
          <SolutionSection 
            title="Growth & Marketing"
            icon={Megaphone}
            color="text-emerald-400"
            bg="bg-emerald-500/10"
            border="border-emerald-500/20"
            description="Automate your entire content pipeline. From SEO research to social media scheduling, our marketing agents work 24/7 to grow your audience."
            agents={["Technical SEO Lead", "TikTok Content Strategist", "Programmatic Media Buyer", "B2B Thought Leader"]}
            image="https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80&w=800"
            reverse={true}
          />

          {/* Product & Design */}
          <SolutionSection 
            title="Product & Design"
            icon={Palette}
            color="text-amber-400"
            bg="bg-amber-500/10"
            border="border-amber-500/20"
            description="Turn user feedback into shipped features faster. Agents can synthesize user research, draft PRDs, and generate UI/UX design tokens."
            agents={["UX Research Lead", "Agile Sprint Strategist", "Behavioral Psychology Designer", "Visual Narrative Designer"]}
            image="https://images.unsplash.com/photo-1581291518857-4e27b48ff24e?auto=format&fit=crop&q=80&w=800"
            reverse={false}
          />
        </div>

        <div className="mt-32 text-center">
        <Button size="lg" className="rounded-full px-8 font-bold h-14 shadow-[0_12px_40px_rgba(15,23,42,0.08)]" onClick={() => navigate('/auth')}>
            Explore All 180+ Agents <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
        </div>
      </div>
    </div>
  );
};

const SolutionSection = ({ title, description, agents, image, reverse, icon: Icon, color, bg, border }: any) => (
  <motion.div 
    initial={{ opacity: 0, y: 40 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: "-100px" }}
    className={`flex flex-col ${reverse ? 'lg:flex-row-reverse' : 'lg:flex-row'} gap-12 items-center`}
  >
    <div className="flex-1 space-y-6">
      <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full ${bg} ${border} ${color} text-sm font-bold`}>
        <Icon className="w-4 h-4" /> {title}
      </div>
      <h2 className="text-3xl md:text-4xl font-black">{title} Automation</h2>
      <p className="text-lg text-muted-foreground leading-relaxed">{description}</p>
      
      <div className="pt-4">
        <h4 className="text-sm font-bold uppercase tracking-widest text-foreground/50 mb-4">Popular Agents in this Category</h4>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {agents.map((agent: string, i: number) => (
            <li key={i} className="flex items-center gap-2 text-sm font-medium">
              <CheckCircle2 className={`w-4 h-4 ${color}`} /> {agent}
            </li>
          ))}
        </ul>
      </div>
    </div>
    <div className="flex-1 w-full">
      <div className="aspect-[4/3] rounded-3xl overflow-hidden border border-slate-200/80 relative group shadow-[0_12px_40px_rgba(15,23,42,0.06)]">
        <div className="absolute inset-0 bg-white/10 group-hover:bg-transparent transition-colors z-10" />
        <img src={image} alt={title} className="object-cover w-full h-full grayscale-[35%] group-hover:grayscale-0 transition-all duration-700 group-hover:scale-105" />
      </div>
    </div>
  </motion.div>
);

export default Solutions;
