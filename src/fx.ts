// Shaders: the slow paint-swirl behind the table and the CRT pass over everything.
import { Filter, GlProgram } from "pixi.js";

const VERT = `in vec2 aPosition;
out vec2 vTextureCoord;
uniform highp vec4 uInputSize;
uniform highp vec4 uOutputFrame;
uniform vec4 uOutputTexture;
vec4 filterVertexPosition(void){
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  return vec4(position, 0.0, 1.0);
}
vec2 filterTextureCoord(void){ return aPosition * (uOutputFrame.zw * uInputSize.zw); }
void main(void){ gl_Position = filterVertexPosition(); vTextureCoord = filterTextureCoord(); }`;

const SWIRL = `in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform highp vec4 uInputSize;
uniform highp vec4 uOutputFrame;
uniform float uTime;
uniform float uHeat;
uniform vec3 uA;
uniform vec3 uB;
uniform vec3 uC;
void main(void){
  vec2 frame = uOutputFrame.zw * uInputSize.zw;
  vec2 px = (vTextureCoord / frame) * uOutputFrame.zw;
  float block = 5.0;
  px = floor(px / block) * block;
  vec2 res = uOutputFrame.zw;
  vec2 uv = (px - 0.5 * res) / length(res) * 2.2;
  float t = uTime * 0.06 * (1.0 + uHeat * 2.5);
  float r = length(uv);
  float a = atan(uv.y, uv.x) + t * 1.4 + (1.7 - r) * (1.6 + 0.6 * sin(t * 0.8));
  uv = vec2(cos(a), sin(a)) * r;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    uv += 0.32 * vec2(sin(uv.y * 2.3 + t * 1.7 + fi * 1.3), cos(uv.x * 2.1 - t * 1.3 + fi * 0.7));
  }
  float f = 0.5 + 0.5 * sin(length(uv) * 3.4 - t * 3.0);
  float g = 0.5 + 0.5 * sin(uv.x * 2.0 + uv.y * 1.3 + t);
  vec3 col = mix(uA, uB, smoothstep(0.15, 0.85, f));
  col = mix(col, uC, smoothstep(0.62, 0.98, g * f) * 0.75);
  col *= 0.82 + 0.18 * f;
  finalColor = vec4(col, 1.0);
}`;

const CRT = `in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform highp vec4 uInputSize;
uniform highp vec4 uOutputFrame;
uniform float uTime;
uniform float uCurve;
uniform float uScan;
uniform float uShake;
void main(void){
  vec2 frame = uOutputFrame.zw * uInputSize.zw;
  vec2 uv = vTextureCoord / frame;
  vec2 cc = uv - 0.5;
  float d = dot(cc, cc);
  vec2 w = uv + cc * d * uCurve * 0.09;
  if (w.x < 0.0 || w.y < 0.0 || w.x > 1.0 || w.y > 1.0) { finalColor = vec4(0.03, 0.0, 0.02, 1.0); return; }
  vec2 tc = w * frame;
  float ab = (0.0005 + uShake * 0.004) * uCurve;
  vec4 base = texture(uTexture, tc);
  vec3 col;
  col.r = texture(uTexture, tc + vec2(ab, 0.0) * frame).r;
  col.g = base.g;
  col.b = texture(uTexture, tc - vec2(ab, 0.0) * frame).b;
  float py = w.y * uOutputFrame.w;
  float scan = 0.5 + 0.5 * sin(py * 2.0944);
  col *= 1.0 - uScan * (1.0 - scan) * 0.28;
  col *= 1.0 - smoothstep(0.18, 0.62, d) * 0.55;
  col *= 1.0 + 0.010 * sin(uTime * 50.0) * uScan;
  finalColor = vec4(col, 1.0);
}`;

export type FxFilter = Filter & { u: Keyed<string, unknown> };

function make(name: string, fragment: string, uniforms: Keyed<string, { value: unknown; type: string }>): FxFilter {
  const f = new Filter({
    glProgram: GlProgram.from({ vertex: VERT, fragment, name }),
    resources: { fx: uniforms },
  }) as FxFilter;
  f.u = (f.resources as unknown as { fx: { uniforms: Keyed<string, unknown> } }).fx.uniforms;
  return f;
}

const hex3 = (hex: number) => new Float32Array([((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255]);

export function swirlFilter(): FxFilter {
  return make("kk-swirl", SWIRL, {
    uTime: { value: 0, type: "f32" },
    uHeat: { value: 0, type: "f32" },
    uA: { value: hex3(0x3a0a2c), type: "vec3<f32>" },
    uB: { value: hex3(0x0e5257), type: "vec3<f32>" },
    uC: { value: hex3(0xb01a66), type: "vec3<f32>" },
  });
}

export function setSwirlColors(f: FxFilter, a: number, b: number, c: number) {
  f.u.uA = hex3(a);
  f.u.uB = hex3(b);
  f.u.uC = hex3(c);
}

export function crtFilter(): FxFilter {
  return make("kk-crt", CRT, {
    uTime: { value: 0, type: "f32" },
    uCurve: { value: 1, type: "f32" },
    uScan: { value: 1, type: "f32" },
    uShake: { value: 0, type: "f32" },
  });
}
