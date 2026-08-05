import { Trophy } from "lucide-react";
import ComingSoon from "./ComingSoon";
export default function HorseRacing() {
  return (
    <div data-testid="horse-racing-page">
      <ComingSoon
        title="Horse Racing"
        tagline="Live turf-track odds and pre-race markets are on their way. Check back soon — big paydays incoming."
        icon={Trophy}
        tint="text-amber-300"
      />
    </div>
  );
}
