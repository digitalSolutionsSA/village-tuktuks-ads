import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import gsap from 'gsap'
import type { Theme } from '../../hooks/useTheme'
import { ADVERTISING_AREAS } from '../../lib/agreementText'

/** The four logo colours (see index.css). */
const LOGO_COLORS = [0xe64018, 0xdfa90d, 0x2e9737, 0x0486cd]

/** Street grid: GRID × GRID blocks, SPACING apart. Every MAJOR_EVERY-th street is a main road. */
const GRID = 14
const SPACING = 2.2
const MAJOR_EVERY = 4
const TUK_COUNT = 16
const TUK_SPEED = 1.7 // units per second
const TRAIL_POINTS = 90
const TRAIL_WIDTH = 0.22

/** Map colours per theme, in the spirit of Google Maps' dark and light styles. */
const PALETTES = {
  dark: {
    background: 0x09090b,
    ground: 0x111116,
    road: 0x262630,
    major: 0x3a3a48,
    building: 0x23232d,
    park: 0x12301a,
    label: '#e4e4e7',
    labelStroke: 'rgba(9,9,11,0.9)',
  },
  light: {
    background: 0xf4f4f5,
    ground: 0xe9e9ec,
    road: 0xffffff,
    major: 0xfde68a,
    building: 0xd8d8de,
    park: 0xc9ecd0,
    label: '#27272a',
    labelStroke: 'rgba(255,255,255,0.95)',
  },
} as const

/** Deterministic pseudo-random numbers, so the town looks the same on every visit. */
function seeded(seed: number) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

function glowTexture() {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.3, 'rgba(255,255,255,0.6)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/** A map-style place label ("📍 Meyerton") drawn onto a sprite. */
function labelTexture(text: string, fill: string, stroke: string) {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 128
  const ctx = canvas.getContext('2d')!
  ctx.font = '600 56px system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  ctx.lineWidth = 12
  ctx.strokeStyle = stroke
  ctx.strokeText(text, 256, 64)
  ctx.fillStyle = fill
  ctx.fillText(text, 256, 64)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

interface Tuk {
  from: number
  to: number
  t: number
  length: number
  dot: THREE.Mesh
  halo: THREE.Sprite
  trail: THREE.Vector3[]
  geometry: THREE.BufferGeometry
}

/**
 * Pitch hero background: a 3D "Google Maps"-style town with low buildings, where glowing tuk-tuks
 * drive the streets leaving trails in the logo colours. Zooms in from above on load, then slowly
 * orbits. Pauses off screen; renders one still frame for people who prefer reduced motion.
 */
export function CityMapScene({ theme, className = '' }: { theme: Theme; className?: string }) {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const colors = PALETTES[theme]
    const rand = seeded(20261024)

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' })
    } catch {
      return // No WebGL (very old tablet): the hero simply has no 3D background.
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75))
    renderer.setClearColor(0x000000, 0)
    renderer.domElement.style.display = 'block'
    host.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.fog = new THREE.Fog(colors.background, 18, 48)
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 120)

    scene.add(new THREE.AmbientLight(0xffffff, theme === 'light' ? 1.6 : 1.2))
    const sun = new THREE.DirectionalLight(0xffffff, theme === 'light' ? 1.4 : 1.0)
    sun.position.set(12, 24, 8)
    scene.add(sun)

    const disposables: { dispose: () => void }[] = []
    const track = <T extends { dispose: () => void }>(d: T) => (disposables.push(d), d)
    const half = (GRID * SPACING) / 2

    // Ground.
    const ground = new THREE.Mesh(
      track(new THREE.PlaneGeometry(GRID * SPACING * 3, GRID * SPACING * 3)),
      track(new THREE.MeshLambertMaterial({ color: colors.ground })),
    )
    ground.rotation.x = -Math.PI / 2
    scene.add(ground)

    // Intersections, nudged a little so the streets don't look ruled.
    const n = GRID + 1
    const nodeIndex = (i: number, j: number) => i * n + j
    const nodes: THREE.Vector3[] = []
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const edge = i === 0 || j === 0 || i === GRID || j === GRID
        const jitter = edge ? 0 : 0.35
        nodes.push(new THREE.Vector3(-half + j * SPACING + (rand() - 0.5) * jitter, 0, -half + i * SPACING + (rand() - 0.5) * jitter))
      }
    }
    const isMajor = (i: number, j: number, horizontal: boolean) => (horizontal ? i : j) % MAJOR_EVERY === 0

    // Streets: neighbours joined, with a few side streets left out for variety.
    const neighbours: number[][] = nodes.map(() => [])
    const minorQuads: number[] = []
    const majorQuads: number[] = []
    const link = (a: number, b: number, major: boolean) => {
      neighbours[a].push(b)
      neighbours[b].push(a)
      const width = major ? 0.42 : 0.22
      const target = major ? majorQuads : minorQuads
      const pa = nodes[a]
      const pb = nodes[b]
      const dir = new THREE.Vector3().subVectors(pb, pa).normalize()
      const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(width / 2)
      const ext = dir.clone().multiplyScalar(width / 2)
      const a2 = pa.clone().sub(ext)
      const b2 = pb.clone().add(ext)
      const v0 = a2.clone().add(side)
      const v1 = a2.clone().sub(side)
      const v2 = b2.clone().add(side)
      const v3 = b2.clone().sub(side)
      const y = major ? 0.012 : 0.008
      for (const v of [v0, v1, v2, v2, v1, v3]) target.push(v.x, y, v.z)
    }
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (j < GRID) {
          const major = isMajor(i, j, true)
          if (major || rand() > 0.1) link(nodeIndex(i, j), nodeIndex(i, j + 1), major)
        }
        if (i < GRID) {
          const major = isMajor(i, j, false)
          if (major || rand() > 0.1) link(nodeIndex(i, j), nodeIndex(i + 1, j), major)
        }
      }
    }
    const roadMesh = (positions: number[], color: number) => {
      const geometry = track(new THREE.BufferGeometry())
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
      geometry.computeVertexNormals()
      const mesh = new THREE.Mesh(geometry, track(new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide })))
      scene.add(mesh)
    }
    roadMesh(minorQuads, colors.road)
    roadMesh(majorQuads, colors.major)

    // Buildings (and a couple of parks) on each block.
    const box = track(new THREE.BoxGeometry(1, 1, 1))
    box.translate(0, 0.5, 0)
    const buildingSpots: THREE.Matrix4[] = []
    const parkQuads: number[] = []
    const parks = new Set([nodeIndex(5, 9), nodeIndex(9, 3), nodeIndex(2, 4)])
    for (let i = 0; i < GRID; i++) {
      for (let j = 0; j < GRID; j++) {
        const c = nodes[nodeIndex(i, j)].clone().add(nodes[nodeIndex(i + 1, j + 1)]).multiplyScalar(0.5)
        const inner = SPACING - 0.75
        if (parks.has(nodeIndex(i, j))) {
          const h = inner / 2
          for (const [x, z] of [
            [-h, -h],
            [h, -h],
            [-h, h],
            [-h, h],
            [h, -h],
            [h, h],
          ])
            parkQuads.push(c.x + x, 0.006, c.z + z)
          continue
        }
        // Taller buildings towards the middle of town.
        const centrality = 1 - Math.min(1, c.length() / half)
        const count = 1 + Math.floor(rand() * 3)
        for (let k = 0; k < count; k++) {
          const w = inner * (0.3 + rand() * 0.35)
          const d = inner * (0.3 + rand() * 0.35)
          const h = 0.12 + rand() * 0.45 + centrality * centrality * rand() * 1.1
          const ox = (rand() - 0.5) * (inner - w)
          const oz = (rand() - 0.5) * (inner - d)
          buildingSpots.push(new THREE.Matrix4().compose(new THREE.Vector3(c.x + ox, 0, c.z + oz), new THREE.Quaternion(), new THREE.Vector3(w, h, d)))
        }
      }
    }
    const buildings = new THREE.InstancedMesh(box, track(new THREE.MeshLambertMaterial({ color: colors.building })), buildingSpots.length)
    buildingSpots.forEach((m, i) => buildings.setMatrixAt(i, m))
    scene.add(buildings)
    if (parkQuads.length) {
      const parkGeometry = track(new THREE.BufferGeometry())
      parkGeometry.setAttribute('position', new THREE.Float32BufferAttribute(parkQuads, 3))
      parkGeometry.computeVertexNormals()
      scene.add(new THREE.Mesh(parkGeometry, track(new THREE.MeshLambertMaterial({ color: colors.park, side: THREE.DoubleSide }))))
    }

    // Place labels for the advertising areas.
    const labelSpots = [nodeIndex(3, 3), nodeIndex(4, 11), nodeIndex(11, 4), nodeIndex(10, 10)]
    ADVERTISING_AREAS.forEach((area, i) => {
      const map = track(labelTexture(`📍 ${area}`, colors.label, colors.labelStroke))
      const label = new THREE.Sprite(track(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false })))
      label.position.copy(nodes[labelSpots[i % labelSpots.length]]).setY(1.6)
      label.scale.set(4, 1, 1)
      scene.add(label)
    })

    // Tuk-tuks: glowing dots doing a random drive around town, each trailing a ribbon in its colour.
    const glow = track(glowTexture())
    const dotGeometry = track(new THREE.SphereGeometry(0.2, 16, 12))
    const trailIndex: number[] = []
    for (let k = 0; k < TRAIL_POINTS - 1; k++) {
      const a = k * 2
      trailIndex.push(a, a + 1, a + 2, a + 2, a + 1, a + 3)
    }
    const tuks: Tuk[] = []
    for (let k = 0; k < TUK_COUNT; k++) {
      const color = new THREE.Color(LOGO_COLORS[k % LOGO_COLORS.length])
      let from = Math.floor(rand() * nodes.length)
      while (!neighbours[from].length) from = Math.floor(rand() * nodes.length)
      const to = neighbours[from][Math.floor(rand() * neighbours[from].length)]
      const dot = new THREE.Mesh(dotGeometry, track(new THREE.MeshBasicMaterial({ color })))
      const halo = new THREE.Sprite(track(new THREE.SpriteMaterial({ map: glow, color, transparent: true, depthWrite: false, opacity: 0.9 })))
      halo.scale.setScalar(1.6)
      scene.add(dot, halo)

      const geometry = track(new THREE.BufferGeometry())
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_POINTS * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage))
      const rgba = new Float32Array(TRAIL_POINTS * 2 * 4)
      for (let p = 0; p < TRAIL_POINTS; p++) {
        // Head of the trail is solid, the tail fades out.
        const alpha = Math.pow(1 - p / (TRAIL_POINTS - 1), 1.3)
        for (const v of [0, 1]) rgba.set([color.r, color.g, color.b, alpha], (p * 2 + v) * 4)
      }
      geometry.setAttribute('color', new THREE.BufferAttribute(rgba, 4))
      geometry.setIndex(trailIndex)
      geometry.setDrawRange(0, 0)
      const ribbon = new THREE.Mesh(
        geometry,
        track(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide })),
      )
      // The ribbon is rebuilt every frame, so its first bounding box goes stale — never cull it.
      ribbon.frustumCulled = false
      scene.add(ribbon)
      tuks.push({ from, to, t: rand(), length: nodes[from].distanceTo(nodes[to]), dot, halo, trail: [], geometry })
    }

    const tmp = new THREE.Vector3()
    const side = new THREE.Vector3()
    const driveTuks = (dt: number) => {
      for (const tuk of tuks) {
        tuk.t += (dt * TUK_SPEED) / tuk.length
        while (tuk.t >= 1) {
          tuk.t -= 1
          // At the junction pick a new street, avoiding a U-turn unless it's a dead end.
          const options = neighbours[tuk.to].filter((x) => x !== tuk.from)
          const next = (options.length ? options : neighbours[tuk.to])[Math.floor(Math.random() * (options.length || neighbours[tuk.to].length))]
          tuk.from = tuk.to
          tuk.to = next
          tuk.length = nodes[tuk.from].distanceTo(nodes[tuk.to])
        }
        tmp.lerpVectors(nodes[tuk.from], nodes[tuk.to], tuk.t)
        tuk.dot.position.set(tmp.x, 0.22, tmp.z)
        tuk.halo.position.set(tmp.x, 0.24, tmp.z)

        // trail[0] follows the tuk exactly; a new point is laid down once it has moved on from trail[1].
        const settled = tuk.trail[1]
        if (tuk.trail.length < 2 || settled.distanceToSquared(tmp.setY(0.03)) > 0.0225) {
          tuk.trail.unshift(new THREE.Vector3(tmp.x, 0.03, tmp.z))
          if (tuk.trail.length > TRAIL_POINTS) tuk.trail.pop()
        } else {
          tuk.trail[0].set(tmp.x, 0.03, tmp.z)
        }
        // Rebuild the ribbon: two vertices either side of each trail point.
        const positions = tuk.geometry.getAttribute('position') as THREE.BufferAttribute
        const pts = tuk.trail
        for (let p = 0; p < pts.length; p++) {
          const a = pts[Math.max(0, p - 1)]
          const b = pts[Math.min(pts.length - 1, p + 1)]
          side.set(-(b.z - a.z), 0, b.x - a.x)
          if (side.lengthSq() < 1e-6) side.set(1, 0, 0)
          side.normalize().multiplyScalar(TRAIL_WIDTH / 2)
          positions.setXYZ(p * 2, pts[p].x + side.x, 0.03, pts[p].z + side.z)
          positions.setXYZ(p * 2 + 1, pts[p].x - side.x, 0.03, pts[p].z - side.z)
        }
        positions.needsUpdate = true
        tuk.geometry.setDrawRange(0, Math.max(0, pts.length - 1) * 6)
      }
    }

    // Prime the trails so the first frame already shows tuks on the move.
    for (let i = 0; i < 160; i++) driveTuks(1 / 30)

    // Camera: "zoom" goes 0 → 1 on load (from straight above, like dropping into Google Maps).
    const view = { zoom: reduceMotion ? 1 : 0, angle: 0.6 }
    const pointer = { x: 0, y: 0 }
    let portrait = false
    const placeCamera = () => {
      const radius = THREE.MathUtils.lerp(4, portrait ? 9 : 15, view.zoom)
      const height = THREE.MathUtils.lerp(44, portrait ? 22 : 16, view.zoom)
      const angle = view.angle + pointer.x * 0.15
      camera.position.set(Math.sin(angle) * radius, height - pointer.y * 1.5, Math.cos(angle) * radius)
      camera.lookAt(0, 0, 0)
    }

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = host
      if (!w || !h) return
      renderer.setSize(w, h, false)
      renderer.domElement.style.width = '100%'
      renderer.domElement.style.height = '100%'
      camera.aspect = w / h
      portrait = w / h < 1
      camera.fov = portrait ? 55 : 42
      camera.updateProjectionMatrix()
    }
    resize()
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(host)

    const onPointer = (e: PointerEvent) => {
      const r = host.getBoundingClientRect()
      pointer.x += (((e.clientX - r.left) / r.width) * 2 - 1 - pointer.x) * 0.5
      pointer.y += (((e.clientY - r.top) / r.height) * 2 - 1 - pointer.y) * 0.5
    }
    window.addEventListener('pointermove', onPointer)

    let last = performance.now()
    const render = () => {
      const now = performance.now()
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      view.angle += dt * 0.025
      driveTuks(dt)
      placeCamera()
      renderer.render(scene, camera)
    }

    let running = false
    let visible = true
    const loop = () => {
      if (!running) return
      render()
      requestAnimationFrame(loop)
    }
    const start = () => {
      if (running || reduceMotion || !visible || document.hidden) return
      running = true
      last = performance.now()
      requestAnimationFrame(loop)
    }
    const stop = () => {
      running = false
    }
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      if (visible) start()
      else stop()
    })
    intersection.observe(host)
    const onVisibility = () => (document.hidden ? stop() : start())
    document.addEventListener('visibilitychange', onVisibility)

    let intro: gsap.core.Tween | undefined
    if (reduceMotion) {
      placeCamera()
      renderer.render(scene, camera)
    } else {
      intro = gsap.to(view, { zoom: 1, duration: 3.2, ease: 'power3.inOut' })
      start()
    }

    return () => {
      stop()
      intro?.kill()
      intersection.disconnect()
      resizeObserver.disconnect()
      window.removeEventListener('pointermove', onPointer)
      document.removeEventListener('visibilitychange', onVisibility)
      buildings.dispose()
      disposables.forEach((d) => d.dispose())
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [theme])

  return <div ref={hostRef} className={className} aria-hidden />
}
