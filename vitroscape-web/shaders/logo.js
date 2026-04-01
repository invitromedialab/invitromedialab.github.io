export const LOGO_VERT = `
    varying vec3 vNormal;
    varying vec3 vViewDir;
    varying vec4 vClip;
    void main() {
      vNormal  = normalize(normalMatrix * normal);
      vec4 mv  = modelViewMatrix * vec4(position, 1.0);
      vViewDir = normalize(-mv.xyz);
      gl_Position = projectionMatrix * mv;
      vClip = gl_Position;
    }
  `

export const LOGO_FRAG = `
    uniform sampler2D uBg;
    uniform vec3  uColor;
    uniform float uRoughness;
    uniform float uIri;
    uniform float uEnvBright;
    uniform float uReflStr;
    varying vec3 vNormal;
    varying vec3 vViewDir;
    varying vec4 vClip;

    vec3 iriRGB(float phase) {
      return 0.5 + 0.5 * cos(6.28318 * (vec3(0.0, 0.33, 0.67) + phase));
    }

    vec2 hash2(vec2 p) {
      p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
      return fract(sin(p) * 43758.5453) * 2.0 - 1.0;
    }

    void main() {
      // Screen-space UV
      vec2 screenUV = vClip.xy / vClip.w * 0.5 + 0.5;
      screenUV.y = 1.0 - screenUV.y;

      // Reflection direction → UV offset (simulates env map from kali)
      vec3 R = reflect(-vViewDir, vNormal);
      vec2 reflUV = screenUV + R.xy * uReflStr;

      // Roughness blur: jittered samples
      vec3 env = vec3(0.0);
      const int SAMPLES = 8;
      for (int i = 0; i < SAMPLES; i++) {
        vec2 jitter = hash2(screenUV + vec2(float(i) * 0.37, float(i) * 0.61)) * uRoughness * 0.06;
        env += texture2D(uBg, clamp(reflUV + jitter, 0.0, 1.0)).rgb;
      }
      env /= float(SAMPLES);

      // Fresnel: metals stay reflective even head-on
      float NdotV  = abs(dot(vNormal, vViewDir));
      float fresnel = mix(0.5, 1.0, pow(1.0 - NdotV, 3.0));

      // Iridescence at grazing angles
      vec3 iri = iriRGB(vNormal.x * 1.6 + vNormal.y * 0.9) * (1.0 - NdotV) * uIri;

      // Metal: tint the kali reflection with metal color + iridescent rim
      vec3 col = (env * uColor * fresnel + iri * 0.5) * uEnvBright;

      gl_FragColor = vec4(col, 1.0);
    }
  `
