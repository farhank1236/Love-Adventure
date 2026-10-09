import ctypes, sys
lib = ctypes.CDLL("libzstd.so.1")
lib.ZSTD_findFrameCompressedSize.restype = ctypes.c_size_t
lib.ZSTD_getFrameContentSize.restype = ctypes.c_ulonglong
lib.ZSTD_decompress.restype = ctypes.c_size_t
lib.ZSTD_isError.restype = ctypes.c_uint
data = open(sys.argv[1],'rb').read()
out = bytearray(); pos = 0
while pos < len(data):
    buf = data[pos:]
    n = lib.ZSTD_findFrameCompressedSize(buf, len(buf))
    if lib.ZSTD_isError(n): print("err at", pos); break
    magic = int.from_bytes(buf[:4],'little')
    if (magic & 0xFFFFFFF0) == 0x184D2A50:  # skippable
        pos += n; continue
    sz = lib.ZSTD_getFrameContentSize(buf, n)
    dst = ctypes.create_string_buffer(sz)
    r = lib.ZSTD_decompress(dst, sz, buf, n)
    out += dst.raw[:r]; pos += n
open(sys.argv[2],'wb').write(out); print(len(out))
