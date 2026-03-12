import { Renderer, Camera, Transform, Geometry, Program, Mesh, Vec3 } from './assets/js/ogl.mjs'
import { Tween, Easing, update as tweenUpdate } from 'https://cdn.jsdelivr.net/npm/@tweenjs/tween.js@18.6.4/dist/tween.esm.js'

const HERO_GIF_LABELS = {
  idle: 'Save as looped gif',
  loading: 'Rendering seamless loop...',
  success: 'GIF saved',
  error: 'Export failed',
  unavailable: 'GIF unavailable',
}

const HERO_GIF_CONFIG = {
  filename: 'diego-fonseca-water-loop.gif',
  loopDurationSeconds: 12,
  frameRate: 20,
  maxWidth: 960,
  backgroundColor: '#000000',
  quality: 1,
  dither: false,
  captureStatusStep: 12,
  cropTopRatio: 0.36,
  libraryUrl: 'https://cdn.jsdelivr.net/npm/gif.js.optimized/dist/gif.js',
  workerUrl: 'https://cdn.jsdelivr.net/npm/gif.js.optimized/dist/gif.worker.js',
}

let shaderSourcePromise
let gifLibraryPromise
let gifWorkerScriptPromise
let gifWorkerObjectUrl

const canvas = document.querySelector('.home-hero__canvas')
const gifButton = document.querySelector('[data-hero-gif-button]')

if (canvas) {
  if (gifButton) {
    setGifButtonState(gifButton, { disabled: true })
  }

  initHeroWebgl(canvas)
    .then((controller) => {
      if (!gifButton) {
        return
      }

      setGifButtonState(gifButton, { disabled: false })
      bindGifExport(gifButton, controller.exportLoopedGif)
    })
    .catch((error) => {
      console.warn('Failed to initialize hero WebGL:', error)
      if (gifButton) {
        setGifButtonState(gifButton, {
          disabled: true,
          label: HERO_GIF_LABELS.unavailable,
        })
      }
    })
}

async function initHeroWebgl(canvas) {
  const shaders = await loadHeroShaders()
  const hero = canvas.closest('.home-hero, .project-cs-hero')
  const liveWater = createWaterRenderer(canvas, shaders, {
    boundsElement: hero,
    dpr: Math.min(window.devicePixelRatio || 1, 2),
    alpha: true,
    clearColor: [0, 0, 0, 0],
  })

  canvas.style.opacity = '0'

  const fadeState = { value: 0 }
  const fadeTween = new Tween(fadeState)
    .to({ value: 1 }, 4800)
    .easing(Easing.Cubic.Out)
    .delay(250)
  fadeTween.start(performance.now())

  const resize = () => {
    liveWater.resize()
  }

  const render = (time = performance.now()) => {
    tweenUpdate(time)
    liveWater.renderFrame({
      timeSeconds: time * 0.001,
      fade: fadeState.value,
    })
    canvas.style.opacity = String(fadeState.value)
    requestAnimationFrame(render)
  }

  resize()
  window.addEventListener('resize', resize)
  render()

  return {
    exportLoopedGif: (onStatus) => exportLoopedGif(hero || canvas, shaders, onStatus),
  }
}

function createWaterRenderer(canvas, shaders, options = {}) {
  const {
    boundsElement = null,
    dpr = 1,
    alpha = true,
    clearColor = [0, 0, 0, 0],
    preserveDrawingBuffer = false,
  } = options

  const renderer = new Renderer({
    canvas,
    dpr,
    alpha,
    depth: true,
    preserveDrawingBuffer,
  })
  const gl = renderer.gl
  gl.clearColor(clearColor[0], clearColor[1], clearColor[2], clearColor[3])

  const camera = new Camera(gl, { fov: 45, near: 0.1, far: 100.0 })
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
  const lightDirNorm = lightDir.map((value) => value / lightLen)

  const program = new Program(gl, {
    vertex: shaders.vertexSource,
    fragment: shaders.fragmentSource,
    uniforms: {
      uColor: { value: [6 / 255, 66 / 255, 115 / 255, 0.8] },
      uTime: { value: 0 },
      uFade: { value: 0 },
      uLightDir: { value: lightDirNorm },
      uNear: { value: camera.near },
      uFar: { value: camera.far },
      uFogColor: { value: [0.05, 0.07, 0.12] },
      uFogNear: { value: 2.0 },
      uFogFar: { value: 12.0 },
      uSpecStrength: { value: 0.7 },
      uShininess: { value: 80.0 },
      uLoopBlend: { value: 0 },
      uLoopProgress: { value: 0 },
      uLoopDuration: { value: HERO_GIF_CONFIG.loopDurationSeconds },
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

  const resize = (explicitWidth, explicitHeight) => {
    const bounds = boundsElement
      ? boundsElement.getBoundingClientRect()
      : canvas.getBoundingClientRect()
    const width = Math.max(1, Math.round(explicitWidth ?? bounds.width))
    const height = Math.max(1, Math.round(explicitHeight ?? bounds.height))

    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    renderer.setSize(width, height)

    const aspect = width / height
    camera.perspective({ aspect })
    program.uniforms.uNear.value = camera.near
    program.uniforms.uFar.value = camera.far
    mesh.scale.set(aspect, 1, 1)
    updateCamera()

    return { width, height }
  }

  const renderFrame = ({ timeSeconds = 0, fade = 1, loopProgress = null }) => {
    program.uniforms.uTime.value = timeSeconds
    program.uniforms.uFade.value = fade
    program.uniforms.uLoopDuration.value = HERO_GIF_CONFIG.loopDurationSeconds

    if (loopProgress === null) {
      program.uniforms.uLoopBlend.value = 0
      program.uniforms.uLoopProgress.value = 0
    } else {
      program.uniforms.uLoopBlend.value = 1
      program.uniforms.uLoopProgress.value = loopProgress
    }

    renderer.render({ scene, camera })
  }

  return {
    canvas,
    gl,
    resize,
    renderFrame,
  }
}

function bindGifExport(button, exportLoopedGif) {
  let isProcessing = false
  let resetTimerId = 0

  button.addEventListener('click', async () => {
    if (isProcessing) {
      return
    }

    isProcessing = true
    window.clearTimeout(resetTimerId)
    setGifButtonState(button, {
      processing: true,
      label: HERO_GIF_LABELS.loading,
    })

    try {
      await exportLoopedGif((label) => {
        setGifButtonState(button, {
          processing: true,
          label,
        })
      })
      setGifButtonState(button, { label: HERO_GIF_LABELS.success })
    } catch (error) {
      console.warn('Failed to export hero GIF:', error)
      setGifButtonState(button, { label: HERO_GIF_LABELS.error })
    } finally {
      isProcessing = false
      resetTimerId = window.setTimeout(() => {
        setGifButtonState(button, { disabled: false })
      }, 1600)
    }
  })
}

function setGifButtonState(button, options = {}) {
  const {
    disabled = false,
    processing = false,
    label = HERO_GIF_LABELS.idle,
  } = options
  const labelNode = button.querySelector('[data-hero-gif-label]')

  button.disabled = disabled || processing
  button.classList.toggle('is-processing', processing)
  button.setAttribute('aria-busy', processing ? 'true' : 'false')

  if (labelNode) {
    labelNode.textContent = label
  }
}

async function exportLoopedGif(boundsElement, shaders, onStatus) {
  const GIF = await loadGifLibrary()
  const workerScript = await loadGifWorkerScript()
  const bounds = boundsElement.getBoundingClientRect()
  const frameRect = getGifFrameRect(bounds.width, bounds.height)
  const frameDelayMs = getGifFrameDelayMs()
  const frameCount = getGifFrameCount()

  const exportCanvas = document.createElement('canvas')
  const copyCanvas = document.createElement('canvas')
  copyCanvas.width = frameRect.width
  copyCanvas.height = frameRect.height

  const copyContext = copyCanvas.getContext('2d', {
    willReadFrequently: true,
  })
  if (!copyContext) {
    throw new Error('Could not create GIF export canvas.')
  }

  const exportWater = createWaterRenderer(exportCanvas, shaders, {
    dpr: 1,
    alpha: true,
    preserveDrawingBuffer: true,
    clearColor: [0, 0, 0, 0],
  })
  exportWater.resize(frameRect.renderWidth, frameRect.renderHeight)

  const gif = new GIF({
    workers: getGifWorkerCount(),
    quality: HERO_GIF_CONFIG.quality,
    dither: HERO_GIF_CONFIG.dither,
    width: frameRect.width,
    height: frameRect.height,
    repeat: 0,
    background: HERO_GIF_CONFIG.backgroundColor,
    workerScript,
  })

  if (onStatus) {
    onStatus(getCaptureStatusLabel(0, frameCount))
  }

  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    const progress = frameIndex / frameCount
    exportWater.renderFrame({
      fade: 1,
      loopProgress: progress,
    })
    exportWater.gl.finish()

    copyContext.clearRect(0, 0, frameRect.width, frameRect.height)
    copyContext.fillStyle = HERO_GIF_CONFIG.backgroundColor
    copyContext.fillRect(0, 0, frameRect.width, frameRect.height)
    copyContext.drawImage(
      exportCanvas,
      frameRect.sourceX,
      frameRect.sourceY,
      frameRect.sourceWidth,
      frameRect.sourceHeight,
      0,
      0,
      frameRect.width,
      frameRect.height
    )
    gif.addFrame(copyCanvas, {
      copy: true,
      delay: frameDelayMs,
      dispose: 1,
    })

    if (
      onStatus &&
      (frameIndex === frameCount - 1 ||
        frameIndex % HERO_GIF_CONFIG.captureStatusStep === HERO_GIF_CONFIG.captureStatusStep - 1)
    ) {
      onStatus(getCaptureStatusLabel(frameIndex + 1, frameCount))
    }

    if (frameIndex % 8 === 7) {
      await yieldToBrowser()
    }
  }

  const blob = await renderGif(gif, (progress) => {
    if (!onStatus) {
      return
    }
    onStatus(getEncodeStatusLabel(progress))
  })
  downloadBlob(blob, HERO_GIF_CONFIG.filename)
}

function getGifFrameCount() {
  return Math.max(
    1,
    Math.round(HERO_GIF_CONFIG.loopDurationSeconds * HERO_GIF_CONFIG.frameRate)
  )
}

function getGifFrameDelayMs() {
  return Math.max(20, Math.round(1000 / HERO_GIF_CONFIG.frameRate))
}

function getGifWorkerCount() {
  const hardwareConcurrency = navigator.hardwareConcurrency || 4
  return Math.max(2, Math.min(4, hardwareConcurrency - 1 || 2))
}

function getCaptureStatusLabel(currentFrame, frameCount) {
  const progress = Math.round((currentFrame / frameCount) * 100)
  return `Capturing water loop... ${progress}%`
}

function getEncodeStatusLabel(progress) {
  return `Encoding GIF... ${Math.max(0, Math.min(100, Math.round(progress * 100)))}%`
}

function getGifFrameRect(width, height) {
  const safeWidth = Math.max(1, Math.round(width))
  const safeHeight = Math.max(1, Math.round(height))
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
  const desiredWidth = Math.round(safeWidth * pixelRatio)
  const scale = Math.min(1, HERO_GIF_CONFIG.maxWidth / Math.max(1, desiredWidth))
  const renderWidth = Math.max(1, Math.round(desiredWidth * scale))
  const renderHeight = Math.max(
    1,
    Math.round((safeHeight * renderWidth) / safeWidth)
  )
  const cropTop = Math.min(
    renderHeight - 1,
    Math.max(0, Math.round(renderHeight * HERO_GIF_CONFIG.cropTopRatio))
  )
  const sourceWidth = renderWidth
  const sourceHeight = Math.max(1, renderHeight - cropTop)

  return {
    renderWidth,
    renderHeight,
    sourceX: 0,
    sourceY: cropTop,
    sourceWidth,
    sourceHeight,
    width: renderWidth,
    height: sourceHeight,
  }
}

function renderGif(gif, onProgress) {
  return new Promise((resolve, reject) => {
    let settled = false

    gif.on('progress', (progress) => {
      if (typeof onProgress === 'function') {
        onProgress(progress)
      }
    })

    gif.on('finished', (blob) => {
      if (settled) {
        return
      }
      settled = true
      resolve(blob)
    })

    gif.on('abort', () => {
      if (settled) {
        return
      }
      settled = true
      reject(new Error('GIF export was aborted.'))
    })

    try {
      gif.render()
    } catch (error) {
      if (settled) {
        return
      }
      settled = true
      reject(error)
    }
  })
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()

  window.setTimeout(() => {
    URL.revokeObjectURL(url)
  }, 1000)
}

async function loadHeroShaders() {
  if (!shaderSourcePromise) {
    shaderSourcePromise = Promise.all([
      loadShader(new URL('./assets/shaders/hero.vert.glsl', import.meta.url)),
      loadShader(new URL('./assets/shaders/hero.frag.glsl', import.meta.url)),
    ]).then(([vertexSource, fragmentSource]) => ({
      vertexSource,
      fragmentSource,
    }))
  }

  return shaderSourcePromise
}

async function loadGifLibrary() {
  if (window.GIF) {
    return window.GIF
  }

  if (!gifLibraryPromise) {
    gifLibraryPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = HERO_GIF_CONFIG.libraryUrl
      script.async = true

      script.onload = () => {
        if (window.GIF) {
          resolve(window.GIF)
          return
        }

        reject(new Error('GIF library loaded without exposing window.GIF.'))
      }

      script.onerror = () => {
        reject(new Error('Failed to load the GIF encoder library.'))
      }

      document.head.appendChild(script)
    })
  }

  try {
    return await gifLibraryPromise
  } catch (error) {
    gifLibraryPromise = null
    throw error
  }
}

async function loadGifWorkerScript() {
  if (gifWorkerObjectUrl) {
    return gifWorkerObjectUrl
  }

  if (!gifWorkerScriptPromise) {
    gifWorkerScriptPromise = fetch(HERO_GIF_CONFIG.workerUrl)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Worker load failed: ${HERO_GIF_CONFIG.workerUrl}`)
        }
        return response.text()
      })
      .then((source) => {
        gifWorkerObjectUrl = URL.createObjectURL(
          new Blob([source], { type: 'text/javascript' })
        )
        return gifWorkerObjectUrl
      })
  }

  try {
    return await gifWorkerScriptPromise
  } catch (error) {
    gifWorkerScriptPromise = null
    if (gifWorkerObjectUrl) {
      URL.revokeObjectURL(gifWorkerObjectUrl)
      gifWorkerObjectUrl = null
    }
    throw error
  }
}

function yieldToBrowser() {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 0)
  })
}

window.addEventListener('pagehide', () => {
  if (!gifWorkerObjectUrl) {
    return
  }

  URL.revokeObjectURL(gifWorkerObjectUrl)
  gifWorkerObjectUrl = null
  gifWorkerScriptPromise = null
})

async function loadShader(url) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Shader load failed: ${url}`)
  }
  return response.text()
}
