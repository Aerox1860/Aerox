import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { Home, Gamepad2, Wallet as WalletIcon, Trophy, User, LogOut, Plane } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const items = [
  { to: "/", label: "Lobby", icon: Home, testid: "nav-lobby" },
  { to: "/games", label: "Games", icon: Gamepad2, testid: "nav-games" },
  { to: "/wallet", label: "Wallet", icon: WalletIcon, testid: "nav-wallet" },
  { to: "/leaderboard", label: "Board", icon: Trophy, testid: "nav-leaderboard" },
  { to: "/profile", label: "Me", icon: User, testid: "nav-profile" },
];

export default function PlayerLayout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();

  return (
    <div className="min-h-screen text-slate-100 pb-24">
      {/* Top bar */}
      <header className="sticky top-0 z-40 glass px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="relative w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-green-500 grid place-items-center shadow-[0_0_18px_rgba(34,211,238,0.35)]">
            <Plane className="w-4 h-4 text-black" strokeWidth={2.5} />
          </div>
          <div className="font-heading font-black tracking-tight text-lg">AeroX</div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right" data-testid="topbar-balance">
            <div className="text-[10px] uppercase tracking-widest text-slate-400">Balance</div>
            <div className="font-mono font-bold text-cyan-300">₹ {user?.balance?.toFixed(2)}</div>
          </div>
          <button
            onClick={() => { logout(); nav("/login"); }}
            className="btn-ghost px-3 py-2 rounded-lg text-xs flex items-center gap-1"
            data-testid="logout-btn"
          >
            <LogOut className="w-3.5 h-3.5" /> Logout
          </button>
        </div>
      </header>

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
