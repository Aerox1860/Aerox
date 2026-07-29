import { useState } from "react";
import { Mail, Copy, X, Send, LifeBuoy } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

const SUPPORT_EMAIL = "gowin365x@gmail.com";

export function ContactUsButton({ className = "" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className={`btn-ghost px-4 py-2.5 rounded-xl flex items-center gap-2 text-sm ${className}`} data-testid="contact-us-btn">
        <Mail className="w-4 h-4 text-cyan-300" /> Contact us
      </button>
      {open && <ContactUsModal onClose={() => setOpen(false)} />}
    </>
  );
}

function ContactUsModal({ onClose }) {
  const copy = () => {
    navigator.clipboard?.writeText(SUPPORT_EMAIL);
    toast.success("Email copied to clipboard");
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose} data-testid="contact-us-modal">
      <div className="card-surface p-6 w-full max-w-md relative" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-3 right-3 text-slate-400 hover:text-slate-100" data-testid="contact-us-close-btn">
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-green-500 grid place-items-center shadow-[0_0_20px_rgba(34,211,238,0.35)]">
            <Mail className="w-6 h-6 text-black" strokeWidth={2.5} />
          </div>
          <div>
            <div className="font-heading text-lg font-black">Reach out to us</div>
            <div className="text-xs text-slate-400">We usually respond within a few hours</div>
          </div>
        </div>

        <div className="mt-5 card-raised p-4">
          <div className="text-[11px] uppercase tracking-widest text-slate-400">Email us at</div>
          <div className="mt-1 font-mono text-xl font-bold neon-cyan break-all" data-testid="contact-us-email">
            {SUPPORT_EMAIL}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={copy} className="btn-ghost px-4 py-2 rounded-lg flex items-center gap-2 text-sm flex-1" data-testid="contact-copy-btn">
            <Copy className="w-4 h-4" /> Copy email
          </button>
          <a
            href={`mailto:${SUPPORT_EMAIL}?subject=AeroX%20support%20request`}
            className="btn-cyan px-4 py-2 rounded-lg flex items-center gap-2 text-sm flex-1 justify-center"
            data-testid="contact-mailto-btn"
          >
            <Send className="w-4 h-4" /> Open mail app
          </a>
        </div>

        <div className="mt-5 divider" />

        <Link to="/support" onClick={onClose} className="mt-4 block text-sm text-cyan-400 hover:text-cyan-300 flex items-center gap-1" data-testid="contact-support-form-link">
          <LifeBuoy className="w-4 h-4" /> Or submit a ticket in-app →
        </Link>

        <div className="mt-3 text-xs text-slate-500">
          When emailing, please include your <span className="text-slate-300">username</span>, the <span className="text-slate-300">amount</span>, and a <span className="text-slate-300">payment screenshot</span> so we can help faster.
        </div>
      </div>
    </div>
  );
}
