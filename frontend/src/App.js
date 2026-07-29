import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { Toaster } from "sonner";

import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Lobby from "@/pages/Lobby";
import Game from "@/pages/Game";
import Wallet from "@/pages/Wallet";
import Deposit from "@/pages/Deposit";
import Withdraw from "@/pages/Withdraw";
import Leaderboard from "@/pages/Leaderboard";
import Referrals from "@/pages/Referrals";
import Profile from "@/pages/Profile";

import AdminLayout from "@/components/AdminLayout";
import AdminDashboard from "@/pages/admin/Dashboard";
import AdminUsers from "@/pages/admin/Users";
import AdminDeposits from "@/pages/admin/Deposits";
import AdminWithdrawals from "@/pages/admin/Withdrawals";
import AdminUpi from "@/pages/admin/UpiConfig";
import AdminGameControl from "@/pages/admin/GameControl";
import AdminReports from "@/pages/admin/Reports";

import PlayerLayout from "@/components/PlayerLayout";
import ChangePassword from "@/pages/ChangePassword";

// Host-based routing:
// - Hosts containing "admin" (e.g. gowin365xadmin.com) → admin-only app
// - All other hosts (e.g. gowin365x.com) → player-only app
// Preview/local host `aerox-wallet.preview.emergentagent.com` allows both.
function detectHostMode() {
  if (typeof window === "undefined") return "both";
  const h = window.location.hostname.toLowerCase();
  if (h.includes("admin")) return "admin";
  if (h.includes("gowin365x") || h.includes("aeroxplayer")) return "player";
  return "both";
}

const HOST_MODE = detectHostMode();

function Protected({ children, admin = false }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-slate-400 font-mono text-sm" data-testid="loading-indicator">loading...</div>
      </div>
    );
  }
  if (!user) return <Navigate to={admin ? "/admin/login" : "/login"} replace />;
  // Force temp-password holders to change password before doing anything else
  if (user.must_change_password) return <Navigate to="/change-password" replace />;
  if (admin && user.role !== "admin") return <Navigate to="/admin/login" replace />;
  return children;
}

function AppRoutes() {
  const { user, loading } = useAuth();

  // Admin-only host: EVERYTHING is admin. Any URL redirects to admin login/dashboard.
  if (HOST_MODE === "admin") {
    return (
      <Routes>
        <Route path="/login" element={<Navigate to="/admin/login" replace />} />
        <Route path="/register" element={<Navigate to="/admin/login" replace />} />
        <Route path="/admin/login" element={loading ? null : (user && user.role === 'admin' ? <Navigate to="/admin" /> : <Login adminMode />)} />
        <Route path="/change-password" element={user ? <ChangePassword /> : <Navigate to="/admin/login" replace />} />
        <Route path="/admin" element={<Protected admin><AdminLayout /></Protected>}>
          <Route index element={<AdminDashboard />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="deposits" element={<AdminDeposits />} />
          <Route path="withdrawals" element={<AdminWithdrawals />} />
          <Route path="upi" element={<AdminUpi />} />
          <Route path="game" element={<AdminGameControl />} />
          <Route path="reports" element={<AdminReports />} />
        </Route>
        <Route path="*" element={<Navigate to="/admin/login" replace />} />
      </Routes>
    );
  }

  // Player-only host: admin routes redirect to player login (no admin surface exposed)
  if (HOST_MODE === "player") {
    return (
      <Routes>
        <Route path="/login" element={loading ? null : (user ? <Navigate to="/" /> : <Login />)} />
        <Route path="/register" element={loading ? null : (user ? <Navigate to="/" /> : <Register />)} />
        <Route path="/change-password" element={user ? <ChangePassword /> : <Navigate to="/login" replace />} />
        <Route path="/admin/*" element={<Navigate to="/login" replace />} />
        <Route path="/" element={<Protected><PlayerLayout /></Protected>}>
          <Route index element={<Lobby />} />
          <Route path="game" element={<Game />} />
          <Route path="wallet" element={<Wallet />} />
          <Route path="deposit" element={<Deposit />} />
          <Route path="withdraw" element={<Withdraw />} />
          <Route path="leaderboard" element={<Leaderboard />} />
          <Route path="referrals" element={<Referrals />} />
          <Route path="profile" element={<Profile />} />
        </Route>
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    );
  }

  // "both" mode — preview URL / local dev — full app available
  return (
    <Routes>
      <Route path="/login" element={loading ? null : (user ? <Navigate to={user.role === 'admin' ? '/admin' : '/'} /> : <Login />)} />
      <Route path="/admin/login" element={loading ? null : (user && user.role === 'admin' ? <Navigate to="/admin" /> : <Login adminMode />)} />
      <Route path="/register" element={loading ? null : (user ? <Navigate to="/" /> : <Register />)} />
      <Route path="/change-password" element={user ? <ChangePassword /> : <Navigate to="/login" replace />} />

      <Route path="/" element={<Protected><PlayerLayout /></Protected>}>
        <Route index element={<Lobby />} />
        <Route path="game" element={<Game />} />
        <Route path="wallet" element={<Wallet />} />
        <Route path="deposit" element={<Deposit />} />
        <Route path="withdraw" element={<Withdraw />} />
        <Route path="leaderboard" element={<Leaderboard />} />
        <Route path="referrals" element={<Referrals />} />
        <Route path="profile" element={<Profile />} />
      </Route>

      <Route path="/admin" element={<Protected admin><AdminLayout /></Protected>}>
        <Route index element={<AdminDashboard />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="deposits" element={<AdminDeposits />} />
        <Route path="withdrawals" element={<AdminWithdrawals />} />
        <Route path="upi" element={<AdminUpi />} />
        <Route path="game" element={<AdminGameControl />} />
        <Route path="reports" element={<AdminReports />} />
      </Route>

      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
        <Toaster theme="dark" position="top-right" richColors />
      </AuthProvider>
    </BrowserRouter>
  );
}
