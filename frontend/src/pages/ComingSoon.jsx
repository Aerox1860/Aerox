import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

/** Reusable "launching soon" placeholder for sports we haven't wired up yet. */
export default function ComingSoon({ title, tagline, icon: Icon, tint = "text-amber-300" }) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6">
      <div className="card-surface p-8 max-w-md w-full text-center" data-testid="coming-soon-card">
        <div className={`w-16 h-16 mx-auto mb-4 rounded-2xl bg-white/5 border border-white/10 grid place-items-center ${tint}`}>
          {Icon ? <Icon className="w-8 h-8" strokeWidth={2} /> : null}
        </div>
        <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Launching soon</div>
        <h1 className="font-heading font-black text-2xl sm:text-3xl mb-2">{title}</h1>
        <p className="text-slate-400 text-sm">{tagline}</p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-sm"
          data-testid="coming-soon-back"
        >
          <ArrowLeft className="w-4 h-4" /> Back to lobby
        </Link>
      </div>
    </div>
  );
}
