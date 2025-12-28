# Clone bitsandbytes By bitsandbytes-foundation

```bash
git clone https://github.com/bitsandbytes-foundation/bitsandbytes.git
```

# Activate Environment

```powershell
.\venv\Scripts\Activate.ps1
```

# Clean old build folder

```powershell
if (Test-Path build) { Remove-Item -Recurse -Force build }
```

# 1. Initialize ROCm SDK
```powershell
# Get path and replace backslashes with forward slashes
$ROCM_ROOT = (rocm-sdk path --root).Trim() -replace '\\', '/'

# Update environment variables
$env:HIP_PATH = $ROCM_ROOT
$env:ROCM_PATH = $ROCM_ROOT

# Verify path – it should look like D:/Software/... instead of D:\Software\...
Write-Host "Fixed ROCM_ROOT: $ROCM_ROOT"
```

# 2. Automatically Find Device Library Path
```powershell
# Search for the directory containing the ocml.bc file
$DeviceLibFile = Get-ChildItem -Path $ROCM_ROOT -Recurse -Filter "ocml.bc" -ErrorAction SilentlyContinue | Select-Object -First 1

if ($DeviceLibFile) {
    # Get directory path and replace backslashes
    $DEVICE_LIB_PATH = $DeviceLibFile.DirectoryName -replace '\\', '/'
    Write-Host "Found Device Lib Path: $DEVICE_LIB_PATH" -ForegroundColor Green
} else {
    Write-Host "Error: Could not find 'ocml.bc' in $ROCM_ROOT. Your ROCm SDK might be incomplete." -ForegroundColor Red
    # As a fallback, try pointing to the system installation path (if it exists)
    if (Test-Path "C:/Program Files/AMD/ROCm/6.4/amdgcn/bitcode") {
         $DEVICE_LIB_PATH = "C:/Program Files/AMD/ROCm/6.4/amdgcn/bitcode"
         Write-Host "Fallback: Using system Device Lib Path: $DEVICE_LIB_PATH" -ForegroundColor Yellow
    }
}
```

# 3. Enter bitsandbytes directory

```powershell
cd bitsandbytes
```

Open `csrc/ops_hip.cuh`
Modify `#include <unistd.h>` to:
```
#ifndef _WIN32
#include <unistd.h>
#endif
```

## Run CMake (with Release parameter)

```powershell
cmake -G Ninja -DCOMPUTE_BACKEND=hip -S . -B build `
    -DCMAKE_BUILD_TYPE="Release" `
    -DBNB_ROCM_ARCH=gfx1100 `
    -DHIP_PLATFORM="amd" `
    -DCMAKE_CXX_COMPILER="$ROCM_ROOT/lib/llvm/bin/clang++.exe" `
    -DCMAKE_PREFIX_PATH="$ROCM_ROOT" `
    -DCMAKE_HIP_COMPILER="$ROCM_ROOT/lib/llvm/bin/clang++.exe" `
    -DCMAKE_SHARED_LINKER_FLAGS="-L`"$ROCM_ROOT/lib`" -lamdhip64 -lrocblas" `
    -DCMAKE_HIP_FLAGS="-D__AMDGCN_WAVEFRONT_SIZE=32 --rocm-path=`"$ROCM_ROOT`" --rocm-device-lib-path=`"$DEVICE_LIB_PATH`"" `
    -DCMAKE_CXX_FLAGS="-D__AMDGCN_WAVEFRONT_SIZE=32 --rocm-path=`"$ROCM_ROOT`" --rocm-device-lib-path=`"$DEVICE_LIB_PATH`"" `
    -DCMAKE_HIP_ARCHITECTURES="gfx1100"
```


# 4. Execute Build and Move DLL
```powershell
cmake --build build
Copy-Item "build\libbitsandbytes_rocm*.dll" -Destination "bitsandbytes\" -Force
```

# 5. Install bitsandbytes
```bash
pip install .
```

# 6. Modify cuda_specs.py in venv, replace rocminfo with hipinfo
```python
def get_rocm_gpu_arch() -> str:
    """Get ROCm GPU architecture."""
    logger = logging.getLogger(__name__)
    try:
        if torch.version.hip:
            result = subprocess.run(["hipInfo"], capture_output=True, text=True, shell=True)
            match = re.search(r"gcnArch:\s+gfx([a-zA-Z\d]+)", result.stdout)
            # result = subprocess.run(["rocminfo"], capture_output=True, text=True)
            # match = re.search(r"Name:\s+gfx([a-zA-Z\d]+)", result.stdout)
            if match:
                return "gfx" + match.group(1)
            else:
                return "unknown"
        else:
            return "unknown"
    except Exception as e:
        logger.error(f"Could not detect ROCm GPU architecture: {e}")
        if torch.cuda.is_available():
            logger.warning(
                """
ROCm GPU architecture detection failed despite ROCm being available.
                """,
            )
        return "unknown"

def get_rocm_warpsize() -> int:
    """Get ROCm warp size."""
    logger = logging.getLogger(__name__)
    try:
        if torch.version.hip:
            result = subprocess.run(["hipInfo"], capture_output=True, text=True, shell=True)
            match = re.search(r"warpSize:\s+([0-9]{2})", result.stdout)
            # result = subprocess.run(["rocminfo"], capture_output=True, text=True)
            # match = re.search(r"Wavefront Size:\s+([0-9]{2})\(0x[0-9]{2}\)", result.stdout)
            if match:
                return int(match.group(1))
            else:
                # default to 64 to be safe
                return 64
        else:
            # nvidia cards always use 32 warp size
            return 32
    except Exception as e:
        logger.error(f"Could not detect ROCm warp size: {e}. Defaulting to 64. (some 4-bit functions may not work!)")
        if torch.cuda.is_available():
            logger.warning(
                """
ROCm warp size detection failed despite ROCm being available.
                """,
            )
        return 64
```
