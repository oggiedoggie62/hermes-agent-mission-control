"use client";

import { useEffect, useState } from "react";
import { Server, Cpu, HardDrive, Thermometer, Activity, Monitor, Globe, Wifi, AlertTriangle } from "lucide-react";

interface HostHealth {
  hostname: string;
  cpuUsage: number;
  ramUsage: number;
  diskUsage: number;
  gpuTemp?: number;
  nasConnected: boolean;
  updatedAt: string;
}

interface RegistryDevice {
  name: string;
  hostname: string;
  os: string;
  role: string;
  cpu: string | null;
  ram: string | null;
  gpu: string | null;
  tailscale_ip: string | null;
  notes: string;
}

interface RegistryService {
  name: string;
  type: string;
  host: string | null;
  check_type: string;
  url: string | null;
  port: number | null;
  notes: string;
}

interface GuardianStatus {
  hostname: string;
  status: string;
  lastProbed?: string;
  summary?: string;
  tailscale?: string;
  recovery?: {
    attempted?: boolean;
    status?: string;
    message?: string;
    lan_host?: string;
  };
}

export default function MachinesPage() {
  const [hosts, setHosts] = useState<HostHealth[]>([]);
  const [devices, setDevices] = useState<RegistryDevice[]>([]);
  const [services, setServices] = useState<RegistryService[]>([]);
  const [guardian, setGuardian] = useState<GuardianStatus | null>(null);

  useEffect(() => {
    fetch("/api/host/health")
      .then((res) => res.json())
      .then((data) => setHosts(data.hosts || []))
      .catch(console.error);
    const fetchGuardian = () => fetch("/api/guardian/status")
      .then((res) => res.json())
      .then((data) => setGuardian(data.status || null))
      .catch(console.error);
    fetchGuardian();
    const interval = setInterval(() => {
      fetch("/api/host/health")
        .then((res) => res.json())
        .then((data) => setHosts(data.hosts || []));
      fetchGuardian();
    }, 10000);

    // Fetch registry data once
    fetch("/api/registry")
      .then((res) => res.json())
      .then((data) => {
        setDevices(data.devices || []);
        setServices(data.services || []);
      })
      .catch(console.error);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="p-8">
      <header className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Homelab Nodes</h1>
        <p className="text-[var(--ink-2)]">Real-time status of your cluster.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {guardian && (
          <div className={`panel p-6 flex flex-col gap-5 border ${guardian.status === "online" ? "border-emerald-500/30" : "border-amber-500/40"}`}>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl grid place-items-center ${guardian.status === "online" ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"}`}>
                {guardian.status === "online" ? <Wifi className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
              </div>
              <div>
                <h3 className="font-bold text-lg">Mac Mini Guardian</h3>
                <div className={`text-[11px] uppercase tracking-wider font-semibold ${guardian.status === "online" ? "text-emerald-400" : "text-amber-400"}`}>
                  {guardian.status === "online" ? "Mac Mini Online" : guardian.recovery?.status === "succeeded" ? "Recovery Started" : "Manual Intervention Required"}
                </div>
              </div>
            </div>
            <div className="space-y-2 text-[12px]">
              <div><span className="text-[var(--ink-3)]">Tailscale:</span> {guardian.tailscale || "unknown"}</div>
              <div><span className="text-[var(--ink-3)]">Recovery:</span> {guardian.recovery?.message || "No recovery attempted"}</div>
              {guardian.summary && <div className="text-[var(--ink-2)] leading-relaxed">{guardian.summary}</div>}
            </div>
            <div className="pt-3 border-t border-[var(--line)] text-[11px] text-[var(--ink-2)]">
              Last probe: {guardian.lastProbed ? new Date(guardian.lastProbed).toLocaleString() : "unknown"}
            </div>
          </div>
        )}
        {hosts.map((host) => (
          <div key={host.hostname} className="panel p-6 flex flex-col gap-6 group">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[var(--accent)] text-black grid place-items-center">
                  <Server className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">{host.hostname}</h3>
                  <div className="flex items-center gap-1.5 text-[11px] text-[var(--ink-2)] uppercase tracking-wider font-semibold">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                    Online
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1.5 text-[11px] text-[var(--ink-2)] font-medium">
                  <Cpu className="w-3 h-3" /> CPU
                </div>
                <div className="text-xl font-bold">{host.cpuUsage}%</div>
                <div className="w-full h-1 bg-[var(--line)] rounded-full overflow-hidden">
                  <div className="h-full bg-[var(--accent)]" style={{ width: `${host.cpuUsage}%` }}></div>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1.5 text-[11px] text-[var(--ink-2)] font-medium">
                  <Activity className="w-3 h-3" /> RAM
                </div>
                <div className="text-xl font-bold">{host.ramUsage}%</div>
                <div className="w-full h-1 bg-[var(--line)] rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500" style={{ width: `${host.ramUsage}%` }}></div>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1.5 text-[11px] text-[var(--ink-2)] font-medium">
                  <HardDrive className="w-3 h-3" /> DISK
                </div>
                <div className="text-xl font-bold">{host.diskUsage}%</div>
              </div>

              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1.5 text-[11px] text-[var(--ink-2)] font-medium">
                  <Thermometer className="w-3 h-3" /> TEMP
                </div>
                <div className="text-xl font-bold">{host.gpuTemp}°C</div>
              </div>
            </div>

            <div className="pt-4 border-t border-[var(--line)] flex justify-between items-center text-[11px] text-[var(--ink-2)]">
               <span>Last update: {new Date(host.updatedAt).toLocaleTimeString()}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Registry Devices */}
      {devices.length > 0 && (
        <>
          <h2 className="text-[20px] font-black uppercase tracking-tight text-white mt-14 mb-6">Registered Devices</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-10">
            {devices.map((d) => (
              <div key={d.name} className="panel p-5 flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 grid place-items-center">
                    <Monitor className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base">{d.name}</h3>
                    <div className="text-[10px] text-[var(--ink-2)] font-mono">{d.hostname}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[12px]">
                  <div><span className="text-[var(--ink-3)]">OS:</span> {d.os}</div>
                  <div><span className="text-[var(--ink-3)]">Role:</span> {d.role}</div>
                  {d.tailscale_ip && (
                    <div className="col-span-2 flex items-center gap-1 text-cyan-400">
                      <Wifi className="w-3 h-3" /> {d.tailscale_ip}
                    </div>
                  )}
                </div>
                <div className="text-[10px] text-[var(--ink-3)] leading-relaxed">{d.notes}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Registry Services */}
      {services.length > 0 && (
        <>
          <h2 className="text-[20px] font-black uppercase tracking-tight text-white mt-8 mb-6">Registered Services</h2>
          <div className="rounded-xl overflow-hidden mb-10" style={{ border: "1px solid var(--line)" }}>
            <table className="w-full text-[13px]">
              <thead style={{ background: "var(--panel)" }}>
                <tr className="text-left text-[11px] uppercase tracking-wider text-[var(--ink-3)]">
                  <th className="p-3 font-medium">Name</th>
                  <th className="p-3 font-medium">Type</th>
                  <th className="p-3 font-medium">URL</th>
                  <th className="p-3 font-medium">Check</th>
                </tr>
              </thead>
              <tbody>
                {services.map((s) => (
                  <tr key={s.name} className="border-t" style={{ borderColor: "var(--line)" }}>
                    <td className="p-3 font-medium">{s.name}</td>
                    <td className="p-3 text-[var(--ink-2)] text-[12px]">{s.type}</td>
                    <td className="p-3">
                      {s.url ? (
                        <a href={s.url} target="_blank" rel="noopener noreferrer"
                          className="text-cyan-400 hover:text-cyan-300 text-[12px] underline underline-offset-1">
                          {s.url}
                        </a>
                      ) : (
                        <span className="text-[var(--ink-3)]">—</span>
                      )}
                    </td>
                    <td className="p-3 text-[var(--ink-2)] text-[12px]">{s.check_type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
