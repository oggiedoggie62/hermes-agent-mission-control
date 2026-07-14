#!/usr/bin/env python3
import os
import shutil
import json
import subprocess
import urllib.error
import urllib.request

NAS_PATH = "/mnt/nas/Youtube4Editing"
API_URL = "http://localhost:3000/api/host/health"
API_SECRET="05075888cc8a813dcb4faa766ccb017c930a7eb51cf829a48238eb6bd12b5f84"

def get_cpu_usage():
    try:
        load = os.getloadavg()[0]
        cores = os.cpu_count() or 1
        return min(100.0, (load / cores) * 100)
    except: return 0.0

def get_ram_usage():
    try:
        mem = subprocess.check_output(['free','-m']).decode('utf-8').splitlines()[1].split()
        total_mem = int(mem[1])
        used_mem = int(mem[2])
        return (used_mem / total_mem) * 100
    except: return 0.0

def get_gpu_temp():
    try:
        output = subprocess.check_output(['nvidia-smi', '--query-gpu=temperature.gpu', '--format=csv,noheader,nounits']).decode('utf-8')
        return float(output.strip())
    except: return None

def report():
    nas_connected = os.path.ismount(NAS_PATH) or os.path.exists(NAS_PATH)
    nas_avail = 0.0
    if nas_connected:
        try:
            st = shutil.disk_usage(NAS_PATH)
            nas_avail = round(st.free / (1024**3), 1) # GB
        except: pass

    payload = {
        "hostname": "Mint-Hub",
        "cpuUsage": round(get_cpu_usage(), 1),
        "ramUsage": round(get_ram_usage(), 1),
        "diskUsage": round(shutil.disk_usage("/").used / shutil.disk_usage("/").total * 100, 1),
        "gpuTemp": get_gpu_temp(),
        "nasConnected": nas_connected,
        "nasAvailable": nas_avail
    }
    try:
        body = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            API_URL,
            data=body,
            headers={
                "Authorization": f"Bearer {API_SECRET}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=15) as response:
            if response.status < 200 or response.status >= 300:
                raise RuntimeError(f"HTTP {response.status}: {response.read().decode('utf-8', 'replace')}")
        print(f"Health Reported: Mint:{payload['cpuUsage']}% NAS:{'OK' if nas_connected else 'ERR'}")
    except (urllib.error.URLError, RuntimeError) as e:
        print(f"Report Error: {e}")
        raise

if __name__ == "__main__":
    report()
