import { Wrench, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

export default function MaintenanceScreen({ gameName = "This game", backTo = "/games" }) {
  return (
    <div
      className="min-h-[70vh] flex items-center justify-center p-6"
      data-testid="maintenance-screen"
    >
      <div className="card-surface w-full max-w-lg p-8 md:p-10 text-center relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none opacity-20"
             style={{ backgroundImage: "radial-gradient(circle at 30% 20%, rgba(250,204,21,0.35), transparent 50%), radial-gradient(circle at 70% 80%, rgba(239,68,68,0.25), transparent 55%)" }} />

        <div className="relative">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-yellow-500/15 border border-yellow-400/40 flex items-center justify-center animate-pulse">
            <Wrench className="w-8 h-8 text-yellow-300" />
          </div>

          <div className="mt-5 text-[11px] tracking-[0.35em] uppercase text-yellow-300">Under Maintenance</div>
          <h1 className="mt-2 font-heading text-2xl md:text-3xl font-black">
            {gameName} is temporarily unavailable
          </h1>
          <p className="mt-3 text-sm text-slate-400">
            Our team is tuning the table. Please check back in a little while — thanks for your patience.
          </p>

          <div className="mt-6 flex items-center justify-center gap-2">
            <Link
              to={backTo}
              data-testid="maintenance-back-btn"
              className="btn-primary px-4 py-2 rounded-lg inline-flex items-center gap-2 text-sm"
            >
              <ArrowLeft className="w-4 h-4" /> Back to Games
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
