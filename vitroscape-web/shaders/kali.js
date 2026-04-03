export const KALI_VERT = `void main() { gl_Position = vec4(position, 1.0); }`

export const KALI_FRAG = `
    uniform vec2  uResolution;
    uniform float uTime;
    uniform float uMph;
    uniform float uScroll;
    uniform vec3  uParam0;
    uniform vec3  uParam1;
    uniform vec3  uParamFix;
    uniform float uRefineAmt;
    uniform float uDistInit;
    uniform float uGemBright;
    uniform vec3  uDarkColor;
    uniform float uAccu0;
    uniform float uAccu1;
    uniform float uScrollCam;
    uniform float uInvert;
    uniform float uHueShift;
    uniform float uSaturation;
    uniform float uBrightness;
    uniform float uContrast;
    uniform float uGamma;
    uniform float uEdgePos;
    uniform float uEdgeWidth;
    uniform float uEdgeStrength;
    uniform float uEdgeInvert;

    vec2 rotate(in vec2 v, float r) {
      float s = sin(r), c = cos(r);
      return vec2(v.x*c - v.y*s, v.x*s + v.y*c);
    }

    vec3 kali_sky(in vec3 pos, in vec3 dir) {
      float mph = uMph;
      vec4 col  = vec4(0., 0., 0., 1.);
      float t = 0., pln = 16.;

      for (int k = 0; k < 20; ++k) {
        vec4 p     = vec4(pos + t * dir, 1.);
        vec3 param = mix(uParam0, uParam1, mph);

        float d = uDistInit;
        vec3 av = vec3(0.);
        for (int i = 0; i < 8; ++i) {
          p = abs(p) / dot(p.xyz, p.xyz);
          d = min(d, mix(p.x + p.y + p.z, length(p.xy), mph) / p.w);
          if (i == 1) pln = min(pln, dot(p.xyz, vec3(0., 0., 1.)) / p.w);
          av += p.xyz / (4. + p.w);
          p.xyz -= param - 100.*col.x*mph*(1. - mph);
        }

        d += .03*(1. - mph)*smoothstep(0.1, 0., t);
        if (d <= 0.0) break;
        col.w = min(col.w, d);

        for (int i = 0; i < 5; ++i) {
          p = abs(p) / dot(p.xyz, p.xyz);
          av += p.xyz / (4. + p.w);
          p.xyz -= uParamFix - uRefineAmt * p.xyz;
        }

        col.xyz += max(av / uAccu0, p.xyz / uAccu1);
        t += min(0.1, mix(d*d, d, mph));
      }

      return mix(
        col.xyz / col.w * (uGemBright - 2.*mph) / (1. + .2*t),
        mph - 0.0001*length(pos)/col.www - (1. - mph*0.4)*uDarkColor/(1. + pln),
        mph);
    }

    vec3 rgb2hsv(vec3 c) {
      vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0);
      vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
      vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
      float d = q.x - min(q.w, q.y);
      float e = 1.0e-10;
      return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
    }

    vec3 hsv2rgb(vec3 c) {
      vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
      vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
      return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
    }

    void main() {
      vec2  uv  = (gl_FragCoord.xy - uResolution * .5) / uResolution.y * 2.;
      float mph = uMph;
      vec3  dir = normalize(vec3(uv, (.9 + .2*mph) - 0.4*length(uv)));
      float t   = uTime / 2. + uScroll * uScrollCam;
      vec3  pos = vec3(
        (1. - mph*.5) * sin(t/2.),
        (.3 - .2*mph) * cos(t/2.),
        (.3 + 2.*mph) * (-1.5 + sin(t/4.13))
      );
      pos.xy /= 1.001 - mph + 0.2 * -pos.z;
      dir.yz = rotate(dir.yz, -1.4 + mph + (1. - .6*mph)*(-.5 + 0.5*sin(t/4.13 + 2. + sin(t/1.75))));
      dir.xy = rotate(dir.xy, sin(t/2.) + 0.2*sin(t + sin(t/3.)));

      vec3 col = kali_sky(pos, dir);

      col *= uBrightness;
      col = (col - 0.5) * uContrast + 0.5;

      vec3 hsv = rgb2hsv(col);
      hsv.x = fract(hsv.x + uHueShift / (2.0 * 3.14159265));
      hsv.y *= uSaturation;
      col = hsv2rgb(hsv);

      col = pow(max(col, vec3(0.0)), vec3(1.0 / uGamma));
      col = mix(col, 1.0 - col, uInvert);
      col = clamp(col, vec3(0.0), vec3(1.0));

      // Irregular bottom edge: fractal colours distort the fade boundary
      float yNorm = gl_FragCoord.y / uResolution.y;
      float lum   = dot(col, vec3(0.299, 0.587, 0.114));
      float irreg = (lum - 0.5) * uEdgeStrength
                  + (col.r - col.b) * uEdgeStrength * 0.65
                  + (col.g - col.r) * uEdgeStrength * 0.40;
      float halfW       = max(uEdgeWidth * 0.5, 0.001);
      float bottomAlpha = smoothstep(-halfW, halfW, yNorm - uEdgePos + irreg);
      float topAlpha    = smoothstep(-halfW, halfW, (1.0 - yNorm) - uEdgePos + irreg);
      float alpha = bottomAlpha * topAlpha;
      alpha = mix(alpha, 1.0 - alpha, uEdgeInvert);
      gl_FragColor = vec4(col, alpha);
    }
  `
