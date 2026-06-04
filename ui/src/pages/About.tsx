
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { ArrowRight, Terminal, Cpu, Network } from 'lucide-react';

const About = () => {
  const navigate = useNavigate();

  return (
    <div className="w-full min-h-screen bg-[linear-gradient(180deg,#e8edf3_0%,#eef2f7_100%)] relative overflow-hidden flex flex-col items-center justify-center py-32 px-4 text-foreground">
      {/* Background decoration */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-[100px] pointer-events-none" />
      
      <div className="max-w-4xl w-full text-center relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <h1 className="text-5xl md:text-6xl font-black tracking-tighter mb-6 text-foreground drop-shadow-sm">
            Orchestrating <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">Intelligence</span>
          </h1>
          <p className="text-xl text-muted-foreground mb-12 max-w-2xl mx-auto leading-relaxed">
            Esemble isn't just another tool; it's the operating system for your automated workforce. We empower teams to build, deploy, and manage specialized AI agents that work together in perfect harmony.
          </p>
        </motion.div>

        <motion.div 
          className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16 text-left"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <div className="p-8 rounded-3xl border border-slate-200/80 bg-white/75 backdrop-blur-md shadow-[0_12px_40px_rgba(15,23,42,0.06)]">
            <Terminal className="w-8 h-8 text-primary mb-4" />
            <h3 className="text-xl font-bold mb-2">Developer First</h3>
            <p className="text-sm text-muted-foreground">Built for engineers. Extensible architecture, local execution options, and comprehensive API access.</p>
          </div>
          <div className="p-8 rounded-3xl border border-slate-200/80 bg-white/75 backdrop-blur-md shadow-[0_12px_40px_rgba(15,23,42,0.06)]">
            <Network className="w-8 h-8 text-accent mb-4" />
            <h3 className="text-xl font-bold mb-2">Seamless Integration</h3>
            <p className="text-sm text-muted-foreground">Connect agents to your existing workflows. Drag-and-drop pipeline creation for complex tasks.</p>
          </div>
          <div className="p-8 rounded-3xl border border-slate-200/80 bg-white/75 backdrop-blur-md shadow-[0_12px_40px_rgba(15,23,42,0.06)]">
            <Cpu className="w-8 h-8 text-indigo-400 mb-4" />
            <h3 className="text-xl font-bold mb-2">High Performance</h3>
            <p className="text-sm text-muted-foreground">Scalable infrastructure designed to handle intensive reasoning tasks and massive concurrent agent executions.</p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 0.4 }}
        >
          <Button
            size="lg"
            className="h-14 px-8 text-lg font-bold rounded-2xl shadow-[0_0_20px_rgba(15,23,42,0.12)] hover:shadow-[0_0_30px_rgba(15,23,42,0.18)] transition-all"
            onClick={() => navigate('/auth')}
          >
            Start Your Free Trial <ArrowRight className="ml-2 w-5 h-5" />
          </Button>
        </motion.div>
      </div>
    </div>
  );
};

export default About;
