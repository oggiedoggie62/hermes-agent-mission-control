"use client";

import { useEffect, useState } from "react";
import { Server, Cpu, HardDrive, Thermometer, Activity } from "lucide-react";

interface HostHealth {
  hostname: string;
  cpuUsage: number;
  ramUsage: number;
  diskUsage: number;
  gpuTemp?: number;
  nasConnected: boolean;
  updatedAt: string;
}

export default function MachinesPage() {
  const [hosts, setHosts] = useState<HostHealth[]>([]);

  useEffect(() => {
    fetch("/api/host/health")
      .then((res) => res.json())
      .then(setHosts)
      .catch(console.error);
    const interval = setInterval(() => {
      fetch("/api/host/health")
        .then((res) => res.json())
        .then(setHosts);
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="p-8">
      <header className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Homelab Nodes</h1>
        <p className="text-[var(--ink-2)]">Real-time status of your cluster.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
    </div>
  );
}
