import { Link } from "react-router-dom";
import { LogIn, UserPlus, Zap, Radio, Dices, Trophy, ShieldCheck, ArrowRight } from "lucide-react";

/**
 * Welcome / landing page shown when an unauthenticated visitor lands on the site.
 * Hero + gold GoWin365 wordmark + two big CTAs (Login / Sign up).
 * Adds a short feature strip to hint at what's inside without giving away the store.
 */
export default function Welcome() {
  return (
    <div className="relative min-h-screen text-slate-100 overflow-hidden">
      {/* Ambient glow */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-40 -left-40 w-[520px] h-[520px] rounded-full bg-amber-500/10 blur-[120px]" />
        <div className="absolute top-1/3 -right-40 w-[420px] h-[420px] rounded-full bg-cyan-500/10 blur-[120px]" />
        <div className="absolute bottom-0 left-1/4 w-[520px] h-[420px] rounded-full bg-emerald-500/10 blur-[120px]" />
      </div>

      {/* Top bar */}
      <header className="max-w-6xl mx-auto px-5 pt-6 flex items-center justify-between">
        <div className="font-heading font-black text-lg bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 bg-clip-text text-transparent" data-testid="welcome-brand">
          GoWin365
        </div>
        <Link
          to="/admin/login"
          className="text-[11px] uppercase tracking-widest text-slate-400 hover:text-slate-200 flex items-center gap-1"
          data-testid="welcome-admin-link"
        >
          <ShieldCheck className="w-3.5 h-3.5" /> Admin
        </Link>
      </header>

      {/* Hero */}
      <section className="max-w-3xl mx-auto px-5 pt-14 pb-8 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-amber-400/25 bg-amber-500/10 text-amber-200 text-[11px] uppercase tracking-widest mb-6" data-testid="welcome-eyebrow">
          <Zap className="w-3.5 h-3.5" /> Live now — 3 virtual matches in play
        </div>
        <h1
          className="font-heading font-black tracking-tighter text-5xl sm:text-6xl bg-gradient-to-r from-amber-200 via-yellow-400 to-amber-500 bg-clip-text text-transparent leading-none"
          data-testid="welcome-title"
        >
          GoWin365
        </h1>
        <p className="mt-4 text-slate-300/90 text-base sm:text-lg max-w-xl mx-auto" data-testid="welcome-tagline">
          Play. Win. Cash out. Crash · Roulette · Live &amp; Virtual Cricket — one lightning-fast wallet.
        </p>

        {/* CTAs */}
        <div className="mt-9 flex flex-col sm:flex-row items-stretch justify-center gap-3">
          <Link
            to="/login"
            className="group inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl font-semibold text-black bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 shadow-[0_10px_30px_rgba(250,204,21,0.35)] hover:shadow-[0_16px_36px_rgba(250,204,21,0.5)] transition-shadow"
            data-testid="welcome-login-btn"
          >
            <LogIn className="w-4 h-4" strokeWidth={2.5} />
            <span>Log in</span>
            <ArrowRight className="w-4 h-4 opacity-70 group-hover:translate-x-0.5 transition-transform" />
          </Link>
          <Link
            to="/register"
            className="group inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl font-semibold text-slate-100 border border-white/15 bg-white/5 hover:bg-white/10 hover:border-white/25 transition-colors"
            data-testid="welcome-register-btn"
          >
            <UserPlus className="w-4 h-4" strokeWidth={2.5} />
            <span>Sign up</span>
            <span className="ml-1 px-2 py-0.5 text-[10px] rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-400/25">
              ₹50 bonus
            </span>
          </Link>
        </div>

        <p className="mt-5 text-[11px] uppercase tracking-widest text-slate-500" data-testid="welcome-legal">
          18+ only · Play responsibly
        </p>
      </section>

      {/* Feature strip */}
      <section className="max-w-5xl mx-auto px-5 pb-14">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { icon: Zap,    label: "Crash",           tint: "text-cyan-300",    ring: "border-cyan-400/25 bg-cyan-500/5"    },
            { icon: Dices,  label: "Roulette",        tint: "text-red-300",     ring: "border-red-400/25 bg-red-500/5"      },
            { icon: Radio,  label: "Live Cricket",    tint: "text-emerald-300", ring: "border-emerald-400/25 bg-emerald-500/5" },
            { icon: Trophy, label: "Virtual Cricket", tint: "text-amber-300",   ring: "border-amber-400/25 bg-amber-500/5"  },
          ].map((f) => (
            <div
              key={f.label}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${f.ring}`}
              data-testid={`welcome-feature-${f.label.toLowerCase().replace(/\s+/g, "-")}`}
            >
              <f.icon className={`w-5 h-5 ${f.tint}`} strokeWidth={2} />
              <span className="text-sm font-medium text-slate-200">{f.label}</span>
            </div>
          ))}
        </div>
      </section>

      <footer className="pb-8 text-center text-[11px] text-slate-500">
        <span data-testid="welcome-footer">© {new Date().getFullYear()} GoWin365 · gowin365x.com</span>
      </footer>
    </div>
  );
}
