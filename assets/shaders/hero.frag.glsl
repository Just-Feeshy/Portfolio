precision highp float;

uniform vec4 uColor;
uniform float uNear;
uniform float uFar;
uniform vec3 uLightDir;
uniform float uSpecStrength;
uniform float uShininess;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform mat4 viewMatrix;
uniform vec3 cameraPosition;

varying vec3 vNormal;
varying vec3 vViewPos;
varying vec3 vWorldPos;

void main() {
  vec3 n = normalize(vNormal);
  vec3 l = normalize((viewMatrix * vec4(uLightDir, 0.0)).xyz);
  float diffuse = max(dot(n, l), 0.0);
  vec3 viewDir = normalize(-vViewPos);
  vec3 halfDir = normalize(l + viewDir);
  float spec = pow(max(dot(n, halfDir), 0.0), uShininess);
  vec3 lit = uColor.rgb * (0.5 * diffuse + 0.5) + vec3(1.0) * spec * uSpecStrength;
  float fogDist = distance(cameraPosition, vWorldPos);
  float fogFactor = clamp((fogDist - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
  vec3 color = mix(lit, uFogColor, fogFactor);
  gl_FragColor = vec4(color, uColor.a);
}
