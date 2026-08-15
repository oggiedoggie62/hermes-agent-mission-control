import { AlertTriangle, Clock3, Wifi } from "lucide-react";
import type { GuardianStatusResponse } from "@/lib/guardian-status";

export function GuardianStatusCard({ response }: { response: GuardianStatusResponse | null }) {
  const status = response?.status ?? response?.lastKnownStatus ?? null;
  const available = response?.availability === "available" && response.authoritative;
  const online = available && status?.status === "online";
  const tone = online
    ? "border-emerald-500/30"
    : available
      ? "border-amber-500/40"
      : "border-rose-500/40";

  const stateLabel = response === null
    ? "Loading Guardian status"
    : response.availability === "missing"
      ? "Guardian has not reported"
      : response.availability === "stale"
        ? "Guardian report is stale"
        : response.availability === "invalid"
          ? "Guardian report is invalid"
          : response.availability === "error"
            ? "Guardian status unavailable"
            : status?.status === "online"
              ? "Mac Mini Online"
              : status?.status === "partial"
                ? "Mac Mini Partially Reachable"
                : "Manual Intervention Required";

  return (
    <div className={`panel p-6 flex flex-col gap-5 border ${tone}`}>
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl grid place-items-center ${
          online ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/15 text-rose-300"
        }`}>
          {online ? <Wifi className="w-5 h-5" /> : response?.availability === "stale"
            ? <Clock3 className="w-5 h-5" />
            : <AlertTriangle className="w-5 h-5" />}
        </div>
        <div>
          <h3 className="font-bold text-lg">Mac Mini Guardian</h3>
          <div className={`text-[11px] uppercase tracking-wider font-semibold ${
            online ? "text-emerald-400" : "text-rose-300"
          }`} role={!available && response !== null ? "alert" : undefined}>
            {stateLabel}
          </div>
        </div>
      </div>

      {status ? (
        <div className="space-y-2 text-[12px]">
          <div><span className="text-[var(--ink-3)]">Tailscale:</span> {status.tailscale}</div>
          <div><span className="text-[var(--ink-3)]">Recovery:</span> {status.recovery.message}</div>
          <div className="text-[var(--ink-2)] leading-relaxed">{status.summary}</div>
          {!available && (
            <div className="text-rose-300 font-semibold">
              Last known data is shown for context only and is not authoritative.
            </div>
          )}
        </div>
      ) : (
        <div className="text-[12px] text-rose-300">
          Current Guardian evidence is not available. Check the producer and Mission Control API.
        </div>
      )}

      <div className="pt-3 border-t border-[var(--line)] text-[11px] text-[var(--ink-2)]">
        Last probe: {status ? new Date(status.lastProbed).toLocaleString() : "unknown"}
      </div>
    </div>
  );
}
