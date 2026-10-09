// Seam-preserving mesh simplifier (quadric error, half-edge collapse onto existing vertices).
// Vertices are never moved or created, so every kept vertex keeps its exact UV, normal, skin weights and morph deltas.
// Topology is analysed on positions (vertices with identical positions = one "corner"); a corner is:
//   manifold  - one attribute wedge, no open edges        -> may collapse along any edge
//   border    - one wedge, exactly one open edge in/out   -> may collapse only along its border
//   seam      - two wedges along a UV/normal seam         -> may collapse only along the seam (both wedges move together)
//   locked    - anything else (corners of seams, non-manifold)
// Build: g++ -O2 -std=c++17 -o simplify simplify.cpp
// Usage: simplify in.bin out.bin target_triangles
//   in.bin  = uint32 n, uint32 m, float P[n*3], uint32 I[m*3], uint8 imp[n]  (255 = locked, else cost x (1 + imp)), float UV[n*2], float uvScale
//   The cost adds the texture slide: how far the texel under the removed vertex moves (in uvScale units).
//   out.bin = uint32 m2, uint32 I2[m2*3]
#include <cstdio>
#include <cstdint>
#include <cstring>
#include <cmath>
#include <vector>
#include <unordered_map>
#include <algorithm>
using namespace std;
typedef uint64_t u64;
struct Q { double a[10]; Q() { memset(a, 0, sizeof a); }
  void add(const Q& o, double w = 1) { for (int i = 0; i < 10; i++) a[i] += o.a[i] * w; }
  static Q plane(double x, double y, double z, double d, double w) { Q q; double* a = q.a;
    a[0] = x * x * w; a[1] = x * y * w; a[2] = x * z * w; a[3] = x * d * w; a[4] = y * y * w; a[5] = y * z * w; a[6] = y * d * w; a[7] = z * z * w; a[8] = z * d * w; a[9] = d * d * w; return q; }
  double eval(const float* p) const { double x = p[0], y = p[1], z = p[2];
    return a[0] * x * x + 2 * a[1] * x * y + 2 * a[2] * x * z + 2 * a[3] * x + a[4] * y * y + 2 * a[5] * y * z + 2 * a[6] * y + a[7] * z * z + 2 * a[8] * z + a[9]; } };
enum { MANIFOLD = 0, BORDER = 1, SEAM = 2, LOCKED = 3 };
static inline u64 key(uint32_t a, uint32_t b) { return ((u64)a << 32) | b; }
int main(int argc, char** argv) {
  if (argc < 4) { fprintf(stderr, "usage\n"); return 1; }
  FILE* f = fopen(argv[1], "rb"); uint32_t n, m; fread(&n, 4, 1, f); fread(&m, 4, 1, f);
  vector<float> P(n * 3); vector<uint32_t> I(m * 3); vector<uint8_t> lockIn(n);
  fread(P.data(), 4, n * 3, f); fread(I.data(), 4, m * 3, f); fread(lockIn.data(), 1, n, f); vector<float> UV(n * 2, 0.f); float uvScale = 0; fread(UV.data(), 4, n * 2, f); fread(&uvScale, 4, 1, f); fclose(f);
  size_t target = (size_t)atol(argv[3]);
  // corners: identical positions
  vector<uint32_t> corner(n); { unordered_map<u64, uint32_t> h; h.reserve(n * 2);
    for (uint32_t i = 0; i < n; i++) { uint32_t bx, by, bz; memcpy(&bx, &P[i * 3], 4); memcpy(&by, &P[i * 3 + 1], 4); memcpy(&bz, &P[i * 3 + 2], 4);
      u64 k = ((u64)bx * 73856093ull) ^ ((u64)by * 19349663ull << 1) ^ ((u64)bz * 83492791ull << 2);
      // resolve hash collisions by exact compare chain
      while (true) { auto it = h.find(k); if (it == h.end()) { h[k] = i; corner[i] = i; break; }
        uint32_t j = it->second; if (!memcmp(&P[j * 3], &P[i * 3], 12)) { corner[i] = j; break; } k = k * 6364136223846793005ull + 1442695040888963407ull; } } }
  vector<vector<uint32_t>> wedges(n); for (uint32_t i = 0; i < n; i++) wedges[corner[i]].push_back(i);
  // quadrics from the original surface (area-weighted planes), later merged on collapse
  vector<Q> quad(n);
  auto triNormal = [&](uint32_t a, uint32_t b, uint32_t c, double* nn) { const float *pa = &P[a * 3], *pb = &P[b * 3], *pc = &P[c * 3];
    double ux = pb[0] - pa[0], uy = pb[1] - pa[1], uz = pb[2] - pa[2], vx = pc[0] - pa[0], vy = pc[1] - pa[1], vz = pc[2] - pa[2];
    nn[0] = uy * vz - uz * vy; nn[1] = uz * vx - ux * vz; nn[2] = ux * vy - uy * vx; return sqrt(nn[0] * nn[0] + nn[1] * nn[1] + nn[2] * nn[2]); };
  for (uint32_t t = 0; t < m; t++) { uint32_t a = corner[I[t * 3]], b = corner[I[t * 3 + 1]], c = corner[I[t * 3 + 2]]; double nn[3]; double l = triNormal(a, b, c, nn);
    if (l < 1e-20) continue; double x = nn[0] / l, y = nn[1] / l, z = nn[2] / l, d = -(x * P[a * 3] + y * P[a * 3 + 1] + z * P[a * 3 + 2]);
    Q q = Q::plane(x, y, z, d, l * 0.5); quad[a].add(q); quad[b].add(q); quad[c].add(q); }
  vector<float> wgt(n, 1.0f); for (uint32_t i = 0; i < n; i++) wgt[corner[i]] = max(wgt[corner[i]], 1.0f + (lockIn[i] == 255 ? 0 : lockIn[i]));
  vector<uint32_t> wmap(n); for (uint32_t i = 0; i < n; i++) wmap[i] = i;
  auto find = [&](uint32_t w) { while (wmap[w] != w) { wmap[w] = wmap[wmap[w]]; w = wmap[w]; } return w; };
  bool edgeQuadDone = false;
  for (int pass = 0; pass < 200; pass++) {
    // current triangles
    vector<uint32_t> T; T.reserve(I.size());
    for (size_t t = 0; t < I.size(); t += 3) { uint32_t a = find(I[t]), b = find(I[t + 1]), c = find(I[t + 2]);
      if (corner[a] == corner[b] || corner[b] == corner[c] || corner[a] == corner[c]) continue; T.push_back(a); T.push_back(b); T.push_back(c); }
    I.swap(T); size_t tris = I.size() / 3;
    fprintf(stderr, "pass %d tris %zu\n", pass, tris);
    if (tris <= target) break;
    // half-edges: wedge level and corner level
    unordered_map<u64, int> hw, hc; hw.reserve(I.size() * 2); hc.reserve(I.size() * 2);
    for (size_t t = 0; t < I.size(); t += 3) for (int e = 0; e < 3; e++) { uint32_t a = I[t + e], b = I[t + (e + 1) % 3]; hw[key(a, b)]++; hc[key(corner[a], corner[b])]++; }
    vector<uint8_t> kind(n, MANIFOLD); vector<int> openOut(n, 0), openIn(n, 0), seamOut(n, 0), seamIn(n, 0);
    vector<uint8_t> nonman(n, 0);
    for (auto& kv : hc) if (kv.second > 1) { nonman[kv.first >> 32] = 1; nonman[kv.first & 0xffffffff] = 1; }
    for (size_t t = 0; t < I.size(); t += 3) for (int e = 0; e < 3; e++) { uint32_t a = I[t + e], b = I[t + (e + 1) % 3];
      if (hw.count(key(b, a))) continue;                              // interior at wedge level
      uint32_t ca = corner[a], cb = corner[b];
      if (hc.count(key(cb, ca))) { seamOut[ca]++; seamIn[cb]++; } else { openOut[ca]++; openIn[cb]++; } }
    // live wedges per corner (wedges that still appear in triangles)
    vector<uint8_t> live(n, 0); for (uint32_t w : I) live[w] = 1;
    vector<int> nw(n, 0); for (uint32_t i = 0; i < n; i++) if (live[i]) nw[corner[i]]++;
    for (uint32_t c = 0; c < n; c++) { if (!nw[c]) continue; uint8_t k;
      if (nonman[c]) k = LOCKED;
      else if (nw[c] == 1) k = (openOut[c] == 0 && openIn[c] == 0 && seamOut[c] == 0) ? MANIFOLD : (openOut[c] == 1 && openIn[c] == 1 && seamOut[c] == 0) ? BORDER : LOCKED;
      else if (nw[c] == 2) k = (openOut[c] == 0 && openIn[c] == 0 && seamOut[c] == 2 && seamIn[c] == 2) ? SEAM : LOCKED;
      else k = LOCKED;
      bool anyLock = false; for (uint32_t w : wedges[c]) if (lockIn[w] == 255) anyLock = true; if (anyLock) k = LOCKED;
      kind[c] = k; }
    // edge quadrics keep borders and seams in place (once, from the original shape)
    if (!edgeQuadDone) { edgeQuadDone = true;
      for (size_t t = 0; t < I.size(); t += 3) for (int e = 0; e < 3; e++) { uint32_t a = I[t + e], b = I[t + (e + 1) % 3]; if (hw.count(key(b, a))) continue;
        uint32_t ca = corner[a], cb = corner[b], cc = corner[I[t + (e + 2) % 3]]; double nn[3]; double l = triNormal(ca, cb, cc, nn); if (l < 1e-20) continue;
        double ex = P[cb * 3] - P[ca * 3], ey = P[cb * 3 + 1] - P[ca * 3 + 1], ez = P[cb * 3 + 2] - P[ca * 3 + 2], el = sqrt(ex * ex + ey * ey + ez * ez); if (el < 1e-20) continue;
        nn[0] /= l; nn[1] /= l; nn[2] /= l; double px = ey * nn[2] - ez * nn[1], py = ez * nn[0] - ex * nn[2], pz = ex * nn[1] - ey * nn[0], pl = sqrt(px * px + py * py + pz * pz); if (pl < 1e-20) continue;
        px /= pl; py /= pl; pz /= pl; double d = -(px * P[ca * 3] + py * P[ca * 3 + 1] + pz * P[ca * 3 + 2]);
        Q q = Q::plane(px, py, pz, d, el * el * 4.0); quad[ca].add(q); quad[cb].add(q); } }
    // corner -> triangles adjacency
    vector<uint32_t> tStart(n + 1, 0), tList(I.size()); for (uint32_t w : I) tStart[corner[w] + 1]++;
    for (uint32_t i = 0; i < n; i++) tStart[i + 1] += tStart[i];
    { vector<uint32_t> fill(tStart.begin(), tStart.end() - 1); for (size_t t = 0; t < I.size(); t += 3) for (int e = 0; e < 3; e++) tList[fill[corner[I[t + e]]]++] = (uint32_t)(t / 3); }
    auto edgeKind = [&](uint32_t ca, uint32_t cb, int want) {  // is corner edge ca-cb a border (want=BORDER) or seam (want=SEAM) edge?
      for (uint32_t k = tStart[ca]; k < tStart[ca + 1]; k++) { uint32_t t = tList[k];
        for (int e = 0; e < 3; e++) { uint32_t a = I[t * 3 + e], b = I[t * 3 + (e + 1) % 3]; uint32_t xa = corner[a], xb = corner[b];
          if (!((xa == ca && xb == cb) || (xa == cb && xb == ca))) continue;
          if (hw.count(key(b, a))) continue; bool seam = hc.count(key(xb, xa)); if ((want == SEAM) == seam) return true; } }
      return false; };
    // texture slide of collapsing corner a onto b: for every wedge of a, project its position into the surviving fan
    // (a replaced by b) and compare the interpolated UV with the wedge's own UV; area-weighted squared distance
    auto texSlide = [&](uint32_t a, uint32_t b) -> double {
      double area = 0, worst = 0; const float* pa = &P[a * 3];
      for (uint32_t k = tStart[a]; k < tStart[a + 1]; k++) { uint32_t t = tList[k]; double nn[3]; area += 0.5 * triNormal(corner[I[t * 3]], corner[I[t * 3 + 1]], corner[I[t * 3 + 2]], nn); }
      for (uint32_t wa : wedges[a]) { if (!live[wa]) continue;
        double best = 1e30, bestd = 1e30;
        // wedge of b that wa maps to (shares a triangle)
        uint32_t wb = UINT32_MAX;
        for (uint32_t k = tStart[a]; k < tStart[a + 1] && wb == UINT32_MAX; k++) { uint32_t t = tList[k]; bool hasA = false; uint32_t cb = UINT32_MAX;
          for (int j = 0; j < 3; j++) { uint32_t w = I[t * 3 + j]; if (w == wa) hasA = true; if (corner[w] == b) cb = w; } if (hasA && cb != UINT32_MAX) wb = cb; }
        if (wb == UINT32_MAX) continue;
        for (uint32_t k = tStart[a]; k < tStart[a + 1]; k++) { uint32_t t = tList[k]; uint32_t w3[3] = { I[t * 3], I[t * 3 + 1], I[t * 3 + 2] }; int ia = -1; bool hasB = false;
          for (int j = 0; j < 3; j++) { if (w3[j] == wa) ia = j; if (corner[w3[j]] == b) hasB = true; }
          if (ia < 0 || hasB) continue; w3[ia] = wb;
          const float *p0 = &P[corner[w3[0]] * 3], *p1 = &P[corner[w3[1]] * 3], *p2 = &P[corner[w3[2]] * 3];
          double e0[3] = { p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2] }, e1[3] = { p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2] }, q[3] = { pa[0] - p0[0], pa[1] - p0[1], pa[2] - p0[2] };
          double d00 = e0[0] * e0[0] + e0[1] * e0[1] + e0[2] * e0[2], d01 = e0[0] * e1[0] + e0[1] * e1[1] + e0[2] * e1[2], d11 = e1[0] * e1[0] + e1[1] * e1[1] + e1[2] * e1[2];
          double d20 = q[0] * e0[0] + q[1] * e0[1] + q[2] * e0[2], d21 = q[0] * e1[0] + q[1] * e1[1] + q[2] * e1[2], den = d00 * d11 - d01 * d01; if (fabs(den) < 1e-30) continue;
          double v = (d11 * d20 - d01 * d21) / den, w = (d00 * d21 - d01 * d20) / den, u = 1 - v - w;
          double out = max(0.0, -u) + max(0.0, -v) + max(0.0, -w);
          double U = u * UV[w3[0] * 2] + v * UV[w3[1] * 2] + w * UV[w3[2] * 2], V = u * UV[w3[0] * 2 + 1] + v * UV[w3[1] * 2 + 1] + w * UV[w3[2] * 2 + 1];
          double du = (U - UV[wa * 2]) * uvScale, dv = (V - UV[wa * 2 + 1]) * uvScale, e = du * du + dv * dv;
          if (out < bestd - 1e-9 || (out < bestd + 1e-9 && e < best)) { bestd = out; best = e; } }
        if (best < 1e29) worst = max(worst, best); }
      return worst * area; };
    // candidates
    struct C { float cost; uint32_t a, b; };
    vector<C> cand; cand.reserve(I.size());
    for (size_t t = 0; t < I.size(); t += 3) for (int e = 0; e < 3; e++) { uint32_t ca = corner[I[t + e]], cb = corner[I[t + (e + 1) % 3]];
      for (int dir = 0; dir < 2; dir++) { uint32_t a = dir ? cb : ca, b = dir ? ca : cb; uint8_t k = kind[a];
        if (k == LOCKED) continue;
        if (k == BORDER && !edgeKind(a, b, BORDER)) continue;
        if (k == SEAM && !edgeKind(a, b, SEAM)) continue;
        if (k == SEAM && kind[b] == MANIFOLD) continue;
        if (k == BORDER && kind[b] == MANIFOLD) continue;
        double geo = fabs(quad[a].eval(&P[b * 3])), tex = 0;
        if (uvScale > 0) tex = texSlide(a, b);
        if (tex < 0) continue;
        cand.push_back({ (float)((geo + tex) * max(wgt[a], wgt[b])), a, b }); } }
    sort(cand.begin(), cand.end(), [](const C& x, const C& y) { return x.cost < y.cost; });
    size_t need = tris - target; size_t removed = 0, done = 0;
    vector<uint8_t> busy(n, 0);
    for (auto& c : cand) {
      if (removed >= need) break;
      if (busy[c.a] || busy[c.b]) continue;
      // flip check on triangles around a that survive
      bool ok = true; int dies = 0;
      for (uint32_t k = tStart[c.a]; k < tStart[c.a + 1] && ok; k++) { uint32_t t = tList[k]; uint32_t v[3] = { corner[I[t * 3]], corner[I[t * 3 + 1]], corner[I[t * 3 + 2]] };
        if (v[0] == c.b || v[1] == c.b || v[2] == c.b) { dies++; continue; }
        double n0[3], n1[3]; double l0 = triNormal(v[0], v[1], v[2], n0); uint32_t u[3] = { v[0], v[1], v[2] }; for (int j = 0; j < 3; j++) if (u[j] == c.a) u[j] = c.b;
        double l1 = triNormal(u[0], u[1], u[2], n1); if (l1 < 1e-24) { ok = false; break; }
        if ((n0[0] * n1[0] + n0[1] * n1[1] + n0[2] * n1[2]) < 0.25 * l0 * l1) ok = false; }
      if (!ok || dies == 0) continue;
      // wedge mapping: each live wedge of a -> the wedge of b it shares a triangle with
      vector<pair<uint32_t, uint32_t>> mp;
      for (uint32_t k = tStart[c.a]; k < tStart[c.a + 1]; k++) { uint32_t t = tList[k]; uint32_t wa = UINT32_MAX, wb = UINT32_MAX;
        for (int j = 0; j < 3; j++) { uint32_t w = I[t * 3 + j]; if (corner[w] == c.a) wa = w; else if (corner[w] == c.b) wb = w; }
        if (wa == UINT32_MAX || wb == UINT32_MAX) continue; bool have = false; for (auto& p : mp) if (p.first == wa) { have = true; if (p.second != wb) ok = false; } if (!have) mp.push_back({ wa, wb }); }
      int liveA = 0; for (uint32_t w : wedges[c.a]) if (live[w]) liveA++;
      if (!ok || (int)mp.size() != liveA) continue;
      for (auto& p : mp) wmap[p.first] = p.second;
      quad[c.b].add(quad[c.a]);
      busy[c.a] = busy[c.b] = 1;
      for (uint32_t k = tStart[c.a]; k < tStart[c.a + 1]; k++) { uint32_t t = tList[k]; for (int j = 0; j < 3; j++) busy[corner[I[t * 3 + j]]] = 1; }
      removed += dies; done++;
    }
    if (!done) { fprintf(stderr, "no more collapses\n"); break; }
  }
  // final cleanup
  vector<uint32_t> T; for (size_t t = 0; t < I.size(); t += 3) { uint32_t a = find(I[t]), b = find(I[t + 1]), c = find(I[t + 2]);
    if (corner[a] == corner[b] || corner[b] == corner[c] || corner[a] == corner[c]) continue; T.push_back(a); T.push_back(b); T.push_back(c); }
  FILE* o = fopen(argv[2], "wb"); uint32_t m2 = (uint32_t)(T.size() / 3); fwrite(&m2, 4, 1, o); fwrite(T.data(), 4, T.size(), o); fclose(o);
  fprintf(stderr, "done %u -> %u triangles\n", m, m2);
  return 0;
}
