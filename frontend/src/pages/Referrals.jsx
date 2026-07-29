import { useEffect, useState } from "react";
import { Copy, Share2, Users, IndianRupee, Gift } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";

export default function Referrals() {
  const [data, setData] = useState({ code: "", count: 0, earnings: 0, referrals: [] });

  useEffect(() => { api.get("/referrals/mine").then(({ data }) => setData(data)).catch(() => {}); }, []);

  const link = `${window.location.origin}/register?ref=${data.code}`;
  const copy = (text) => { navigator.clipboard?.writeText(text); toast.success("Copied"); };
  const share = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: "Join me on AeroX", text: "Fly with me on AeroX and earn a ₹50 signup bonus!", url: link }); } catch {}
    } else copy(link);
  };

  return (
    <div className="space-y-5" data-testid="referrals-page">
      <div>
        <h1 className="font-heading text-2xl md:text-3xl font-black flex items-center gap-2"><Gift className="w-6 h-6 text-green-400" /> Referrals</h1>
        <p className="text-slate-400 text-sm mt-1">Invite friends and earn a ₹25 bonus for every signup that uses your code.</p>
      </div>

      <div className="card-surface p-6 relative overflow-hidden">
        <div className="absolute -right-10 -top-10 w-48 h-48 rounded-full bg-green-500/10 blur-3xl pointer-events-none" />
        <div className="text-[11px] uppercase tracking-widest text-slate-400">Your code</div>
        <div className="mt-1 font-mono text-3xl md:text-4xl font-black neon-green" data-testid="referral-code">{data.code || "-----"}</div>
        <div className="mt-3 text-sm text-slate-400 break-all font-mono">{link}</div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={() => copy(data.code)} className="btn-ghost px-4 py-2 rounded-lg text-sm flex items-center gap-2" data-testid="copy-code-btn"><Copy className="w-4 h-4" /> Copy code</button>
          <button onClick={() => copy(link)} className="btn-ghost px-4 py-2 rounded-lg text-sm flex items-center gap-2" data-testid="copy-link-btn"><Copy className="w-4 h-4" /> Copy link</button>
          <button onClick={share} className="btn-cyan px-4 py-2 rounded-lg text-sm flex items-center gap-2" data-testid="share-btn"><Share2 className="w-4 h-4" /> Share</button>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="card-surface p-5">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-slate-400"><Users className="w-3.5 h-3.5" /> Total referrals</div>
          <div className="mt-1 font-mono text-3xl font-black" data-testid="referrals-count">{data.count}</div>
        </div>
        <div className="card-surface p-5">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-slate-400"><IndianRupee className="w-3.5 h-3.5" /> Earnings</div>
          <div className="mt-1 font-mono text-3xl font-black neon-green" data-testid="referrals-earnings">₹ {data.earnings?.toFixed(2)}</div>
        </div>
      </div>

      <div className="card-surface p-5">
        <h2 className="font-heading font-bold mb-3">People you invited</h2>
        <div className="divide-y divide-white/5" data-testid="referrals-list">
          {(data.referrals || []).length === 0 && <div className="text-sm text-slate-500 py-2">No one has signed up with your code yet.</div>}
          {(data.referrals || []).map((r) => (
            <div key={r.id} className="flex items-center justify-between py-2.5 text-sm">
              <div>{r.name}</div>
              <div className="text-xs text-slate-500">{new Date(r.created_at).toLocaleDateString()}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
