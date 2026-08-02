import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { LayoutDashboard, Users, ArrowDownToLine, ArrowUpFromLine, QrCode, Gamepad2, FileBarChart, LogOut, Plane, LifeBuoy } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const items = [
  { to: "/admin", end: true, label: "Dashboard", icon: LayoutDashboard, testid: "admin-nav-dashboard" },
  { to: "/admin/users", label: "Users", icon: Users, testid: "admin-nav-users" },
  { to: "/admin/deposits", label: "Deposits", icon: ArrowDownToLine, testid: "admin-nav-deposits" },
  { to: "/admin/withdrawals", label: "Withdrawals", icon: ArrowUpFromLine, testid: "admin-nav-withdrawals" },
  { to: "/admin/upi", label: "UPI / QR", icon: QrCode, testid: "admin-nav-upi" },
  { to: "/admin/support", label: "Support", icon: LifeBuoy, testid: "admin-nav-support" },
  { to: "/admin/game", label: "Game Control", icon: Gamepad2, testid: "admin-nav-game" },
  { to: "/admin/reports", label: "Reports", icon: FileBarChart, testid: "admin-nav-reports" },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  return (
    <div className="min-h-screen text-slate-100 flex">
      <aside className="fixed left-0 top-0 h-screen w-64 bg-[#06090F] border-r border-white/10 p-4 hidden md:flex md:flex-col">
        <div className="flex items-center gap-2 mb-8 px-2">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-500 to-green-500 grid place-items-center shadow-[0_0_18px_rgba(34,211,238,0.35)]">
            <Plane className="w-5 h-5 text-black" strokeWidth={2.5} />
          </div>
          <div>
            <div className="font-heading font-black tracking-tight leading-none bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 bg-clip-text text-transparent">GoWin365</div>
            <div className="text-[10px] uppercase tracking-widest text-slate-500">Admin</div>
          </div>
        </div>
        <nav className="flex-1 space-y-1">
          {items.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              end={!!it.end}
              data-testid={it.testid}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive ? "bg-[#1A2235] text-cyan-300" : "text-slate-400 hover:text-slate-100 hover:bg-[#0F1423]"
                }`
              }
            >
              <it.icon className="w-4 h-4" strokeWidth={2} />
              {it.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-white/10 pt-4 mt-4">
          <div className="text-xs text-slate-400 px-2 mb-2 truncate">{user?.email}</div>
          <button
            onClick={() => { logout(); nav("/login"); }}
            className="w-full btn-ghost px-3 py-2 rounded-lg text-sm flex items-center justify-center gap-2"
            data-testid="admin-logout-btn"
          >
            <LogOut className="w-4 h-4" /> Logout
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 inset-x-0 z-40 glass px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-green-500 grid place-items-center">
            <Plane className="w-4 h-4 text-black" strokeWidth={2.5} />
          </div>
          <div>
            <div className="font-heading font-black text-sm">GoWin365 Admin</div>
          </div>
        </div>
        <button onClick={() => { logout(); nav("/login"); }} className="btn-ghost px-3 py-1.5 rounded-lg text-xs">Logout</button>
      </div>

      <div className="md:hidden fixed bottom-0 inset-x-0 z-40 glass border-t border-white/10 overflow-x-auto">
        <div className="flex">
          {items.map((it) => (
            <NavLink key={it.to} to={it.to} end={!!it.end} className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-4 py-2 text-[10px] whitespace-nowrap ${isActive ? "text-cyan-300" : "text-slate-400"}`
            }>
              <it.icon className="w-4 h-4" />
              {it.label}
            </NavLink>
          ))}
        </div>
      </div>

      <main className="flex-1 md:ml-64 p-4 md:p-8 pt-20 md:pt-8 pb-24 md:pb-8 max-w-7xl">
        <Outlet />
      </main>
    </div>
  );
}
