attribute vec3 position;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform float uTime;
uniform mat3 normalMatrix;
uniform mat4 modelMatrix;

varying vec3 vNormal;
varying vec3 vViewPos;
varying vec3 vWorldPos;

#define N 32

float random(vec2 st) {
  return fract(
    sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123
  );
}

vec3 waveNormal(float dHdX, float dHdZ) {
  return normalize(normalMatrix * vec3(-dHdX, 1.0, -dHdZ));
}

void main() {
  float amp = 1.0;
  float freq = 1.0;
  float h = 0.0;
  float speed = 0.5;
  vec3 p = position;
  float dHdX = 0.0;
  float dHdZ = 0.0;

  for(int i = 0; i < N; ++i) {
    float fi = float(i) + 1.0;
	vec2 rand = normalize(vec2(
	  random(vec2(fi, fi)),
	  random(vec2(0.3 * fi, 0.7 * fi))
    ));

    float phase = dot(p.xz, rand) * freq + uTime * speed;
    float wave = 0.41 * exp(sin(phase) - 1.0) /** * exp(sin(pos.x * freq + uTime * speed) - 1.0) **/;
    float dx = wave * cos(phase);

	h += wave;
    dHdX += dx * rand.x * freq;
    dHdZ += dx * rand.y * freq;
    // p.xz += rand * -dx * 0.82;

    amp += 0.41;
    freq *= 1.18;
	speed *= 1.1;
  }

  float invAmp = 1.0 / (amp * 2.0);
  h *= invAmp;
  dHdX *= invAmp;
  dHdZ *= invAmp;
  vec3 pos = vec3(position.x, h, position.z);
  vNormal = waveNormal(dHdX, dHdZ);
  vViewPos = (modelViewMatrix * vec4(pos, 1.0)).xyz;
  vWorldPos = (modelMatrix * vec4(pos, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
