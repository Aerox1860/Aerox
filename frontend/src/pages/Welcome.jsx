import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  LogIn, UserPlus, Zap, Radio, Dices, Trophy, ShieldCheck, ArrowRight,
  Plane, Users, TrendingUp, Sparkles, Gift, Lock
} from "lucide-react";
import { api } from "@/lib/api";

/**
 * Dashboard-style landing page shown to logged-out visitors.
 * Mirrors the real Lobby layout (live-round peek, games grid, recent crashes)
 * but with prominent Login / Sign-up CTAs — so returning users see the app
 * they're about to unlock, not a marketing page.
 */
export default function Welcome() {
  const [history, setHistory] = useState([]);
  const [gs, setGs] = useState({ crash: true, roulette: true });

  useEffect(() => {
    // Public endpoints — safe to hit without a token
    api.get("/game/history").then((r) => setHistory(r.data || [])).catch(() => {});
    api.get("/games/status").then((r) => setGs(r.data || {})).catch(() => {});
  }, []);

  const lastCrash = history[0]?.crash_at ? history[0].crash_at.toFixed(2) + "x" : "-";

  return (
    <div className="relative min-h-screen text-slate-100 overflow-hidden pb-16">
      {/* Ambient glow */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-40 -left-40 w-[520px] h-[520px] rounded-full bg-amber-500/10 blur-[120px]" />
        <div className="absolute top-1/3 -right-40 w-[420px] h-[420px] rounded-full bg-cyan-500/10 blur-[120px]" />
        <div className="absolute bottom-0 left-1/4 w-[520px] h-[420px] rounded-full bg-emerald-500/10 blur-[120px]" />
      </div>

      {/* Top bar with brand + Auth CTAs */}
      <header className="sticky top-0 z-40 glass px-4 py-3 border-b border-white/5">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
          <div className="font-heading font-black text-lg sm:text-xl bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 bg-clip-text text-transparent" data-testid="welcome-brand">
            GoWin365
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg text-sm font-medium text-slate-100 border border-white/15 bg-white/5 hover:bg-white/10 hover:border-white/25 transition-colors"
              data-testid="header-login-btn"
            >
              <LogIn className="w-4 h-4" strokeWidth={2.5} />
              <span>Log in</span>
            </Link>
            <Link
              to="/register"
              className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold text-black bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 shadow-[0_6px_20px_rgba(250,204,21,0.28)] hover:shadow-[0_10px_28px_rgba(250,204,21,0.45)] transition-shadow"
              data-testid="header-signup-btn"
            >
              <UserPlus className="w-4 h-4" strokeWidth={2.5} />
              <span>Sign up</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-5 space-y-5">
        {/* Hero + live-round peek (mirrors Lobby) */}
        <section className="card-surface p-5 md:p-7 border border-amber-400/15" data-testid="welcome-hero">
          <div className="grid md:grid-cols-[1fr_auto] gap-6 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full border border-amber-400/25 bg-amber-500/10 text-amber-200 text-[10px] uppercase tracking-widest mb-3">
                <Zap className="w-3 h-3" /> Live now — 3 virtual matches in play
              </div>
              <h1 className="font-heading font-black tracking-tighter text-4xl sm:text-5xl bg-gradient-to-r from-amber-200 via-yellow-400 to-amber-500 bg-clip-text text-transparent leading-none" data-testid="welcome-title">
                GoWin365
              </h1>
              <p className="mt-3 text-slate-300 text-sm sm:text-base max-w-xl">
                Play. Win. Cash out. Crash · Roulette · Live &amp; Virtual Cricket — one lightning-fast wallet.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link to="/register" className="btn-primary px-5 py-3 rounded-xl flex items-center gap-2" data-testid="hero-signup-btn">
                  <Gift className="w-4 h-4 text-black" />
                  <span className="font-semibold">Sign up — get ₹50 bonus</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link to="/login" className="btn-ghost px-5 py-3 rounded-xl flex items-center gap-2" data-testid="hero-login-btn">
                  <LogIn className="w-4 h-4" />
                  <span>I already have an account</span>
                </Link>
              </div>
              <p className="mt-3 text-[10px] uppercase tracking-widest text-slate-500">
                18+ only · Play responsibly
              </p>
            </div>

            {/* Live crash peek */}
            <div className="min-w-[220px] rounded-xl border border-cyan-400/20 bg-cyan-500/5 p-4 text-center" data-testid="live-peek">
              <div className="text-[10px] uppercase tracking-widest text-slate-400 flex items-center justify-center gap-1">
                <Plane className="w-3 h-3 text-cyan-300" /> Crash · last round
              </div>
              <div className="font-mono font-black text-4xl text-cyan-300 mt-2">{lastCrash}</div>
              <div className="text-[11px] text-slate-500 mt-1">Provably fair · real-time WS</div>
            </div>
          </div>
        </section>

        {/* Recent crashes strip */}
        {history.length > 0 && (
          <section className="card-surface p-4" data-testid="recent-crashes">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-heading font-bold text-base">Recent crashes</h2>
              <div className="text-[10px] uppercase tracking-widest text-slate-500">last {Math.min(history.length, 15)}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              {history.slice(0, 15).map((h, i) => (
                <div
                  key={i}
                  className={`px-2.5 py-1 rounded-md text-xs font-mono border ${
                    h.crash_at >= 2
                      ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-200"
                      : "border-red-400/20 bg-red-500/5 text-red-200"
                  }`}
                >
                  {h.crash_at?.toFixed(2)}x
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Games grid preview */}
        <section data-testid="games-preview">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-heading font-bold text-lg">Games available inside</h2>
            <Link to="/login" className="text-xs text-cyan-300 hover:underline flex items-center gap-1" data-testid="games-see-all">
              Log in to play <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            <GameCard icon={Plane}  name="Crash"           tagline="Cash out before it crashes" gradient="from-cyan-500 to-green-500"    tint="text-cyan-300"    status={gs.crash ? "live" : "maintenance"} />
            <GameCard icon={Dices}  name="Roulette"        tagline="7 live tables · Red or Black" gradient="from-red-500 to-rose-700"     tint="text-red-300"     status={gs.roulette ? "live" : "maintenance"} />
            <GameCard icon={Radio}  name="Live Cricket"    tagline="Real matches · live scoreboard" gradient="from-emerald-500 to-teal-600" tint="text-emerald-300" status="live" />
            <GameCard icon={Trophy} name="Virtual Cricket" tagline="24×7 T20 · ball-by-ball odds"   gradient="from-amber-500 to-yellow-600" tint="text-amber-300"   status="live" />
            <GameCard icon={Sparkles} name="Mines"    tagline="Uncover gems · avoid bombs" gradient="from-orange-500 to-red-600"    tint="text-orange-300"  status="soon" />
            <GameCard icon={Dices}    name="Dice"     tagline="Roll for glory"             gradient="from-fuchsia-500 to-purple-600" tint="text-fuchsia-300" status="soon" />
            <GameCard icon={TrendingUp} name="Plinko" tagline="Drop the ball · chase peaks" gradient="from-teal-400 to-emerald-600" tint="text-teal-300"    status="soon" />
            <GameCard icon={Sparkles} name="Slots"    tagline="Neon 3-reel arcade"         gradient="from-pink-500 to-fuchsia-600"  tint="text-pink-300"    status="soon" />
          </div>
        </section>

        {/* Why us */}
        <section className="grid md:grid-cols-3 gap-3" data-testid="welcome-features">
          <FeatureCard icon={ShieldCheck} tint="text-emerald-300" title="Provably fair" body="SHA-256 server+client seed. Verify every round after crash." />
          <FeatureCard icon={Users}       tint="text-cyan-300"    title="Real-time multiplayer" body="Live chat, live bets, live scoreboards — no page reloads." />
          <FeatureCard icon={Gift}        tint="text-amber-300"   title="Instant ₹50 bonus" body="Sign up in 30 seconds. Bonus lands the moment you register." />
        </section>

        {/* Bottom CTA */}
        <section className="card-surface p-6 text-center border border-amber-400/15" data-testid="bottom-cta">
          <div className="font-heading font-black text-xl sm:text-2xl mb-2">
            Ready to play?
          </div>
          <p className="text-slate-400 text-sm mb-4">Create an account in 30 seconds — ₹50 lands in your wallet instantly.</p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Link to="/register" className="btn-primary px-6 py-3 rounded-xl flex items-center gap-2" data-testid="bottom-signup-btn">
              <UserPlus className="w-4 h-4" /> <span className="font-semibold">Sign up now</span>
            </Link>
            <Link to="/login" className="btn-ghost px-6 py-3 rounded-xl flex items-center gap-2" data-testid="bottom-login-btn">
              <LogIn className="w-4 h-4" /> <span>Log in</span>
            </Link>
          </div>
        </section>

        <footer className="pt-4 text-center text-[11px] text-slate-500" data-testid="welcome-footer">
          <div className="flex items-center justify-center gap-3">
            <span>© {new Date().getFullYear()} GoWin365 · gowin365x.com</span>
            <span className="text-slate-700">·</span>
            <Link to="/admin/login" className="hover:text-slate-300 flex items-center gap-1" data-testid="welcome-admin-link">
              <ShieldCheck className="w-3 h-3" /> Admin
            </Link>
          </div>
        </footer>
      </main>
    </div>
  );
}

function GameCard({ icon: Icon, name, tagline, gradient, tint, status }) {
  const isLive = status === "live";
  const isSoon = status === "soon";
  return (
    <Link
      to={isLive ? "/login" : "/register"}
      className="group relative card-surface p-4 overflow-hidden hover:border-white/20 transition-colors"
      data-testid={`game-card-${name.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <div className={`absolute -top-8 -right-8 w-24 h-24 rounded-full bg-gradient-to-br ${gradient} opacity-20 blur-2xl group-hover:opacity-30 transition-opacity`} />
      <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${gradient} grid place-items-center mb-3 shadow-lg`}>
        <Icon className="w-5 h-5 text-black" strokeWidth={2.5} />
      </div>
      <div className="font-heading font-bold text-sm">{name}</div>
      <div className="text-xs text-slate-400 mt-0.5 leading-snug">{tagline}</div>
      <div className="mt-3 flex items-center justify-between">
        {isLive && (
          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-emerald-300">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live
          </span>
        )}
        {isSoon && (
          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-slate-500">
            <Lock className="w-2.5 h-2.5" /> Soon
          </span>
        )}
        {status === "maintenance" && (
          <span className="text-[10px] uppercase tracking-widest text-amber-300">Maintenance</span>
        )}
        <span className={`text-xs ${tint} opacity-0 group-hover:opacity-100 transition-opacity`}>→</span>
      </div>
    </Link>
  );
}

function FeatureCard({ icon: Icon, tint, title, body }) {
  return (
    <div className="card-surface p-4">
      <Icon className={`w-5 h-5 ${tint}`} strokeWidth={2} />
      <div className="font-heading font-bold text-sm mt-2">{title}</div>
      <div className="text-xs text-slate-400 mt-1 leading-relaxed">{body}</div>
    </div>
  );
}
