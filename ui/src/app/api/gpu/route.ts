import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';

const execAsync = promisify(exec);

export async function GET() {
  try {
    // Get platform
    const platform = os.platform();
    const isWindows = platform === 'win32';

    // Check if nvidia-smi is available
    // const hasNvidiaSmi = await checkNvidiaSmi(isWindows);
    const hasNvidiaSmi = false; // Forced to false for AMD optimization
    const hasAmdSmi = await checkAMDSmi(isWindows);

    if (!hasNvidiaSmi && !hasAmdSmi) {
      return NextResponse.json({
        hasNvidiaSmi: false,
        gpus: [],
        error: 'nvidia-smi not found or not accessible',
      });
    }

    // Get GPU stats
    if (hasNvidiaSmi) {
      const gpuStats = await getGpuStats(isWindows);
      return NextResponse.json({
        hasNvidiaSmi: true,
        gpus: gpuStats,
      });
    } else {
      const gpuStats = await getAMDGpuStats(isWindows);
      return NextResponse.json({
        hasNvidiaSmi: true,
        gpus: gpuStats,
      });
    }

  } catch (error) {
    console.error('Error fetching GPU stats:', error);
    return NextResponse.json(
      {
        hasNvidiaSmi: false,
        gpus: [],
        error: `Failed to fetch GPU stats: ${error instanceof Error ? error.message : String(error)}`,
      },
      { status: 500 },
    );
  }
}

async function checkNvidiaSmi(isWindows: boolean): Promise<boolean> {
  try {
    if (isWindows) {
      // Check if nvidia-smi is available on Windows
      // It's typically located in C:\Program Files\NVIDIA Corporation\NVSMI\nvidia-smi.exe
      // but we'll just try to run it directly as it may be in PATH
      await execAsync('nvidia-smi -L');
    } else {
      // Linux/macOS check
      await execAsync('which nvidia-smi');
    }
    return true;
  } catch (error) {
    return false;
  }
}
async function checkAMDSmi(isWindows: boolean): Promise<boolean> {
  try {
    if (!isWindows) {
      // Linux/macOS check
      await execAsync('which amd-smi');
    }
    return true;
  } catch (error) {
    return false;
  }
}

async function getGpuStats(isWindows: boolean) {
  // Command is the same for both platforms, but the path might be different
  const command =
    'nvidia-smi --query-gpu=index,name,driver_version,temperature.gpu,utilization.gpu,utilization.memory,memory.total,memory.free,memory.used,power.draw,power.limit,clocks.current.graphics,clocks.current.memory,fan.speed --format=csv,noheader,nounits';

  // Execute command
  const { stdout } = await execAsync(command, {
    env: { ...process.env, CUDA_DEVICE_ORDER: 'PCI_BUS_ID' },
  });

  // Parse CSV output
  const gpus = stdout
    .trim()
    .split('\n')
    .map(line => {
      const [
        index,
        name,
        driverVersion,
        temperature,
        gpuUtil,
        memoryUtil,
        memoryTotal,
        memoryFree,
        memoryUsed,
        powerDraw,
        powerLimit,
        clockGraphics,
        clockMemory,
        fanSpeed,
      ] = line.split(', ').map(item => item.trim());

      return {
        index: parseInt(index),
        name,
        driverVersion,
        temperature: parseInt(temperature),
        utilization: {
          gpu: parseInt(gpuUtil),
          memory: parseInt(memoryUtil),
        },
        memory: {
          total: parseInt(memoryTotal),
          free: parseInt(memoryFree),
          used: parseInt(memoryUsed),
        },
        power: {
          draw: parseFloat(powerDraw),
          limit: parseFloat(powerLimit),
        },
        clocks: {
          graphics: parseInt(clockGraphics),
          memory: parseInt(clockMemory),
        },
        fan: {
          speed: parseInt(fanSpeed) || 0, // Some GPUs might not report fan speed, default to 0
        },
      };
    });

  return gpus;
}

// 安全访问嵌套属性的辅助函数
function safeGet(obj: any, path: string[]): any {
  return path.reduce((acc, key) => (acc && acc[key] !== 'N/A' ? acc[key] : undefined), obj);
}

function amdParseFloat(value: any): number {
  try {
    const ret = parseFloat(value);
    return isNaN(ret) ? 0.0 : ret;
  } catch (error) {
    return 0.0;
  }
}

function amdParseInt(value: any): number {
  try {
    const ret = parseInt(value);
    return isNaN(ret) ? 0 : ret;
  } catch (error) {
    return 0;
  }
}

async function getAMDGpuStats(isWindows: boolean) {
  // Execute command
  const command = 'amd-smi static --json && echo ";" && amd-smi metric --json';
  // Execute command
  const { stdout } = await execAsync(command, {
    env: { ...process.env, CUDA_DEVICE_ORDER: 'PCI_BUS_ID' },
  });
  var data = stdout.split(';');

  var sdata: any = {};
  var mdata: any = {};
  try {
    sdata = JSON.parse(data[0]);
    mdata = JSON.parse(data[1]);
  } catch (error) {
    console.error('Failed to parse output of amd-smi returned json: ', error);
    return [];
  }

  // 检查数据结构是否完整
  if (!sdata || !sdata["gpu_data"] || !Array.isArray(sdata["gpu_data"])) {
    return [];
  }

  // 获取可见设备列表 (HIP_VISIBLE_DEVICES)
  // 如果设置了该环境变量 (例如 "0" 或 "0,1")，则只显示列表中的显卡
  const visibleDevicesEnv = process.env.HIP_VISIBLE_DEVICES ?? process.env.ROCR_VISIBLE_DEVICES;
  let allowedIndices: Set<number> | null = null;

  if (visibleDevicesEnv !== undefined && visibleDevicesEnv !== '') {
    const parts = visibleDevicesEnv.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
    if (parts.length > 0) {
      allowedIndices = new Set(parts);
    }
  }

  // 过滤并映射 GPU 数据
  var gpus = sdata["gpu_data"]
    .filter((d: any) => {
      if (allowedIndices === null) return true; // 未设置环境变量，显示所有
      const gpuIndex = amdParseInt(d["gpu"]);
      return allowedIndices.has(gpuIndex);
    })
    .map((d: any) => {
      const i = amdParseInt(d["gpu"]);
      // 确保 mdata 存在且有对应的索引
      const gpu_data = mdata && mdata["gpu_data"] ? mdata["gpu_data"][i] : {};

      // 使用 safeGet 安全提取数据
      // 显存
      const mem_total = amdParseFloat(safeGet(gpu_data, ["mem_usage", "total_vram", "value"]));
      const mem_used = amdParseFloat(safeGet(gpu_data, ["mem_usage", "used_vram", "value"]));
      const mem_free = amdParseFloat(safeGet(gpu_data, ["mem_usage", "free_visible_vram", "value"]));

      // 计算显存使用率，防止除以零
      let mem_utilization = 0;
      if (mem_total > 0) {
        mem_utilization = ((1.0 - (mem_total - mem_free)) / mem_total) * 100;
      }

      // 功耗
      const powerDraw = amdParseFloat(safeGet(gpu_data, ["power", "socket_power", "value"]));
      const powerLimit = amdParseFloat(safeGet(d, ["limit", "max_power", "value"]));

      // 时钟频率
      const clockGraphics = amdParseInt(safeGet(gpu_data, ["clock", "gfx_0", "clk", "value"]));
      const clockMemory = amdParseInt(safeGet(gpu_data, ["clock", "mem_0", "clk", "value"]));

      // 风扇
      const fanSpeed = amdParseFloat(safeGet(gpu_data, ["fan", "usage", "value"]));

      // 温度
      const tempHotspot = amdParseInt(safeGet(gpu_data, ["temperature", "hotspot", "value"]));

      // GPU 利用率
      const gpuUtil = amdParseInt(safeGet(gpu_data, ["usage", "gfx_activity", "value"]));

      return {
        index: i,
        name: safeGet(d, ["asic", "market_name"]) || `AMD GPU ${i}`,
        driverVersion: safeGet(d, ["driver", "version"]) || "Unknown",
        temperature: tempHotspot,
        utilization: {
          gpu: gpuUtil,
          memory: mem_utilization,
        },
        memory: {
          total: mem_total,
          used: mem_used,
          free: mem_free,
        },
        power: {
          draw: powerDraw,
          limit: powerLimit,
        },
        clocks: {
          graphics: clockGraphics,
          memory: clockMemory,
        },
        fan: {
          speed: fanSpeed,
        }
      };
    });

  return gpus;
}
