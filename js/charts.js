/* charts.js -- tiny dependency-free Canvas 2-D plotting helper used by every view.
 * One linear scale per axis; every tick label is a value the axis actually reaches.
 * Colors come from CSS tokens so charts follow the light/dark theme. */
(function () {
  "use strict";
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  function niceStep(span, target) {
    const raw = span / Math.max(target, 1);
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / p;
    return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
  }
  function ticks(lo, hi, target) {
    const s = niceStep(hi - lo, target), out = [];
    for (let v = Math.ceil(lo / s - 1e-9) * s; v <= hi + 1e-9; v += s) out.push(+v.toFixed(10));
    return out;
  }

  class Plot {
    /** opts: {height, pad:{l,r,t,b}, xLabel, yLabel, equal:bool} */
    constructor(canvas, opts) {
      this.c = canvas; this.ctx = canvas.getContext("2d");
      this.o = Object.assign({ height: 300, pad: { l: 56, r: 16, t: 14, b: 42 }, equal: false }, opts);
      this.x0 = 0; this.x1 = 1; this.y0 = 0; this.y1 = 1;
      this.resize();
    }
    resize() {
      const dpr = window.devicePixelRatio || 1;
      const w = this.c.clientWidth || this.c.parentElement.clientWidth || 600;
      const h = typeof this.o.height === "function" ? this.o.height(w) : this.o.height;
      this.c.style.height = h + "px";
      this.c.width = Math.round(w * dpr); this.c.height = Math.round(h * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.W = w; this.H = h;
    }
    get pw() { return this.W - this.o.pad.l - this.o.pad.r; }
    get ph() { return this.H - this.o.pad.t - this.o.pad.b; }
    /** Set data domain.  With equal:true the larger span wins so 1 unit = same pixels on both axes. */
    domain(x0, x1, y0, y1) {
      this.x0 = x0; this.x1 = x1; this.y0 = y0; this.y1 = y1;
      if (this.o.equal) {
        const sx = this.pw / (x1 - x0), sy = this.ph / (y1 - y0), s = Math.min(sx, sy);
        this.x1 = x0 + this.pw / s; this.y1 = y0 + this.ph / s;
      }
      return this;
    }
    X(v) { return this.o.pad.l + ((v - this.x0) / (this.x1 - this.x0)) * this.pw; }
    Y(v) { return this.o.pad.t + this.ph - ((v - this.y0) / (this.y1 - this.y0)) * this.ph; }
    invX(px) { return this.x0 + ((px - this.o.pad.l) / this.pw) * (this.x1 - this.x0); }
    invY(py) { return this.y0 + ((this.o.pad.t + this.ph - py) / this.ph) * (this.y1 - this.y0); }
    clear() { this.ctx.clearRect(0, 0, this.W, this.H); return this; }
    axes(xLabel, yLabel, opt = {}) {
      const g = this.ctx, l = this.o.pad.l, t = this.o.pad.t;
      g.save();
      g.font = "11px " + css("--font-data");
      const xt = opt.xticks || ticks(this.x0, this.x1, Math.max(3, Math.floor(this.pw / 80)));
      const yt = opt.yticks || ticks(this.y0, this.y1, Math.max(3, Math.floor(this.ph / 45)));
      g.strokeStyle = css("--grid"); g.lineWidth = 1;
      if (!opt.noGrid) xt.forEach((v) => { const x = Math.round(this.X(v)) + 0.5; g.beginPath(); g.moveTo(x, t); g.lineTo(x, t + this.ph); g.stroke(); });
      if (!opt.noGrid) yt.forEach((v) => { const y = Math.round(this.Y(v)) + 0.5; g.beginPath(); g.moveTo(l, y); g.lineTo(l + this.pw, y); g.stroke(); });
      g.strokeStyle = css("--muted");
      g.beginPath(); g.moveTo(l, t); g.lineTo(l, t + this.ph); g.lineTo(l + this.pw, t + this.ph); g.stroke();
      g.fillStyle = css("--muted"); g.textAlign = "center"; g.textBaseline = "top";
      const fx = opt.fmtX || ((v) => +v.toFixed(3) + "");
      const fy = opt.fmtY || ((v) => +v.toFixed(3) + "");
      xt.forEach((v) => g.fillText(fx(v), this.X(v), t + this.ph + 5));
      g.textAlign = "right"; g.textBaseline = "middle";
      yt.forEach((v) => g.fillText(fy(v), l - 6, this.Y(v)));
      g.font = "12px " + css("--font-body"); g.fillStyle = css("--ink");
      g.textAlign = "center"; g.textBaseline = "bottom";
      g.fillText(xLabel, l + this.pw / 2, this.H - 4);
      g.save(); g.translate(13, t + this.ph / 2); g.rotate(-Math.PI / 2); g.textBaseline = "middle";
      g.fillText(yLabel, 0, 0); g.restore();
      g.restore();
      return this;
    }
    clip(fn) {
      const g = this.ctx; g.save(); g.beginPath();
      g.rect(this.o.pad.l, this.o.pad.t - 2, this.pw + 2, this.ph + 2); g.clip(); fn(g); g.restore();
    }
    line(pts, color, width = 2, dash = null, alpha = 1) {
      this.clip((g) => {
        g.strokeStyle = color; g.lineWidth = width; g.globalAlpha = alpha;
        if (dash) g.setLineDash(dash);
        g.beginPath();
        pts.forEach((p, i) => (i ? g.lineTo(this.X(p[0]), this.Y(p[1])) : g.moveTo(this.X(p[0]), this.Y(p[1]))));
        g.stroke();
      });
    }
    dot(x, y, r, fill, stroke = null, shape = "circle") {
      const g = this.ctx, px = this.X(x), py = this.Y(y);
      g.save(); g.beginPath();
      if (shape === "diamond") { g.moveTo(px, py - r * 1.3); g.lineTo(px + r * 1.3, py); g.lineTo(px, py + r * 1.3); g.lineTo(px - r * 1.3, py); g.closePath(); }
      else g.arc(px, py, r, 0, 2 * Math.PI);
      if (fill) { g.fillStyle = fill; g.fill(); }
      if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1.6; g.stroke(); }
      g.restore();
    }
    text(s, x, y, color, align = "left", base = "middle", font = null, dx = 0, dy = 0) {
      const g = this.ctx; g.save();
      g.fillStyle = color; g.textAlign = align; g.textBaseline = base;
      g.font = font || "12px " + css("--font-body");
      g.fillText(s, this.X(x) + dx, this.Y(y) + dy); g.restore();
    }
    /** Text with a contrasting outline so it stays readable over a heat map. */
    haloText(s, x, y, color, halo, align = "left", base = "middle", font = null, dx = 0, dy = 0) {
      const g = this.ctx; g.save();
      g.textAlign = align; g.textBaseline = base; g.font = font || "600 12px " + css("--font-body");
      g.lineWidth = 3.5; g.strokeStyle = halo; g.lineJoin = "round";
      g.strokeText(s, this.X(x) + dx, this.Y(y) + dy);
      g.fillStyle = color; g.fillText(s, this.X(x) + dx, this.Y(y) + dy); g.restore();
    }
    arrow(x0, y0, x1, y1, color, w = 2.2) {   // pixel coordinates
      const g = this.ctx, a = Math.atan2(y1 - y0, x1 - x0), L = Math.hypot(x1 - x0, y1 - y0);
      if (L < 1) return;
      const h = Math.min(9, L * 0.45);
      g.save(); g.strokeStyle = color; g.fillStyle = color; g.lineWidth = w;
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1 - h * 0.7 * Math.cos(a), y1 - h * 0.7 * Math.sin(a)); g.stroke();
      g.beginPath(); g.moveTo(x1, y1);
      g.lineTo(x1 - h * Math.cos(a - 0.42), y1 - h * Math.sin(a - 0.42));
      g.lineTo(x1 - h * Math.cos(a + 0.42), y1 - h * Math.sin(a + 0.42)); g.closePath(); g.fill();
      g.restore();
    }
  }

  /** Tooltip bound to a .canvas-box; show(html, px, py) / hide(). */
  function Tip(box) {
    const el = document.createElement("div"); el.className = "tip"; el.hidden = true; box.appendChild(el);
    return {
      show(html, x, y) {
        el.innerHTML = html; el.hidden = false;
        const flip = x > box.clientWidth * 0.62;
        el.style.left = x + "px"; el.style.top = y + "px";
        el.style.transform = flip ? "translate(calc(-100% - 12px), -50%)" : "translate(12px, -50%)";
      },
      hide() { el.hidden = true; },
    };
  }

  /** Marching squares on a regular grid z[i][j] (i -> x index, j -> y index). Returns segments in index space. */
  function contour(z, level) {
    const segs = [], nx = z.length, ny = z[0].length;
    const lerp = (a, b) => (level - a) / (b - a);
    for (let i = 0; i < nx - 1; i++) for (let j = 0; j < ny - 1; j++) {
      const a = z[i][j], b = z[i + 1][j], c = z[i + 1][j + 1], d = z[i][j + 1];
      const pts = [];
      if ((a < level) !== (b < level)) pts.push([i + lerp(a, b), j]);
      if ((b < level) !== (c < level)) pts.push([i + 1, j + lerp(b, c)]);
      if ((c < level) !== (d < level)) pts.push([i + 1 - lerp(c, d), j + 1]);
      if ((d < level) !== (a < level)) pts.push([i, j + 1 - lerp(d, a)]);
      if (pts.length === 2) segs.push(pts);
      else if (pts.length === 4) { segs.push([pts[0], pts[1]]); segs.push([pts[2], pts[3]]); }
    }
    return segs;
  }

  /** Sequential single-hue ramp (light -> model blue -> dark), perceptually ordered. */
  function seqColor(t, dark) {
    t = Math.max(0, Math.min(1, t));
    const stops = dark
      ? [[24, 34, 46], [43, 86, 140], [104, 160, 226], [214, 233, 255]]
      : [[238, 244, 251], [158, 193, 233], [52, 112, 186], [12, 44, 96]];
    const s = t * (stops.length - 1), k = Math.min(Math.floor(s), stops.length - 2), f = s - k;
    const c = stops[k].map((v, i) => Math.round(v + f * (stops[k + 1][i] - v)));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }
  const isDark = () => {
    const a = document.documentElement.getAttribute("data-theme");
    return a ? a === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
  };

  window.Charts = { Plot, Tip, ticks, contour, seqColor, isDark, css };
})();
