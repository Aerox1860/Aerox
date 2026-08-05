import { Sparkles } from "lucide-react";
import ComingSoon from "./ComingSoon";
export default function Football() {
  return (
    <div data-testid="football-page">
      <ComingSoon
        title="Football"
        tagline="Real-time football odds and live cash-out are coming to GoWin365 shortly. Sign up for daily bonuses in the meantime."
        icon={Sparkles}
        tint="text-emerald-300"
      />
    </div>
  );
}
