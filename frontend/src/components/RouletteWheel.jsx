import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { WHEEL_ORDER, colorOf } from "@/lib/roulette";

/**
 * Wooden-look European roulette wheel with a ball that lands on the winning number.
 *
 * Props:
 *  - resultNumber: number | null       -> current spin's winning number (during spinning/result phases)
 *  - spinning: boolean                 -> when true, wheel + ball actively spinning to result
 *  - lastResultNumber: number | null   -> previous round's result — used to hold wheel position
 *                                          between rounds so the next spin starts from there
 */
export default function RouletteWheel({ resultNumber, spinning, lastResultNumber = null }) {
  const N = WHEEL_ORDER.length; // 37
  const segAngle = 360 / N;
  const R = 140;      // outer radius
  const RIN = 55;     // inner radius (hub)
  const CX = 160;
  const CY = 160;

  // Landing rotation (degrees) that places number n directly under the top pointer.
  const landingAngleFor = (n) =>
    n == null ? 0 : -WHEEL_ORDER.indexOf(n) * segAngle - segAngle / 2;

  // Persistent wheel + ball rotations. We increment them (never reset) so
  // successive spins chain smoothly and idle rounds hold the previous result.
  const [wheelRot, setWheelRot] = useState(() => landingAngleFor(lastResultNumber));
  const [ballRot, setBallRot] = useState(0);
  const prevSpinRef = useRef(false);

  // When spinning transitions false -> true with a known resultNumber, kick off a new spin
  // whose landing angle exactly matches the winning number (>= 6 full turns + settle delta).
  useEffect(() => {
    if (spinning && !prevSpinRef.current && resultNumber != null) {
      setWheelRot((prev) => {
        const targetAngle = landingAngleFor(resultNumber);
        const currentMod = ((prev % 360) + 360) % 360;
        const targetMod = ((targetAngle % 360) + 360) % 360;
        let delta = targetMod - currentMod;
        if (delta <= 0) delta += 360; // always keep going forward
        return prev + 360 * 6 + delta; // 6 full turns + settle
      });
      setBallRot((prev) => prev - 720); // 2 extra CCW turns for the ball
    }
    prevSpinRef.current = spinning;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinning, resultNumber]);

  return (
    <div className="relative w-[320px] h-[320px] mx-auto select-none" data-testid="roulette-wheel">
      {/* Wooden rim */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, #3b2412 0%, #593019 45%, #2b170a 100%)",
          boxShadow:
            "0 0 30px rgba(0,0,0,0.55), inset 0 0 30px rgba(0,0,0,0.6), inset 0 0 12px rgba(255,180,90,0.15)",
        }}
      />

      {/* Rotating wheel with numbered segments */}
      <motion.svg
        width={320}
        height={320}
        viewBox="0 0 320 320"
        className="absolute inset-0"
        initial={{ rotate: wheelRot }}
        animate={{ rotate: wheelRot }}
        transition={{
          duration: spinning ? 9.5 : 0.001,
          ease: spinning ? [0.15, 0.7, 0.15, 1] : "linear",
        }}
      >
        {WHEEL_ORDER.map((num, i) => {
          const start = i * segAngle - 90 - segAngle / 2; // -90 = top
          const end = start + segAngle;
          const path = arcPath(CX, CY, R, RIN, start, end);
          const color = colorOf(num);
          const fill = color === "green" ? "#0f9d3a" : color === "red" ? "#c1121f" : "#0a0a0a";
          // Label position
          const midA = (start + end) / 2;
          const labelR = (R + RIN) / 2;
          const lx = CX + Math.cos((midA * Math.PI) / 180) * labelR;
          const ly = CY + Math.sin((midA * Math.PI) / 180) * labelR;
          return (
            <g key={num}>
              <path d={path} fill={fill} stroke="#c9a34a" strokeWidth={0.6} />
              <text
                x={lx}
                y={ly}
                fill="#ffffff"
                fontSize={num >= 10 ? 13 : 14}
                fontWeight={900}
                textAnchor="middle"
                dominantBaseline="middle"
                transform={`rotate(${midA + 90} ${lx} ${ly})`}
                style={{ fontFamily: "monospace", textShadow: "0 1px 2px rgba(0,0,0,0.95)", letterSpacing: "-0.5px" }}
              >
                {num}
              </text>
            </g>
          );
        })}
        {/* Hub */}
        <circle cx={CX} cy={CY} r={RIN} fill="url(#hub)" stroke="#8a5a2b" strokeWidth={1} />
        <circle cx={CX} cy={CY} r={12} fill="#c9a34a" />
        {/* Cross spokes */}
        <line x1={CX} y1={CY - RIN + 4} x2={CX} y2={CY + RIN - 4} stroke="#c9a34a" strokeWidth={2} />
        <line x1={CX - RIN + 4} y1={CY} x2={CX + RIN - 4} y2={CY} stroke="#c9a34a" strokeWidth={2} />
        <defs>
          <radialGradient id="hub" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#7a4a20" />
            <stop offset="100%" stopColor="#3a2210" />
          </radialGradient>
        </defs>
      </motion.svg>

      {/* Track (ball rim) */}
      <div
        className="absolute rounded-full pointer-events-none"
        style={{
          top: 8,
          left: 8,
          right: 8,
          bottom: 8,
          border: "6px solid rgba(80,45,15,0.9)",
          boxShadow: "inset 0 0 12px rgba(0,0,0,0.6)",
        }}
      />

      {/* Ball — sits at absolute top; wheel rotates underneath. */}
      <motion.div
        className="absolute"
        style={{ top: 0, left: 0, width: 320, height: 320, transformOrigin: "160px 160px" }}
        initial={{ rotate: ballRot }}
        animate={{ rotate: ballRot }}
        transition={{ duration: spinning ? 9.5 : 0.001, ease: [0.15, 0.7, 0.15, 1] }}
      >
        <div
          className="absolute rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.9)]"
          style={{
            width: 12,
            height: 12,
            top: 14,
            left: 154,
          }}
        />
      </motion.div>

      {/* Pointer */}
      <div
        className="absolute left-1/2 -translate-x-1/2"
        style={{
          top: -6,
          width: 0,
          height: 0,
          borderLeft: "8px solid transparent",
          borderRight: "8px solid transparent",
          borderTop: "14px solid #f6d76b",
          filter: "drop-shadow(0 0 3px rgba(0,0,0,0.6))",
        }}
      />

      {/* Small result badge in the hub (does not cover the wheel — user can see the ball landed) */}
      <AnimatePresence>
        {resultNumber != null && !spinning && (
          <motion.div
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
          >
            <div
              className={`font-heading font-black text-xl w-14 h-14 rounded-full grid place-items-center text-white border-2 ${
                colorOf(resultNumber) === "green"
                  ? "bg-green-600 border-green-300"
                  : colorOf(resultNumber) === "red"
                  ? "bg-red-600 border-red-300"
                  : "bg-black border-white/60"
              }`}
              style={{ boxShadow: "0 0 20px rgba(0,0,0,0.7)" }}
            >
              {resultNumber}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Build an SVG donut-slice path.
function arcPath(cx, cy, r, rIn, startDeg, endDeg) {
  const s = (startDeg * Math.PI) / 180;
  const e = (endDeg * Math.PI) / 180;
  const large = endDeg - startDeg > 180 ? 1 : 0;
  const x1 = cx + r * Math.cos(s);
  const y1 = cy + r * Math.sin(s);
  const x2 = cx + r * Math.cos(e);
  const y2 = cy + r * Math.sin(e);
  const x3 = cx + rIn * Math.cos(e);
  const y3 = cy + rIn * Math.sin(e);
  const x4 = cx + rIn * Math.cos(s);
  const y4 = cy + rIn * Math.sin(s);
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${rIn} ${rIn} 0 ${large} 0 ${x4} ${y4} Z`;
}
