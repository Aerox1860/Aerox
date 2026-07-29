import { useState } from "react";
import { Mail, Copy, X } from "lucide-react";
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
    toast.success("Email copied");
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose} data-testid="contact-us-modal">
      <div className="card-surface p-6 w-full max-w-sm relative" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-3 right-3 text-slate-400 hover:text-slate-100" data-testid="contact-us-close-btn">
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-cyan-500 to-green-500 grid place-items-center">
            <Mail className="w-5 h-5 text-black" strokeWidth={2.5} />
          </div>
          <div className="font-heading text-lg font-black">Contact us</div>
        </div>

        <div className="card-raised p-4 flex items-center justify-between gap-3">
          <div className="font-mono text-lg font-bold neon-cyan break-all" data-testid="contact-us-email">
            {SUPPORT_EMAIL}
          </div>
          <button onClick={copy} className="btn-ghost p-2 rounded-lg flex-shrink-0" title="Copy" data-testid="contact-copy-btn">
            <Copy className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
