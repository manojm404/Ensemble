import { motion } from "framer-motion";
import { ShieldCheck, Server, Lock, Fingerprint, Database, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

const Enterprise = () => {
  const navigate = useNavigate();

  return (
    <div className="w-full min-h-screen bg-[linear-gradient(180deg,#e8edf3_0%,#eef2f7_100%)] font-sans pt-32 pb-20 text-foreground">
      <div className="max-w-7xl mx-auto px-6">
        
        {/* Header */}
        <div className="text-center max-w-4xl mx-auto mb-24">
          <motion.div 
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mb-6 text-sm font-bold"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <ShieldCheck className="w-4 h-4" /> Enterprise Grade
          </motion.div>
          <motion.h1 
            className="text-5xl md:text-7xl font-black tracking-tighter mb-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            Security is our <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-200">First Feature</span>
          </motion.h1>
          <motion.p 
            className="text-xl text-muted-foreground leading-relaxed"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            Deploy AI at scale without compromising your data. Esemble provides granular access controls, comprehensive audit logs, and on-premise deployment options for the world's most demanding organizations.
          </motion.p>
        </div>

        {/* Security Features */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-24">
          <SecurityCard 
            icon={Lock}
            title="Role-Based Access Control (RBAC)"
            description="Define exactly who can build workflows, who can approve execution steps, and who can view results. Our deep governance model ensures zero unauthorized access."
          />
          <SecurityCard 
            icon={Fingerprint}
            title="Immutable Audit Trails"
            description="Every agent action, API call, and human approval is cryptographically logged. Generate SOC2 and HIPAA compliant reports at the click of a button."
          />
          <SecurityCard 
            icon={Database}
            title="Zero Data Retention"
            description="When processing sensitive workflows, opt-in to Ephemeral Mode. Data is processed in memory and wiped immediately upon completion. We don't train on your data."
          />
          <SecurityCard 
            icon={Server}
            title="VPC & On-Prem Deployment"
            description="Need absolute control? Deploy the entire Esemble Engine within your own Virtual Private Cloud. Air-gapped execution for maximum security."
          />
        </div>

        {/* Compliance Checklist */}
        <div className="max-w-4xl mx-auto border border-slate-200/80 rounded-3xl bg-white/75 p-8 md:p-12 mb-24 shadow-[0_12px_40px_rgba(15,23,42,0.06)]">
          <h3 className="text-2xl font-bold mb-8 text-center">Compliance Readiness</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Checklist item="SOC 2 Type II Certified infrastructure" />
            <Checklist item="GDPR & CCPA compliant data handling" />
            <Checklist item="End-to-end AES-256 encryption at rest" />
            <Checklist item="TLS 1.3 encryption in transit" />
            <Checklist item="SAML & SSO (Okta, Azure AD) integration" />
            <Checklist item="Automated secret redaction in logs" />
          </div>
        </div>

        <div className="text-center">
          <Button size="lg" className="rounded-full px-8 font-bold h-14" onClick={() => navigate('/auth')}>
            Contact Enterprise Sales
          </Button>
        </div>

      </div>
    </div>
  );
};

const SecurityCard = ({ icon: Icon, title, description }: any) => (
  <motion.div 
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true }}
    className="p-8 rounded-3xl border border-slate-200/80 bg-white/75 flex items-start gap-6 shadow-[0_12px_40px_rgba(15,23,42,0.06)]"
  >
    <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
      <Icon className="w-6 h-6 text-emerald-400" />
    </div>
    <div>
      <h3 className="text-xl font-bold mb-2 text-foreground">{title}</h3>
      <p className="text-muted-foreground leading-relaxed text-sm">{description}</p>
    </div>
  </motion.div>
);

const Checklist = ({ item }: { item: string }) => (
  <div className="flex items-center gap-3 text-sm font-medium text-muted-foreground">
    <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
    {item}
  </div>
);

export default Enterprise;
