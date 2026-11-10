"use client";

import { OrbitControls, PointerLockControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { RefObject, useEffect, useMemo, useRef, useState } from "react";
import { OrbitControls as OrbitControlsImpl, PointerLockControls as PointerLockControlsImpl } from "three-stdlib";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import {
  DoorMark,
  FRAME,
  Opening,
  PlannerView,
  WallRect,
  cameraBlocked,
  cameraPose,
  doorLayers,
  doorLeaf,
  doorTextureSrc,
  entryRoom,
  facadeFromMark,
  facadeRects,
  hingeX,
  swingRadians,
  walkBounds,
  wallRects,
} from "@/lib/planner";

const PHOTO_Z = -0.2;
// The old door sits just proud of the new frame so it hides it until it dissolves.
const OLD_DOOR_Z = -1.2;
const REVEAL_SECONDS = 4.9;

/** Animation values the scene reads every frame without re-rendering React. */
type RevealStage = {
  playing: boolean;
  /** 0 = the old door is intact, 1 = fully dissolved. */
  dissolve: number;
  /** 0 = the new door is held out in front of the house, 1 = seated. */
  settle: number;
  /** Position of the light band crossing the new door, 0 to 1. */
  sweep: number;
};

export function EntryViewer({
  doorImageUrl,
  photoUrl,
  opening,
  mark,
  doorOpen,
  viewName,
  viewNonce,
  revealNonce,
  compare,
  onRevealEnd,
  interiorPhotoUrl,
  interiorMark,
  plateUrl,
  removed,
}: {
  doorImageUrl: string;
  photoUrl: string;
  opening: Opening;
  mark: DoorMark;
  doorOpen: number;
  viewName: PlannerView;
  viewNonce: number;
  /** Changes each time the old-door-to-new-door reveal should play. */
  revealNonce: number;
  /** How much of the old door is wiped back over the new one, 0 to 1. */
  compare: number;
  onRevealEnd: () => void;
  /** Optional photo of the same door taken from inside the house. */
  interiorPhotoUrl?: string | null;
  interiorMark?: DoorMark;
  /** The entry photo with the old door painted out, once the server has made it. */
  plateUrl?: string | null;
  /** Box around what was painted out, as fractions of the photo. */
  removed?: DoorMark | null;
}) {
  const photo = usePreviewTexture(photoUrl);
  const plate = usePreviewTexture(plateUrl ?? null);
  const interior = usePreviewTexture(interiorPhotoUrl ?? null);
  const door = useDoorTextures(doorTextureSrc(doorImageUrl));

  return (
    <div className="planner-canvas">
      {!photo.texture && !photo.failed && (
        <p className="planner-loading">Preparing your entry…</p>
      )}
      {photo.failed && (
        <p className="form-error">The entry photo could not be prepared. Go back and choose it again.</p>
      )}
      {photo.texture && (
        <Canvas
          camera={{ fov: 42, near: 0.1, far: 8000, position: [0, 48, -120] }}
          dpr={[1, 1.75]}
          gl={{ antialias: true }}
          shadows
        >
          <color args={["#d5cec1"]} attach="background" />
          <EntryScene
            compare={compare}
            onRevealEnd={onRevealEnd}
            revealNonce={revealNonce}
            doorOpen={doorOpen}
            doorIron={door.iron}
            doorTexture={door.map}
            interiorMark={interiorMark}
            interiorTexture={interior.texture}
            plateTexture={plate.texture}
            removed={plate.texture ? removed : null}
            mark={mark}
            opening={opening}
            photoTexture={photo.texture}
            viewName={viewName}
            viewNonce={viewNonce}
          />
        </Canvas>
      )}
      {door.failed && (
        <p className="planner-note">
          The door photo could not be loaded, so a plain door is shown in the opening.
        </p>
      )}
    </div>
  );
}

function EntryScene({
  opening,
  mark,
  photoTexture,
  doorTexture,
  doorOpen,
  viewName,
  viewNonce,
  revealNonce,
  compare,
  onRevealEnd,
  doorIron,
  interiorTexture,
  interiorMark,
  plateTexture,
  removed,
}: {
  opening: Opening;
  mark: DoorMark;
  photoTexture: THREE.Texture;
  doorTexture: THREE.Texture | null;
  doorIron: THREE.Texture | null;
  interiorTexture: THREE.Texture | null;
  interiorMark?: DoorMark;
  plateTexture: THREE.Texture | null;
  removed?: DoorMark | null;
  doorOpen: number;
  viewName: PlannerView;
  viewNonce: number;
  revealNonce: number;
  compare: number;
  onRevealEnd: () => void;
}) {
  const stage = useRef<RevealStage>({ playing: false, dissolve: 0, settle: 1, sweep: 0 });
  const [playing, setPlaying] = useState(false);
  const facade = useMemo(() => facadeFromMark(opening, mark), [opening, mark]);
  const rects = useMemo(() => facadeRects(facade, opening), [facade, opening]);
  const geometries = useMemo(
    () => rects.map((rect) => photoGeometry(rect, facade)),
    [rects, facade],
  );
  const room = entryRoom(opening);
  const roomWall = useMemo(
    () => ({ left: -room.width / 2, right: room.width / 2, bottom: 0, top: room.ceiling }),
    [room.width, room.ceiling],
  );
  const innerRects = useMemo(() => wallRects(roomWall, opening), [roomWall, opening]);
  const insidePhoto = useMemo(() => {
    if (!interiorTexture || !interiorMark) return [];
    const inside = facadeFromMark(opening, interiorMark, "interior");
    return wallRects(inside, opening, roomWall).map((rect) => ({
      id: rect.id,
      geometry: photoGeometry(rect, inside, opening.jambDepth + 0.12, true),
    }));
  }, [interiorMark, interiorTexture, opening, roomWall]);

  useEffect(() => () => geometries.forEach((geometry) => geometry.dispose()), [geometries]);
  useEffect(() => () => insidePhoto.forEach((item) => item.geometry.dispose()), [insidePhoto]);

  return (
    <>
      <StudioEnvironment />
      <hemisphereLight args={["#fff6ea", "#b5aa98", 0.7]} />
      <ambientLight intensity={0.15} />
      {/* The sun stands in front of the house, so the ironwork throws its pattern onto the foyer floor. */}
      <directionalLight
        castShadow
        color="#fff3e0"
        intensity={3}
        position={[-28, 150, -80]}
        shadow-bias={-0.0004}
        shadow-mapSize={[2048, 2048]}
        shadow-normalBias={0.4}
      >
        <orthographicCamera args={[-110, 110, 130, -40, 1, 420]} attach="shadow-camera" />
      </directionalLight>
      <pointLight
        color="#fff4e5"
        distance={room.depth + opening.jambDepth + 40}
        intensity={18}
        position={[0, room.ceiling - 12, opening.jambDepth + 48]}
      />

      {geometries.map((geometry, index) => (
        <mesh geometry={geometry} key={rects[index].id}>
          {/* The customer's photo is shown exactly as taken, not relit. */}
          {/* Once the old door has been painted out, the wall uses that version. */}
          <meshBasicMaterial map={plateTexture ?? photoTexture} toneMapped={false} />
        </mesh>
      ))}

      {insidePhoto.map((item) => (
        <mesh geometry={item.geometry} key={`${item.id}-inside-photo`}>
          <meshBasicMaterial map={interiorTexture} toneMapped={false} />
        </mesh>
      ))}

      {/* The full front wall of the foyer, so the room is closed even where the photo ends. */}
      {innerRects.map((rect) => (
        <mesh
          castShadow
          key={`${rect.id}-inner-wall`}
          position={[
            (rect.x0 + rect.x1) / 2,
            (rect.y0 + rect.y1) / 2,
            (opening.jambDepth + 0.3) / 2,
          ]}
          receiveShadow
        >
          <boxGeometry args={[rect.x1 - rect.x0, rect.y1 - rect.y0, opening.jambDepth - 0.3]} />
          <meshStandardMaterial color="#efe8dc" roughness={0.94} />
        </mesh>
      ))}

      {rects.map((rect) => (
        <mesh
          castShadow
          key={`${rect.id}-wall`}
          position={[
            (rect.x0 + rect.x1) / 2,
            (rect.y0 + rect.y1) / 2,
            opening.jambDepth / 2,
          ]}
        >
          <boxGeometry args={[rect.x1 - rect.x0, rect.y1 - rect.y0, opening.jambDepth]} />
          <meshStandardMaterial color="#e6dfd2" roughness={0.94} />
        </mesh>
      ))}

      <OpeningTrim opening={opening} />
      <HingedDoor
        doorOpen={doorOpen}
        iron={doorIron}
        opening={opening}
        stage={stage}
        texture={doorTexture}
      />
      <OldDoor
        compare={compare}
        facade={facade}
        opening={opening}
        removed={removed}
        stage={stage}
        texture={photoTexture}
      />
      <LightSweep opening={opening} stage={stage} />
      <RevealDirector
        facade={facade}
        onEnd={onRevealEnd}
        onPlaying={setPlaying}
        opening={opening}
        revealNonce={revealNonce}
        stage={stage}
        viewNonce={viewNonce}
      />
      <Room hasPhoto={insidePhoto.length > 0} opening={opening} />
      <ViewerControls
        paused={playing}
        doorOpen={doorOpen}
        mark={mark}
        opening={opening}
        viewName={viewName}
        viewNonce={viewNonce}
      />
    </>
  );
}

function OpeningTrim({ opening }: { opening: Opening }) {
  const casing = "#3c342c";
  return (
    <group>
      <mesh position={[-opening.width / 2 + 0.7, opening.height / 2, -0.45]}>
        <boxGeometry args={[1.4, opening.height, 1.1]} />
        <meshStandardMaterial color={casing} metalness={0.28} roughness={0.52} />
      </mesh>
      <mesh position={[opening.width / 2 - 0.7, opening.height / 2, -0.45]}>
        <boxGeometry args={[1.4, opening.height, 1.1]} />
        <meshStandardMaterial color={casing} metalness={0.28} roughness={0.52} />
      </mesh>
      <mesh position={[0, opening.height - 0.7, -0.45]}>
        <boxGeometry args={[opening.width, 1.4, 1.1]} />
        <meshStandardMaterial color={casing} metalness={0.28} roughness={0.52} />
      </mesh>
      <mesh position={[0, 0.45, opening.jambDepth / 2]}>
        <boxGeometry args={[opening.width - 1.5, 0.9, opening.jambDepth]} />
        <meshStandardMaterial color="#6d6256" metalness={0.08} roughness={0.72} />
      </mesh>
    </group>
  );
}

function HingedDoor({
  opening,
  doorOpen,
  texture,
  iron,
  stage,
}: {
  opening: Opening;
  doorOpen: number;
  texture: THREE.Texture | null;
  /** White where the door is iron, black where it is glass. */
  iron: THREE.Texture | null;
  stage: RefObject<RevealStage>;
}) {
  const group = useRef<THREE.Group>(null);
  const open = useRef(0);
  const reduceMotion = useRef(false);
  const leaf = doorLeaf(opening);
  const towardLock = opening.hingeSide === "left" ? 1 : -1;
  const face = texture ? "#ffffff" : "#2b2926";

  useEffect(() => {
    reduceMotion.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  useFrame((_, delta) => {
    open.current = reduceMotion.current
      ? doorOpen
      : THREE.MathUtils.damp(open.current, doorOpen, 6, delta);
    if (!group.current) return;
    group.current.rotation.y = swingRadians(opening, open.current);
    // During the reveal the door is carried in from in front of the house.
    const settle = stage.current.settle;
    group.current.visible = settle > 0.001;
    group.current.position.z = 0.75 - (1 - settle) * 44;
    group.current.position.y = FRAME.sill + (1 - settle) * 3;
  });

  return (
    <group position={[hingeX(opening), FRAME.sill, 0.75]} ref={group}>
      {texture && iron ? (
        <group position={[towardLock * (leaf.width / 2), leaf.height / 2, 0]}>
          {/* The ironwork is cut out of the photo and stacked through the door's
              thickness, so the scrollwork has real depth and the glass is open. */}
          {IRON_LAYERS.map((depth, index) => {
            const outer = index === 0 || index === IRON_LAYERS.length - 1;
            return (
              <mesh
                castShadow={index === 0}
                key={depth}
                position={[0, 0, depth * leaf.thickness]}
                rotation={[0, Math.PI, 0]}
              >
                <planeGeometry args={[leaf.width, leaf.height]} />
                <meshStandardMaterial
                  alphaMap={iron}
                  alphaTest={0.5}
                  bumpMap={outer ? texture : undefined}
                  bumpScale={outer ? 1.4 : 0}
                  color={outer ? "#ffffff" : "#1c1916"}
                  map={outer ? texture : undefined}
                  metalness={0.38}
                  roughness={0.46}
                  side={THREE.DoubleSide}
                />
              </mesh>
            );
          })}
          <mesh position={[0, 0, leaf.thickness / 2]} rotation={[0, Math.PI, 0]}>
            <planeGeometry args={[leaf.width - 0.6, leaf.height - 0.6]} />
            <meshPhysicalMaterial
              clearcoat={1}
              clearcoatRoughness={0.05}
              color="#dbe6e6"
              depthWrite={false}
              envMapIntensity={1.8}
              metalness={0}
              opacity={0.3}
              roughness={0.08}
              side={THREE.DoubleSide}
              transparent
            />
          </mesh>
          {[-1, 1].map((sign) => (
            <mesh
              castShadow
              key={`stile-${sign}`}
              position={[sign * (leaf.width / 2 - 0.2), 0, leaf.thickness / 2]}
            >
              <boxGeometry args={[0.4, leaf.height, leaf.thickness]} />
              <meshStandardMaterial color="#1c1916" metalness={0.5} roughness={0.5} />
            </mesh>
          ))}
          {[-1, 1].map((sign) => (
            <mesh
              castShadow
              key={`rail-${sign}`}
              position={[0, sign * (leaf.height / 2 - 0.2), leaf.thickness / 2]}
            >
              <boxGeometry args={[leaf.width, 0.4, leaf.thickness]} />
              <meshStandardMaterial color="#1c1916" metalness={0.5} roughness={0.5} />
            </mesh>
          ))}
        </group>
      ) : (
        <mesh
          castShadow
          position={[towardLock * (leaf.width / 2), leaf.height / 2, leaf.thickness / 2]}
        >
          <boxGeometry args={[leaf.width, leaf.height, leaf.thickness]} />
          <meshStandardMaterial attach="material-0" color="#241f1b" metalness={0.22} roughness={0.58} />
          <meshStandardMaterial attach="material-1" color="#241f1b" metalness={0.22} roughness={0.58} />
          <meshStandardMaterial attach="material-2" color="#241f1b" metalness={0.22} roughness={0.58} />
          <meshStandardMaterial attach="material-3" color="#241f1b" metalness={0.22} roughness={0.58} />
          <meshStandardMaterial
            attach="material-4"
            color={face}
            map={texture ?? undefined}
            metalness={0.06}
            roughness={0.48}
          />
          <meshStandardMaterial
            attach="material-5"
            color={face}
            map={texture ?? undefined}
            metalness={0.06}
            roughness={0.48}
          />
        </mesh>
      )}
    </group>
  );
}

const IRON_LAYERS = [0, 0.2, 0.4, 0.6, 0.8, 1];

/** Soft studio surroundings for the iron and glass to reflect. Built in code, nothing to download. */
function StudioEnvironment() {
  const { gl, scene } = useThree();

  /* eslint-disable react-hooks/immutability */
  useEffect(() => {
    const generator = new THREE.PMREMGenerator(gl);
    const surroundings = generator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = surroundings;
    scene.environmentIntensity = 0.45;
    return () => {
      scene.environment = null;
      surroundings.dispose();
      generator.dispose();
    };
  }, [gl, scene]);
  /* eslint-enable react-hooks/immutability */

  return null;
}

type OldDoorUniforms = {
  uDissolve: { value: number };
  uWipe: { value: number };
  uSpan: { value: THREE.Vector4 };
};

// Same unlit material as the wall photo, so the old door matches its surroundings
// exactly. The shader adds a grainy dissolve and a side-to-side wipe.
function oldDoorMaterial(texture: THREE.Texture) {
  const uniforms: OldDoorUniforms = {
    uDissolve: { value: 0 },
    uWipe: { value: 1 },
    uSpan: { value: new THREE.Vector4(0, 1, 0, 1) },
  };
  const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
  material.userData.uniforms = uniforms;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform float uDissolve;
        uniform float uWipe;
        uniform vec4 uSpan;
        float aeNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float a = rand(i);
          float b = rand(i + vec2(1.0, 0.0));
          float c = rand(i + vec2(0.0, 1.0));
          float d = rand(i + vec2(1.0, 1.0));
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }`,
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        vec2 aeDoor = vec2(
          (vMapUv.x - uSpan.x) / (uSpan.y - uSpan.x),
          (vMapUv.y - uSpan.z) / (uSpan.w - uSpan.z)
        );
        if (1.0 - aeDoor.x > uWipe) discard;
        float aeGrain = aeNoise(aeDoor * vec2(7.0, 15.0)) * 0.6
          + aeNoise(aeDoor * vec2(26.0, 54.0)) * 0.4;
        float aeCut = uDissolve * 1.3 - 0.15;
        if (aeGrain < aeCut) discard;
        float aeGlow = (1.0 - smoothstep(aeCut, aeCut + 0.07, aeGrain)) * step(0.001, uDissolve);
        diffuseColor.rgb += vec3(1.0, 0.82, 0.55) * aeGlow * 0.55;`,
      );
  };
  return material;
}

function OldDoor({
  opening,
  facade,
  texture,
  stage,
  compare,
  removed,
}: {
  opening: Opening;
  facade: ReturnType<typeof facadeFromMark>;
  texture: THREE.Texture;
  stage: RefObject<RevealStage>;
  compare: number;
  /** When the wall has the old door painted out, the original must cover all of it. */
  removed?: DoorMark | null;
}) {
  const mesh = useRef<THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>>(null);
  const wipe = useRef(compare);
  const geometry = useMemo(() => {
    const rect = { id: "old-door", x0: -opening.width / 2, x1: opening.width / 2, y0: 0, y1: opening.height };
    if (removed) {
      // An exterior photo runs right to left in world X and top to bottom in Y.
      const x1 = facade.right - removed.x * facade.width;
      const y1 = facade.top - removed.y * facade.height;
      rect.x0 = Math.max(facade.left, Math.min(rect.x0, x1 - removed.width * facade.width));
      rect.x1 = Math.min(facade.right, Math.max(rect.x1, x1));
      rect.y0 = Math.max(facade.bottom, Math.min(rect.y0, y1 - removed.height * facade.height));
      rect.y1 = Math.min(facade.top, Math.max(rect.y1, y1));
    }
    return photoGeometry(rect, facade, OLD_DOOR_Z);
  }, [facade, opening, removed]);
  const material = useMemo(() => oldDoorMaterial(texture), [texture]);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => {
    wipe.current = compare;
  }, [compare]);

  useFrame(() => {
    const current = mesh.current;
    if (!current) return;
    const uniforms = current.material.userData.uniforms as OldDoorUniforms;
    const uv = current.geometry.getAttribute("uv");
    uniforms.uSpan.value.set(uv.getX(0), uv.getX(1), uv.getY(0), uv.getY(2));
    const reveal = stage.current;
    uniforms.uDissolve.value = reveal.playing ? reveal.dissolve : 0;
    uniforms.uWipe.value = reveal.playing ? 1 : wipe.current;
    current.visible = reveal.playing ? reveal.dissolve < 1 : wipe.current > 0.001;
  });

  return <mesh geometry={geometry} material={material} ref={mesh} />;
}

function sweepTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 2;
  const context = canvas.getContext("2d");
  if (context) {
    const band = context.createLinearGradient(0, 0, canvas.width, 0);
    band.addColorStop(0.34, "rgba(255, 244, 222, 0)");
    band.addColorStop(0.5, "rgba(255, 244, 222, 1)");
    band.addColorStop(0.66, "rgba(255, 244, 222, 0)");
    context.fillStyle = band;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** A soft band of light that crosses the new door once it is seated. */
function LightSweep({ opening, stage }: { opening: Opening; stage: RefObject<RevealStage> }) {
  const mesh = useRef<THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>>(null);
  const texture = useMemo(() => sweepTexture(), []);

  useEffect(() => () => texture.dispose(), [texture]);

  useFrame(() => {
    const current = mesh.current;
    if (!current) return;
    const reveal = stage.current;
    current.visible = reveal.playing && reveal.sweep > 0 && reveal.sweep < 1;
    if (!current.visible || !current.material.map) return;
    current.material.map.offset.x = 0.75 - reveal.sweep * 1.5;
    current.material.opacity = Math.sin(Math.PI * reveal.sweep) * 0.5;
  });

  return (
    <mesh position={[0, opening.height / 2, OLD_DOOR_Z + 0.05]} ref={mesh} visible={false}>
      <planeGeometry args={[opening.width, opening.height]} />
      <meshBasicMaterial
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        map={texture}
        side={THREE.DoubleSide}
        toneMapped={false}
        transparent
      />
    </mesh>
  );
}

/** How far back the camera must stand for `width` inches to fit across the screen. */
function fitDistance(camera: THREE.Camera, width: number) {
  if (!(camera instanceof THREE.PerspectiveCamera)) return 0;
  const half = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect;
  return width / 2 / half;
}

function exteriorZ(
  camera: THREE.Camera,
  opening: Opening,
  facade: ReturnType<typeof facadeFromMark>,
) {
  const pose = cameraPose("exterior", opening, facade);
  return -Math.max(-pose.position[2], fitDistance(camera, opening.width * 1.7));
}

/** Inside, step back far enough to see the whole door, without leaving the foyer. */
function insideZ(camera: THREE.Camera, opening: Opening) {
  const reach = clampNumber(
    fitDistance(camera, opening.width * 1.5),
    72,
    entryRoom(opening).depth - 16,
  );
  return opening.jambDepth + reach;
}

function span(time: number, start: number, end: number) {
  return clampNumber((time - start) / (end - start), 0, 1);
}

function easeInOut(value: number) {
  return value * value * (3 - 2 * value);
}

function easeOut(value: number) {
  return 1 - (1 - value) ** 3;
}

/**
 * Plays the reveal: the old door dissolves, the opening stands empty for a
 * beat, the new door is seated, light crosses it, and the camera eases in.
 */
function RevealDirector({
  opening,
  facade,
  stage,
  revealNonce,
  viewNonce,
  onPlaying,
  onEnd,
}: {
  opening: Opening;
  facade: ReturnType<typeof facadeFromMark>;
  stage: RefObject<RevealStage>;
  revealNonce: number;
  viewNonce: number;
  onPlaying: (playing: boolean) => void;
  onEnd: () => void;
}) {
  const { camera } = useThree();
  const clock = useRef(-1);
  const lastReveal = useRef(0);
  const callbacks = useRef({ onPlaying, onEnd });

  useEffect(() => {
    callbacks.current = { onPlaying, onEnd };
  }, [onPlaying, onEnd]);

  const finish = () => {
    clock.current = -1;
    Object.assign(stage.current, { playing: false, dissolve: 0, settle: 1, sweep: 0 });
    callbacks.current.onPlaying(false);
    callbacks.current.onEnd();
  };

  // A new reveal number starts the animation. Any other camera change ends it.
  useEffect(() => {
    if (revealNonce === lastReveal.current) {
      if (clock.current >= 0) finish();
      return;
    }
    lastReveal.current = revealNonce;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      finish();
      return;
    }
    clock.current = 0;
    Object.assign(stage.current, { playing: true, dissolve: 0, settle: 0, sweep: 0 });
    callbacks.current.onPlaying(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealNonce, viewNonce]);

  /* eslint-disable react-hooks/immutability */
  useFrame((_, delta) => {
    if (clock.current < 0) return;
    clock.current += Math.min(delta, 0.05);
    const time = clock.current;
    const reveal = stage.current;
    reveal.dissolve = easeInOut(span(time, 0.7, 2.1));
    reveal.settle = easeOut(span(time, 2.6, 3.7));
    reveal.sweep = span(time, 3.7, 4.8);

    const pose = cameraPose("exterior", opening, facade);
    const closer = easeInOut(span(time, 0.4, 4.8));
    const start = exteriorZ(camera, opening, facade);
    // Ease in, but never so close that the door is cut off on a narrow screen.
    const end = -Math.max(-start * 0.74, fitDistance(camera, opening.width * 1.3));
    camera.position.set(
      pose.position[0],
      THREE.MathUtils.lerp(pose.position[1], opening.height * 0.5, closer * 0.5),
      THREE.MathUtils.lerp(start, end, closer),
    );
    camera.lookAt(...pose.target);
    if (time >= REVEAL_SECONDS) finish();
  });
  /* eslint-enable react-hooks/immutability */

  return null;
}

function woodTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  if (context) {
    // Eight planks side by side, each with its own tone, grain, and end joints.
    let seed = 7;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let plank = 0; plank < 8; plank += 1) {
      const x = plank * 64;
      let y = -random() * 300;
      while (y < 512) {
        const length = 220 + random() * 200;
        const light = 36 + random() * 4;
        context.fillStyle = `hsl(${27 + random() * 3}, ${28 + random() * 5}%, ${light}%)`;
        context.fillRect(x, y, 64, length);
        for (let line = 0; line < 9; line += 1) {
          context.fillStyle = `rgba(40, 24, 12, ${0.04 + random() * 0.07})`;
          context.fillRect(x + random() * 62, y, 1 + random(), length);
        }
        context.fillStyle = "rgba(30, 18, 10, 0.55)";
        context.fillRect(x, y + length - 1, 64, 1.5);
        y += length;
      }
      context.fillStyle = "rgba(30, 18, 10, 0.6)";
      context.fillRect(x, 0, 1.2, 512);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

function Room({ opening, hasPhoto }: { opening: Opening; hasPhoto: boolean }) {
  const room = entryRoom(opening);
  const wall = "#efe8dc";
  const trim = "#f7f4ee";
  const centerZ = opening.jambDepth + room.depth / 2;
  const frontZ = opening.jambDepth;
  const sideBase = (room.width - opening.width) / 2;
  const wood = useMemo(() => {
    const texture = woodTexture();
    // One tile is 48 inches of floor: eight 6 inch planks running toward the door.
    texture.repeat.set(room.width / 48, room.depth / 48);
    return texture;
  }, [room.width, room.depth]);

  useEffect(() => () => wood.dispose(), [wood]);

  return (
    <group>
      <mesh position={[0, -0.04, -70]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[room.width + 80, 140]} />
        <meshStandardMaterial color="#cfc6b6" roughness={1} />
      </mesh>
      <mesh position={[0, 0.02, centerZ]} receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[room.width, room.depth]} />
        <meshStandardMaterial envMapIntensity={0.6} map={wood} roughness={0.5} />
      </mesh>
      <mesh castShadow position={[0, room.ceiling + 0.75, centerZ]}>
        <boxGeometry args={[room.width + 3, 1.5, room.depth + 3]} />
        <meshStandardMaterial color="#f6f2ea" roughness={0.95} />
      </mesh>
      <mesh castShadow position={[-room.width / 2, room.ceiling / 2, centerZ]} receiveShadow>
        <boxGeometry args={[1.5, room.ceiling, room.depth]} />
        <meshStandardMaterial color={wall} roughness={0.95} />
      </mesh>
      <mesh castShadow position={[room.width / 2, room.ceiling / 2, centerZ]} receiveShadow>
        <boxGeometry args={[1.5, room.ceiling, room.depth]} />
        <meshStandardMaterial color={wall} roughness={0.95} />
      </mesh>
      <mesh position={[0, room.ceiling / 2, opening.jambDepth + room.depth]} receiveShadow>
        <boxGeometry args={[room.width, room.ceiling, 1.5]} />
        <meshStandardMaterial color="#e7e0d2" roughness={0.95} />
      </mesh>

      {/* Baseboards on the side and back walls. */}
      {[-1, 1].map((sign) => (
        <mesh key={`base-${sign}`} position={[sign * (room.width / 2 - 1.1), 2.75, centerZ]}>
          <boxGeometry args={[0.7, 5.5, room.depth]} />
          <meshStandardMaterial color={trim} roughness={0.6} />
        </mesh>
      ))}
      <mesh position={[0, 2.75, opening.jambDepth + room.depth - 1.1]}>
        <boxGeometry args={[room.width, 5.5, 0.7]} />
        <meshStandardMaterial color={trim} roughness={0.6} />
      </mesh>

      {/* With no interior photo, the door gets painted casing and baseboards inside. */}
      {!hasPhoto && (
        <group>
          {[-1, 1].map((sign) => (
            <mesh
              key={`front-base-${sign}`}
              position={[sign * (opening.width / 2 + 3.5 + (sideBase - 3.5) / 2), 2.75, frontZ + 0.35]}
            >
              <boxGeometry args={[Math.max(sideBase - 3.5, 0.1), 5.5, 0.7]} />
              <meshStandardMaterial color={trim} roughness={0.6} />
            </mesh>
          ))}
          {[-1, 1].map((sign) => (
            <mesh
              key={`casing-${sign}`}
              position={[sign * (opening.width / 2 + 1.75), (opening.height + 3.5) / 2, frontZ + 0.4]}
            >
              <boxGeometry args={[3.5, opening.height + 3.5, 0.8]} />
              <meshStandardMaterial color={trim} roughness={0.55} />
            </mesh>
          ))}
          <mesh position={[0, opening.height + 1.75, frontZ + 0.4]}>
            <boxGeometry args={[opening.width, 3.5, 0.8]} />
            <meshStandardMaterial color={trim} roughness={0.55} />
          </mesh>
        </group>
      )}
    </group>
  );
}

function ViewerControls({
  opening,
  mark,
  doorOpen,
  viewName,
  viewNonce,
  paused,
}: {
  opening: Opening;
  mark: DoorMark;
  doorOpen: number;
  viewName: PlannerView;
  viewNonce: number;
  /** True while the reveal owns the camera. */
  paused: boolean;
}) {
  const { camera } = useThree();
  const orbit = useRef<OrbitControlsImpl>(null);
  const walk = useRef<PointerLockControlsImpl>(null);
  const keys = useRef({
    KeyW: false,
    KeyA: false,
    KeyS: false,
    KeyD: false,
    ArrowUp: false,
    ArrowLeft: false,
    ArrowDown: false,
    ArrowRight: false,
  });
  const openRef = useRef(doorOpen);
  const [locked, setLocked] = useState(false);
  const facade = useMemo(() => facadeFromMark(opening, mark), [opening, mark]);
  const bounds = walkBounds(opening, facade);
  // A phone held upright needs to stand farther back to see the whole door.
  const farthest = () => Math.min(bounds.minZ, exteriorZ(camera, opening, facade) - 24);

  useEffect(() => {
    openRef.current = doorOpen;
  }, [doorOpen]);

  useEffect(() => {
    const setKey = (event: KeyboardEvent, down: boolean) => {
      if (event.code in keys.current) {
        keys.current[event.code as keyof typeof keys.current] = down;
        if (down && document.pointerLockElement && event.code.startsWith("Arrow")) {
          event.preventDefault();
        }
      }
    };
    const onDown = (event: KeyboardEvent) => setKey(event, true);
    const onUp = (event: KeyboardEvent) => setKey(event, false);
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, []);

  useEffect(() => {
    if (document.pointerLockElement) document.exitPointerLock();
    const pose = cameraPose(viewName, opening, facade);
    camera.position.set(
      pose.position[0],
      pose.position[1],
      viewName === "exterior"
        ? exteriorZ(camera, opening, facade)
        : viewName === "inside"
          ? insideZ(camera, opening)
          : pose.position[2],
    );
    camera.lookAt(...pose.target);
    orbit.current?.target.set(...pose.target);
    orbit.current?.update();
  }, [camera, facade, opening, viewName, viewNonce]);

  // The WebGL camera is a mutable scene object. Walk mode and orbit limits update it in place.
  /* eslint-disable react-hooks/immutability */
  useFrame((_, delta) => {
    const controls = walk.current;
    if (!controls?.isLocked) return;
    const previous = camera.position.clone();
    const speed = 48 * Math.min(delta, 0.05);
    const pressed = keys.current;
    if (pressed.KeyW || pressed.ArrowUp) controls.moveForward(speed);
    if (pressed.KeyS || pressed.ArrowDown) controls.moveForward(-speed);
    if (pressed.KeyA || pressed.ArrowLeft) controls.moveRight(-speed);
    if (pressed.KeyD || pressed.ArrowRight) controls.moveRight(speed);
    camera.position.y = bounds.eye;
    camera.position.x = clampNumber(camera.position.x, bounds.minX, bounds.maxX);
    camera.position.z = clampNumber(camera.position.z, farthest(), bounds.maxZ);
    if (cameraBlocked(camera.position.x, camera.position.z, opening, openRef.current)) {
      camera.position.copy(previous);
      camera.position.y = bounds.eye;
    }
  });

  const span = Math.max(facade.width, facade.height, 120);

  return (
    <>
      <OrbitControls
        enablePan={false}
        enabled={!locked && !paused}
        maxDistance={Math.max(span * 2.2, -farthest() + 40)}
        maxPolarAngle={Math.PI / 2 - 0.04}
        minDistance={16}
        onChange={() => {
          if (walk.current?.isLocked) return;
          const outside = camera.position.z < 0;
          const xLimit = outside ? Math.max(bounds.maxX, facade.width / 2) : bounds.maxX;
          const maxY = outside ? Math.max(facade.top, 96) : entryRoom(opening).ceiling - 8;
          camera.position.x = clampNumber(camera.position.x, -xLimit, xLimit);
          camera.position.z = clampNumber(camera.position.z, farthest(), bounds.maxZ);
          camera.position.y = clampNumber(camera.position.y, 12, maxY);
          if (cameraBlocked(camera.position.x, camera.position.z, opening, openRef.current)) {
            const outside = camera.position.z < opening.jambDepth / 2;
            const clearOfOutswing = -(doorLeaf(opening).width + 10);
            camera.position.z = outside
              ? opening.swing === "out" && openRef.current >= 0.72
                ? clearOfOutswing
                : -12
              : opening.jambDepth + 18;
          }
        }}
        ref={orbit}
      />
      {/* eslint-enable react-hooks/immutability */}
      <PointerLockControls
        onLock={() => setLocked(true)}
        onUnlock={() => {
          setLocked(false);
          const direction = new THREE.Vector3();
          camera.getWorldDirection(direction);
          orbit.current?.target.copy(camera.position).add(direction.multiplyScalar(48));
        }}
        ref={walk}
        selector="#planner-walk"
      />
    </>
  );
}

function photoGeometry(
  rect: WallRect,
  facade: ReturnType<typeof facadeFromMark>,
  z = PHOTO_Z,
  inside = false,
) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(
      new Float32Array([
        rect.x0, rect.y0, z,
        rect.x1, rect.y0, z,
        rect.x1, rect.y1, z,
        rect.x0, rect.y1, z,
      ]),
      3,
    ),
  );
  // The exterior camera shows this plane mirrored, so U runs right to left.
  // An interior photo is seen from the other side and runs left to right.
  const across = (x: number) => (x - facade.left) / facade.width;
  const u0 = inside ? across(rect.x0) : 1 - across(rect.x0);
  const u1 = inside ? across(rect.x1) : 1 - across(rect.x1);
  const v0 = (rect.y0 - facade.bottom) / facade.height;
  const v1 = (rect.y1 - facade.bottom) / facade.height;
  geometry.setAttribute(
    "uv",
    new THREE.BufferAttribute(new Float32Array([u0, v0, u1, v0, u1, v1, u0, v1]), 2),
  );
  geometry.setIndex(inside ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]);
  geometry.computeVertexNormals();
  return geometry;
}

function loadTexture(url: string, color = true) {
  return new Promise<THREE.Texture>((resolve, reject) => {
    new THREE.TextureLoader().load(
      url,
      (texture) => {
        texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        texture.anisotropy = 8;
        resolve(texture);
      },
      undefined,
      () => reject(new Error("Could not load the image.")),
    );
  });
}

function usePreviewTexture(url: string | null) {
  const [state, setState] = useState<{
    url: string | null;
    texture: THREE.Texture | null;
    failed: boolean;
  }>({ url: null, texture: null, failed: false });

  useEffect(() => {
    if (!url) return;
    let alive = true;
    let loaded: THREE.Texture | null = null;
    loadTexture(url)
      .then((texture) => {
        if (!alive) {
          texture.dispose();
          return;
        }
        loaded = texture;
        setState({ url, texture, failed: false });
      })
      .catch(() => {
        if (alive) setState({ url, texture: null, failed: true });
      });
    return () => {
      alive = false;
      loaded?.dispose();
    };
  }, [url]);

  return state.url === url ? state : { url, texture: null, failed: false };
}

/** The catalog photo cropped to the door, plus a cutout of its ironwork when it has glass. */
function useDoorTextures(url: string) {
  const [state, setState] = useState<{
    url: string | null;
    map: THREE.Texture | null;
    iron: THREE.Texture | null;
    failed: boolean;
  }>({ url: null, map: null, iron: null, failed: false });

  useEffect(() => {
    let alive = true;
    const loaded: THREE.Texture[] = [];
    (async () => {
      const layers = await doorLayers(url, 1024).catch(() => ({ colorUrl: url, ironUrl: null }));
      const map = await loadTexture(layers.colorUrl);
      loaded.push(map);
      const iron = layers.ironUrl ? await loadTexture(layers.ironUrl, false) : null;
      if (iron) loaded.push(iron);
      if (alive) setState({ url, map, iron, failed: false });
      else loaded.forEach((texture) => texture.dispose());
    })().catch(() => {
      if (alive) setState({ url, map: null, iron: null, failed: true });
    });
    return () => {
      alive = false;
      loaded.forEach((texture) => texture.dispose());
    };
  }, [url]);

  return state.url === url ? state : { url, map: null, iron: null, failed: false };
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
