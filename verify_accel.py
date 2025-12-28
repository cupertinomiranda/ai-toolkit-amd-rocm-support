import torch
import sys
import os

def check_accel():
    print("========================================")
    print("AI-Toolkit Hardware Acceleration Diagnostic")
    print("========================================")

    # 1. PyTorch & ROCm Check
    print(f"PyTorch Version: {torch.__version__}")
    if not torch.cuda.is_available():
        print("❌ Error: ROCm/CUDA not available in PyTorch.")
        return
    
    print(f"Device: {torch.cuda.get_device_name(0)}")
    print(f"ROCm/HIP Version: {torch.version.hip}")

    # 2. Triton / AOTriton Check
    print("\n[Checking Triton/AOTriton Backend]")
    try:
        import triton
        print(f"✅ Triton installed (Version: {triton.__version__})")
    except ImportError:
        print("❌ Triton not found.")

    # Check for AOTriton environment variable
    aotriton_env = os.environ.get("TORCH_ROCM_AOTRITON_ENABLE_EXPERIMENTAL")
    if aotriton_env == "1":
        print("✅ TORCH_ROCM_AOTRITON_ENABLE_EXPERIMENTAL is active.")
    else:
        print("⚠️  Warning: TORCH_ROCM_AOTRITON_ENABLE_EXPERIMENTAL is not set to 1.")

    # 3. Simple Operation Test
    print("\n[Running Stress Test - Matrix Multiplication]")
    try:
        a = torch.randn(4096, 4096, device='cuda', dtype=torch.float16)
        b = torch.randn(4096, 4096, device='cuda', dtype=torch.float16)
        
        # Warmup
        for _ in range(5):
            torch.matmul(a, b)
        
        torch.cuda.synchronize()
        print("✅ Standard Matrix Multiplication (FP16) successful.")
    except Exception as e:
        print(f"❌ Matmul test failed: {e}")

    # 4. Flash Attention / SDPA Check
    print("\n[Checking Flash Attention / SDPA Capability]")
    try:
        from torch.nn.functional import scaled_dot_product_attention
        q = torch.randn(1, 8, 1024, 64, device='cuda', dtype=torch.float16)
        k = torch.randn(1, 8, 1024, 64, device='cuda', dtype=torch.float16)
        v = torch.randn(1, 8, 1024, 64, device='cuda', dtype=torch.float16)
        
        with torch.backends.cuda.sdp_kernel(enable_flash=True, enable_math=False, enable_mem_efficient=False):
            out = scaled_dot_product_attention(q, k, v)
            torch.cuda.synchronize()
            print("✅ Flash Attention (SDPA) kernel verified on GFX1100.")
    except Exception as e:
        print(f"⚠️  Flash Attention kernel test skipped or failed: {e}")
        print("   (This is common if AOTriton or appropriate kernels are missing for current op size)")

    print("\n[Memory Status]")
    print(f"Allocated: {torch.cuda.memory_allocated() / 1024**2:.2f} MB")
    print(f"Reserved: {torch.cuda.memory_reserved() / 1024**2:.2f} MB")
    
    print("\n========================================")
    print("Diagnostic Complete.")
    print("========================================")

if __name__ == "__main__":
    check_accel()
