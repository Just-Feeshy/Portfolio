import { Renderer, Camera, Transform, Geometry, Program, Mesh, Vec3 } from './assets/js/ogl.mjs'

const canvas = document.querySelector('.home-hero__canvas')
if (canvas) {
  initHeroWebgl(canvas).catch((error) => {
    console.warn('Failed to initialize hero WebGL:', error)
  })
}

async function initHeroWebgl(canvas) {
  const vertexSource = await loadShader(
    new URL('./assets/shaders/hero.vert.glsl', import.meta.url)
  )
  const fragmentSource = await loadShader(
    new URL('./assets/shaders/hero.frag.glsl', import.meta.url)
  )

  const renderer = new Renderer({
    canvas,
    dpr: Math.min(window.devicePixelRatio || 1, 2),
    alpha: true,
    depth: true,
  })
  const gl = renderer.gl
  gl.clearColor(0, 0, 0, 0)

  const hero = canvas.closest('.home-hero, .project-cs-hero')

  const camera = new Camera(gl, { fov: 45, near: 0.1, far: 100.0 })
  const cameraTarget = new Vec3(0, 0, 0)
  const cameraPosition = new Vec3(0.0, 0.7, 0.4)

  const scene = new Transform()

  const planeWidth = 30
  const planeDepth = 30
  const segmentsX = 120
  const segmentsZ = 120
  const positions = []
  const uvs = []
  const indices = []
  const stepX = planeWidth / segmentsX
  const stepZ = planeDepth / segmentsZ

  for (let z = 0; z <= segmentsZ; z += 1) {
    for (let x = 0; x <= segmentsX; x += 1) {
      const xPos = -planeWidth / 2 + x * stepX
      const zPos = -planeDepth / 2 + z * stepZ
      positions.push(xPos, 0, zPos)
      uvs.push(x / segmentsX, z / segmentsZ)
    }
  }

  for (let z = 0; z < segmentsZ; z += 1) {
    for (let x = 0; x < segmentsX; x += 1) {
      const row = segmentsX + 1
      const a = z * row + x
      const b = a + 1
      const c = a + row
      const d = c + 1
      // Wind CCW when viewed from +Y so the top face is front-facing.
      indices.push(a, c, b, b, c, d)
    }
  }

  const geometry = new Geometry(gl, {
    position: {
      size: 3,
      data: new Float32Array(positions),
    },
    uv: {
      size: 2,
      data: new Float32Array(uvs),
    },
    index: {
      data: new Uint16Array(indices),
    },
  })
  const lightDir = [-0.6, 0.7, 0.3]
  const lightLen = Math.hypot(lightDir[0], lightDir[1], lightDir[2]) || 1
  const lightDirNorm = lightDir.map((v) => v / lightLen)
  const program = new Program(gl, {
    vertex: vertexSource,
    fragment: fragmentSource,
    uniforms: {
      uColor: { value: [6.0/255.0, 66.0/255.0, 115/255.0, 0.8] },
      uTime: { value: 0 },
      uLightDir: { value: lightDirNorm },
      uNear: { value: camera.near },
      uFar: { value: camera.far },
      uFogColor: { value: [0.05, 0.07, 0.12] },
      uFogNear: { value: 2.0 },
      uFogFar: { value: 12.0 },
      uSpecStrength: { value: 0.7 },
      uShininess: { value: 80.0 },
    },
    depthTest: true,
    depthWrite: true,
  })

  const mesh = new Mesh(gl, { geometry, program })
  mesh.setParent(scene)
  mesh.frustumCulled = false

  const updateCamera = () => {
    camera.position.copy(cameraPosition)
  }

  const resize = () => {
    const bounds = hero ? hero.getBoundingClientRect() : canvas.getBoundingClientRect()
    const width = Math.max(1, bounds.width)
    const height = Math.max(1, bounds.height)
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    renderer.setSize(width, height)
    const aspect = width / height
    camera.perspective({ aspect })
    program.uniforms.uNear.value = camera.near
    program.uniforms.uFar.value = camera.far
    mesh.scale.set(aspect, 1, 1)
    updateCamera()
  }

  const render = (time) => {
    resize()
    program.uniforms.uTime.value = time * 0.001
    renderer.render({ scene, camera })
    requestAnimationFrame(render)
  }

  window.addEventListener('resize', resize)
  render()
}

async function loadShader(url) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Shader load failed: ${url}`)
  }
  return response.text()
}
