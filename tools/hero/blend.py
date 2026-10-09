"""Minimal pure-python reader for Blender 5.x (.blend v1 large-bhead) files."""
import struct, re

class Block:
    __slots__ = ("code", "sdna", "old", "len", "nr", "off")

class Blend:
    def __init__(self, path):
        self.d = d = open(path, "rb").read()
        assert d[:7] == b"BLENDER"
        hsize = int(d[7:9])
        pos = hsize
        self.blocks = []
        self.by_old = {}
        while pos < len(d):
            code, sdna, old, ln, nr = struct.unpack_from("<4siQqq", d, pos)
            b = Block(); b.code = code.rstrip(b"\0").decode("latin1"); b.sdna = sdna
            b.old = old; b.len = ln; b.nr = nr; b.off = pos + 32
            pos += 32 + ln
            self.blocks.append(b)
            if old: self.by_old[old] = b
            if b.code == "ENDB": break
        self._parse_dna()

    def _parse_dna(self):
        b = [x for x in self.blocks if x.code == "DNA1"][0]
        d = self.d; p = b.off; base = b.off
        assert d[p:p+4] == b"SDNA"; p += 4
        def names(p):
            assert d[p:p+4] in (b"NAME", b"TYPE"); p += 4
            n = struct.unpack_from("<i", d, p)[0]; p += 4
            out = []
            for _ in range(n):
                e = d.index(b"\0", p); out.append(d[p:e].decode("latin1")); p = e + 1
            p = base + ((p - base + 3) & ~3)
            return out, p
        self.names, p = names(p)
        self.types, p = names(p)
        assert d[p:p+4] == b"TLEN"; p += 4
        nt = len(self.types)
        self.tlen = struct.unpack_from("<%dh" % nt, d, p); p += 2 * nt
        p = base + ((p - base + 3) & ~3)
        assert d[p:p+4] == b"STRC"; p += 4
        ns = struct.unpack_from("<i", d, p)[0]; p += 4
        self.structs = []
        self.struct_by_type = {}
        for i in range(ns):
            t, nf = struct.unpack_from("<hh", d, p); p += 4
            fields = []
            off = 0
            for _ in range(nf):
                ft, fn = struct.unpack_from("<hh", d, p); p += 4
                name = self.names[fn]
                size, arr = self._field_size(ft, name)
                fields.append((self.types[ft], name, off, size, arr))
                off += size
            self.structs.append((self.types[t], fields))
            self.struct_by_type[self.types[t]] = i

    def _field_size(self, ft, name):
        dims = [int(x) for x in re.findall(r"\[(\d+)\]", name)]
        arr = 1
        for x in dims: arr *= x
        if name.startswith("*") or name.startswith("(*"):
            return 8 * arr, dims
        return self.tlen[ft] * arr, dims

    def fields(self, sname):
        return self.structs[self.struct_by_type[sname]][1]

    def get(self, sname, off, fname):
        for t, n, o, sz, dims in self.fields(sname):
            base = re.sub(r"\[.*", "", n)
            if base == fname or base.lstrip("*") == fname and n.startswith("*") and fname.startswith("*") is False and base == fname:
                return self._read(t, n, off + o, sz, dims)
        raise KeyError(f"{sname}.{fname}")

    def field(self, sname, fname):
        for t, n, o, sz, dims in self.fields(sname):
            if re.sub(r"\[.*", "", n).lstrip("*") == fname:
                return t, n, o, sz, dims
        raise KeyError(f"{sname}.{fname}")

    def read(self, sname, off, fname):
        t, n, o, sz, dims = self.field(sname, fname)
        return self._read(t, n, off + o, sz, dims)

    def _read(self, t, n, off, sz, dims):
        d = self.d
        if n.startswith("*") or n.startswith("(*"):
            if dims:
                c = sz // 8
                return list(struct.unpack_from("<%dQ" % c, d, off))
            return struct.unpack_from("<Q", d, off)[0]
        fmt = {"char": "b", "uchar": "B", "short": "h", "ushort": "H", "int": "i", "uint": "I",
               "float": "f", "double": "d", "int64_t": "q", "uint64_t": "Q", "int8_t": "b",
               "uint8_t": "B", "int16_t": "h", "uint16_t": "H", "int32_t": "i", "uint32_t": "I", "bool": "?"}.get(t)
        if t == "char" and dims:
            raw = d[off:off+sz]
            return raw.split(b"\0")[0].decode("utf8", "replace")
        if fmt:
            c = sz // struct.calcsize(fmt)
            v = struct.unpack_from("<%d%s" % (c, fmt), d, off)
            return v[0] if c == 1 else list(v)
        return ("struct", t, off)

    def sname_of(self, block):
        return self.structs[block.sdna][0]

    def blocks_of(self, code=None, sname=None):
        for b in self.blocks:
            if code and b.code != code: continue
            if sname and (b.sdna >= len(self.structs) or self.sname_of(b) != sname): continue
            yield b

    def deref(self, ptr):
        return self.by_old.get(ptr)

    def listbase(self, lb_off, sname):
        """Iterate (offset) of elements in a ListBase at offset lb_off."""
        first = struct.unpack_from("<Q", self.d, lb_off)[0]
        seen = set()
        while first and first not in seen:
            seen.add(first)
            b = self.deref(first)
            if not b: break
            yield b.off
            first = struct.unpack_from("<Q", self.d, b.off)[0]

    def cstr(self, ptr):
        b = self.deref(ptr)
        if not b: return None
        raw = self.d[b.off:b.off+b.len]
        return raw.split(b"\0")[0].decode("utf8", "replace")
