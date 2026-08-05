import { Outlet, NavLink, useNavigate, Link } from "react-router-dom";
import { useState } from "react";
import {
  Home, Gamepad2, Wallet as WalletIcon, Radio, User, LogOut,
  Menu, X, Trophy, Share2, LifeBuoy, ChevronRight, Zap, Dices,
  Plane, Trophy as HorseIcon, Sparkles as SparklesIcon
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const items = [
  { to: "/", label: "Lobby", icon: Home, testid: "nav-lobby" },
  { to: "/games", label: "Games", icon: Gamepad2, testid: "nav-games" },
  { to: "/wallet", label: "Wallet", icon: WalletIcon, testid: "nav-wallet" },
  { to: "/in-play", label: "In-Play", icon: Radio, testid: "nav-inplay" },
  { to: "/profile", label: "Me", icon: User, testid: "nav-profile" },
];

// Sections shown in the header side-drawer (matches user's spec:
// Cricket · Football · Horse Racing · Casino · Aviator · Support · Logout)
const drawerSections = [
  {
    title: "Sports",
    items: [
      { to: "/in-play",       label: "Cricket · Live",     icon: Radio },
      { to: "/virtual",       label: "Cricket · Virtual",  icon: Zap },
      { to: "/football",      label: "Football",           icon: SparklesIcon, badge: "Soon" },
      { to: "/horse-racing",  label: "Horse Racing",       icon: HorseIcon,   badge: "Soon" },
    ],
  },
  {
    title: "Casino",
    items: [
      { to: "/games",           label: "All Casino Games", icon: Gamepad2 },
      { to: "/aviator",         label: "Aviator",          icon: Plane },
      { to: "/games/roulette",  label: "Roulette",         icon: Dices },
    ],
  },
  {
    title: "Account",
    items: [
      { to: "/wallet",       label: "Wallet",       icon: WalletIcon },
      { to: "/profile",      label: "Profile",      icon: User },
      { to: "/referrals",    label: "Referrals",    icon: Share2 },
      { to: "/leaderboard",  label: "Leaderboard",  icon: Trophy },
      { to: "/support",      label: "Support",      icon: LifeBuoy },
    ],
  },
];

export default function PlayerLayout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const closeDrawer = () => setDrawerOpen(false);
  const doLogout = () => { closeDrawer(); logout(); nav("/login"); };

  return (
    <div className="min-h-screen text-slate-100 pb-24">
      {/* Top bar */}
      <header className="sticky top-0 z-40 glass px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDrawerOpen(true)}
            className="w-9 h-9 rounded-lg grid place-items-center bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
            data-testid="open-menu-btn"
            aria-label="Open menu"
          >
            <Menu className="w-4 h-4 text-slate-200" strokeWidth={2.5} />
          </button>
          <Link to="/" className="font-heading font-black tracking-tight text-lg bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 bg-clip-text text-transparent" data-testid="brand-text">
            GoWin365
          </Link>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right" data-testid="topbar-balance">
            <div className="text-[10px] uppercase tracking-widest text-slate-400">Balance</div>
            <div className="font-mono font-bold text-cyan-300">₹ {user?.balance?.toFixed(2)}</div>
          </div>
          <button
            onClick={doLogout}
            className="btn-ghost px-3 py-2 rounded-lg text-xs flex items-center gap-1"
            data-testid="logout-btn"
          >
            <LogOut className="w-3.5 h-3.5" /> Logout
          </button>
        </div>
      </header>

      {/* Side drawer */}
      {drawerOpen && (
        <>
          <div
            className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm animate-in fade-in duration-150"
            onClick={closeDrawer}
            data-testid="drawer-backdrop"
          />
          <aside
            className="fixed left-0 top-0 bottom-0 z-[61] w-[84vw] max-w-[320px] bg-[#0b1120] border-r border-white/10 shadow-2xl overflow-y-auto animate-in slide-in-from-left duration-200"
            data-testid="side-drawer"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-4 bg-[#0b1120] border-b border-white/10">
              <div className="flex flex-col">
                <span className="font-heading font-black text-lg bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 bg-clip-text text-transparent">
                  GoWin365
                </span>
                <span className="text-[10px] uppercase tracking-widest text-slate-500">Menu</span>
              </div>
              <button
                onClick={closeDrawer}
                className="w-8 h-8 rounded-lg grid place-items-center bg-white/5 hover:bg-white/10 border border-white/10"
                data-testid="close-menu-btn"
                aria-label="Close menu"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-2 py-3 space-y-4">
              {drawerSections.map((sec) => (
                <div key={sec.title}>
                  <div className="px-3 pb-1 text-[10px] uppercase tracking-widest text-slate-500 font-semibold">
                    {sec.title}
                  </div>
                  <div className="space-y-1">
                    {sec.items.map((it) => (
                      <NavLink
                        key={it.to}
                        to={it.to}
                        end={it.to === "/"}
                        onClick={closeDrawer}
                        data-testid={`drawer-link-${it.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                        className={({ isActive }) =>
                          `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                            isActive
                              ? "bg-cyan-500/15 text-cyan-200 border border-cyan-400/20"
                              : "text-slate-300 hover:bg-white/5 hover:text-white"
                          }`
                        }
                      >
                        {({ isActive }) => (
                          <>
                            <it.icon className={`w-4 h-4 ${isActive ? "text-cyan-300" : "text-slate-400"}`} strokeWidth={2} />
                            <span className="flex-1">{it.label}</span>
                            {it.badge && (
                              <span className="text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-400/25">
                                {it.badge}
                              </span>
                            )}
                            <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                          </>
                        )}
                      </NavLink>
                    ))}
                  </div>
                </div>
              ))}

              <div className="pt-2 border-t border-white/10">
                <button
                  onClick={doLogout}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-red-300 hover:bg-red-500/10 transition-colors"
                  data-testid="drawer-logout-btn"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="flex-1 text-left">Logout</span>
                </button>
              </div>
            </div>
          </aside>
        </>
      )}

      <main className="max-w-5xl mx-auto px-4 py-4">
        <Outlet />
      </main>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 inset-x-0 z-50 glass border-t border-white/10">
        <div className="max-w-5xl mx-auto grid grid-cols-5">
          {items.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              end={it.to === "/"}
              data-testid={it.testid}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 py-3 text-[11px] tracking-wide transition-colors ${
                  isActive ? "text-cyan-300" : "text-slate-400 hover:text-slate-200"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <it.icon className={`w-5 h-5 ${isActive ? "drop-shadow-[0_0_6px_rgba(34,211,238,0.7)]" : ""}`} strokeWidth={2} />
                  <span>{it.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
