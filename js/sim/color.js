// Color science helpers. Everything the imaging engine does happens in
// linear-light sRGB (Rec.709 primaries), so this module only has to answer:
// "what RGB color is a light of N kelvin?" and the sRGB transfer function.

// Planckian locus → CIE 1931 xy (Kim et al. 2002 cubic-spline fit,
// valid ~1667K–25000K).
function kelvinToXy(kelvin) {
  const T = Math.min(25000, Math.max(1667, kelvin));
  const t = 1 / T;
  let x;
  if (T <= 4000) {
    x = -0.2661239e9 * t ** 3 - 0.2343589e6 * t ** 2 + 0.8776956e3 * t + 0.17991;
  } else {
    x = -3.0258469e9 * t ** 3 + 2.1070379e6 * t ** 2 + 0.2226347e3 * t + 0.24039;
  }
  let y;
  if (T <= 2222) {
    y = -1.1063814 * x ** 3 - 1.3481102 * x ** 2 + 2.18555832 * x - 0.20219683;
  } else if (T <= 4000) {
    y = -0.9549476 * x ** 3 - 1.37418593 * x ** 2 + 2.09137015 * x - 0.16748867;
  } else {
    y = 3.081758 * x ** 3 - 5.8733867 * x ** 2 + 3.75112997 * x - 0.37001483;
  }
  return [x, y];
}

// Linear-sRGB color of a blackbody light, normalized to luminance Y = 1 so a
// warmer or cooler light never secretly changes exposure — only color.
export function kelvinToLinearRgb(kelvin) {
  const [x, y] = kelvinToXy(kelvin);
  const X = x / y;
  const Y = 1;
  const Z = (1 - x - y) / y;
  const r = 3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z;
  const g = -0.969266 * X + 1.8760108 * Y + 0.041556 * Z;
  const b = 0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z;
  return [Math.max(r, 0.001), Math.max(g, 0.001), Math.max(b, 0.001)];
}

// Camera white balance = per-channel gains that exactly cancel a light of the
// chosen temperature (von Kries-style scaling in RGB). Light at the same K as
// the WB setting renders neutral; anything else keeps a cast.
export function whiteBalanceGains(kelvin) {
  const [r, g, b] = kelvinToLinearRgb(kelvin);
  return [1 / r, 1 / g, 1 / b];
}

export function srgbToLinear(v) {
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

export function linearToSrgb(v) {
  return v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
}

export const LUMA = [0.2126, 0.7152, 0.0722];
