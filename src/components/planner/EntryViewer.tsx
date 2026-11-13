"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import {
  DoorMark,
  FRAME,
  Facade,
  Opening,
  PlannerView,
  WallRect,
  doorLeaf,
  doorTextureSrc,
  facadeFromMark,
  facadeRects,
  hingeX,
  swingRadians,
} from "@/lib/planner";
import { DoorArt, doorArtKey, prepareDoorArt } from "@/lib/door-art";

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
  glass,
  finish,
  preloadDoorUrls,
  onBusyChange,
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
  /** The glass the customer chose. */
  glass?: { id: string; name: string };
  /** The finish the customer chose. */
  finish?: { id: string; name: string; hex: string; textureUrl: string | null };
  /** Doors the customer is likely to step to next, prepared in idle time. */
  preloadDoorUrls?: string[];
  /** True while the requested door, glass, or finish is still being prepared. */
  onBusyChange?: (busy: boolean) => void;
}) {
  const photo = usePreviewTexture(photoUrl);
  const plate = usePreviewTexture(plateUrl ?? null);
  const interior = usePreviewTexture(interiorPhotoUrl ?? null);
  const stage = useRef<RevealStage>({ playing: false, dissolve: 0, settle: 1, sweep: 0 });
  const capture = useRef<(() => HTMLCanvasElement) | null>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const fadePending = useRef(false);
  const setCapture = useCallback((take: () => HTMLCanvasElement) => {
    capture.current = take;
  }, []);

  // Before the door changes, the current frame is copied onto a canvas over
  // the 3D view, the door is swapped underneath, and the copy fades away.
  const freezeFrame = useCallback(() => {
    const take = capture.current;
    const layer = overlay.current;
    if (!take || !layer || stage.current.playing) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const source = take();
    if (!source.width || !source.height) return;
    layer.width = source.width;
    layer.height = source.height;
    layer.getContext("2d")?.drawImage(source, 0, 0);
    layer.getAnimations().forEach((animation) => animation.cancel());
    layer.style.opacity = "1";
    fadePending.current = true;
  }, []);

  const door = useDoorArt(
    doorTextureSrc(doorImageUrl),
    glass ?? DEFAULT_GLASS,
    finish ?? DEFAULT_FINISH,
    preloadDoorUrls,
    onBusyChange,
    freezeFrame,
  );
  const textures = useArtTextures(door.art);

  // Once the new door has been drawn, fade the frozen frame away.
  useEffect(() => {
    if (!fadePending.current) return;
    fadePending.current = false;
    const layer = overlay.current;
    if (!layer) return;
    let frame = window.requestAnimationFrame(() => {
      frame = window.requestAnimationFrame(() => {
        layer.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 360, easing: "ease-out" });
        layer.style.opacity = "0";
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [textures]);

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
        >
          <color args={["#d5cec1"]} attach="background" />
          <FrameCapture onReady={setCapture} />
          <EntryScene
            art={door.art}
            compare={compare}
            onRevealEnd={onRevealEnd}
            revealNonce={revealNonce}
            doorOpen={doorOpen}
            stage={stage}
            textures={textures}
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
      <canvas aria-hidden="true" className="planner-freeze" ref={overlay} />
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
  art,
  textures,
  stage,
  doorOpen,
  viewName,
  viewNonce,
  revealNonce,
  compare,
  onRevealEnd,
  interiorTexture,
  interiorMark,
  plateTexture,
  removed,
}: {
  opening: Opening;
  mark: DoorMark;
  photoTexture: THREE.Texture;
  art: DoorArt | null;
  textures: ArtTextures | null;
  stage: RefObject<RevealStage>;
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
  const [playing, setPlaying] = useState(false);
  const facade = useMemo(() => facadeFromMark(opening, mark), [opening, mark]);
  const rects = useMemo(() => facadeRects(facade, opening), [facade, opening]);
  const geometries = useMemo(
    () => rects.map((rect) => photoGeometry(rect, facade)),
    [rects, facade],
  );
  // The interior photo, when there is one, is laid around the opening on the
  // inside face of the wall. Nothing else is added to either side.
  const insideFacade = useMemo(
    () => (interiorTexture && interiorMark ? facadeFromMark(opening, interiorMark, "interior") : null),
    [interiorMark, interiorTexture, opening],
  );
  const insidePhoto = useMemo(() => {
    if (!insideFacade) return [];
    return facadeRects(insideFacade, opening).map((rect) => ({
      id: rect.id,
      geometry: photoGeometry(rect, insideFacade, opening.jambDepth + 0.2, true),
    }));
  }, [insideFacade, opening]);

  useEffect(() => () => geometries.forEach((geometry) => geometry.dispose()), [geometries]);
  useEffect(() => () => insidePhoto.forEach((item) => item.geometry.dispose()), [insidePhoto]);

  return (
    <>
      {/* Lights shade the new door and frame only. The photos are shown exactly as taken. */}
      <StudioEnvironment />
      <hemisphereLight args={["#fff6ea", "#b5aa98", 0.7]} />
      <ambientLight intensity={0.15} />
      <directionalLight color="#fff3e0" intensity={3} position={[-28, 150, -80]} />

      {geometries.map((geometry, index) => (
        <mesh geometry={geometry} key={rects[index].id}>
          {/* Once the old door has been painted out, the wall uses that version. */}
          <meshBasicMaterial map={plateTexture ?? photoTexture} toneMapped={false} />
        </mesh>
      ))}

      {insidePhoto.map((item) => (
        <mesh geometry={item.geometry} key={`${item.id}-inside-photo`}>
          <meshBasicMaterial map={interiorTexture} toneMapped={false} />
        </mesh>
      ))}

      <OpeningTrim opening={opening} />
      {art?.kind === "parts" && art.shaped && textures?.mask && (
        <DoorSurround mask={textures.mask} opening={opening} />
      )}
      <HingedDoor art={art} doorOpen={doorOpen} opening={opening} stage={stage} textures={textures} />
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
        onEnd={onRevealEnd}
        onPlaying={setPlaying}
        revealNonce={revealNonce}
        stage={stage}
        viewNonce={viewNonce}
      />
      <ViewerControls
        facade={facade}
        insideFacade={insideFacade}
        opening={opening}
        paused={playing}
        viewName={viewName}
        viewNonce={viewNonce}
      />
    </>
  );
}

/** The new door frame: casing on the face, jambs lining the opening, and the sill. */
function OpeningTrim({ opening }: { opening: Opening }) {
  const casing = CASING;
  const depth = opening.jambDepth + 0.4;
  const midZ = (opening.jambDepth - 0.4) / 2;
  return (
    <group>
      {/* The casing laps the door's edge, like a stop, so no light shows around the door. */}
      <mesh position={[-opening.width / 2 + CASING_SIDE / 2, opening.height / 2, -0.45]}>
        <boxGeometry args={[CASING_SIDE, opening.height, 1.1]} />
        <meshStandardMaterial color={casing} metalness={0.28} roughness={0.52} />
      </mesh>
      <mesh position={[opening.width / 2 - CASING_SIDE / 2, opening.height / 2, -0.45]}>
        <boxGeometry args={[CASING_SIDE, opening.height, 1.1]} />
        <meshStandardMaterial color={casing} metalness={0.28} roughness={0.52} />
      </mesh>
      <mesh position={[0, opening.height - CASING_HEAD / 2, -0.45]}>
        <boxGeometry args={[opening.width, CASING_HEAD, 1.1]} />
        <meshStandardMaterial color={casing} metalness={0.28} roughness={0.52} />
      </mesh>
      {/* Jambs through the wall thickness, so an open door shows a frame, not a gap. */}
      {[-1, 1].map((sign) => (
        <mesh key={`jamb-${sign}`} position={[sign * (opening.width / 2 - 0.25), opening.height / 2, midZ]}>
          <boxGeometry args={[0.5, opening.height, depth]} />
          <meshStandardMaterial color={casing} metalness={0.28} roughness={0.52} />
        </mesh>
      ))}
      <mesh position={[0, opening.height - 0.25, midZ]}>
        <boxGeometry args={[opening.width, 0.5, depth]} />
        <meshStandardMaterial color={casing} metalness={0.28} roughness={0.52} />
      </mesh>
      <mesh position={[0, 0.45, opening.jambDepth / 2]}>
        <boxGeometry args={[opening.width - 1.5, 0.9, opening.jambDepth]} />
        <meshStandardMaterial color="#6d6256" metalness={0.08} roughness={0.72} />
      </mesh>
      {/* What shows through an open door. The photos cannot show the other
          side, so it is a soft, warm interior light looking in and plain daylight looking out. */}
      <mesh position={[0, opening.height / 2, opening.jambDepth + 0.3]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[opening.width, opening.height]} />
        <meshBasicMaterial color="#d9cfc0" toneMapped={false} />
      </mesh>
      <mesh position={[0, opening.height / 2, -0.7]}>
        <planeGeometry args={[opening.width, opening.height]} />
        <meshBasicMaterial color="#ece7de" toneMapped={false} />
      </mesh>
    </group>
  );
}

function HingedDoor({
  opening,
  doorOpen,
  art,
  textures,
  stage,
}: {
  opening: Opening;
  doorOpen: number;
  art: DoorArt | null;
  textures: ArtTextures | null;
  stage: RefObject<RevealStage>;
}) {
  const group = useRef<THREE.Group>(null);
  const open = useRef(0);
  const reduceMotion = useRef(false);
  const leaf = doorLeaf(opening);
  // The leaf runs from the hinge toward the latch, across the opening.
  const towardLock = hingeX(opening) < 0 ? 1 : -1;

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
      <group position={[towardLock * (leaf.width / 2), leaf.height / 2, 0]}>
        {art?.kind === "parts" && textures?.iron && textures.mask ? (
          <IronLeaf art={art} leaf={leaf} textures={textures} />
        ) : (
          <SlabLeaf leaf={leaf} texture={textures?.photo ?? null} />
        )}
      </group>
    </group>
  );
}

type Leaf = ReturnType<typeof doorLeaf>;

/** Fallback: the catalog photo on a plain slab, or a dark slab while nothing is ready. */
function SlabLeaf({ leaf, texture }: { leaf: Leaf; texture: THREE.Texture | null }) {
  const face = texture ? "#ffffff" : "#2b2926";
  return (
    <mesh castShadow position={[0, 0, leaf.thickness / 2]}>
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
  );
}

/**
 * The door drawn in the chosen finish and glass. The iron is cut out of the
 * render and stacked through the door's thickness, so the scrollwork has real
 * depth. Clear glass is a see-through pane; obscure glass is the designer's
 * textured glass, drawn as seen from outside on the outer face and as seen
 * from inside on the inner face, with a reflective pane over each.
 */
function IronLeaf({
  art,
  leaf,
  textures,
}: {
  art: Extract<DoorArt, { kind: "parts" }>;
  leaf: Leaf;
  textures: ArtTextures;
}) {
  const { width, height, thickness } = leaf;
  const obscure = Boolean(textures.glassOutside && textures.glassInside);
  // The face is turned to the street, so the photo's left edge sits at +X.
  const stiles = [art.edges.left ? 1 : 0, art.edges.right ? -1 : 0].filter((sign) => sign !== 0);
  const rails = [art.edges.top ? 1 : 0, art.edges.bottom ? -1 : 0].filter((sign) => sign !== 0);

  return (
    <>
      {IRON_LAYERS.map((depth, index) => {
        const outer = index === 0 || index === IRON_LAYERS.length - 1;
        return (
          <mesh
            castShadow={index === 0}
            key={depth}
            position={[0, 0, depth * thickness]}
            rotation={[0, Math.PI, 0]}
          >
            <planeGeometry args={[width, height]} />
            <meshStandardMaterial
              alphaMap={textures.mask ?? undefined}
              alphaTest={0.5}
              bumpMap={outer ? (textures.iron ?? undefined) : undefined}
              bumpScale={outer ? 1.4 : 0}
              color={outer ? "#ffffff" : "#8a847c"}
              map={textures.iron ?? undefined}
              metalness={0.38}
              roughness={0.46}
              side={THREE.DoubleSide}
            />
          </mesh>
        );
      })}
      {art.hasGlass && obscure && (
        <>
          <mesh position={[0, 0, thickness * 0.46]} rotation={[0, Math.PI, 0]}>
            <planeGeometry args={[width, height]} />
            <meshBasicMaterial
              alphaMap={textures.mask ?? undefined}
              alphaTest={0.5}
              map={textures.glassOutside ?? undefined}
              onBeforeCompile={alphaFromDoorUnit}
              side={THREE.FrontSide}
              toneMapped={false}
            />
          </mesh>
          <mesh position={[0, 0, thickness * 0.54]} rotation={[0, Math.PI, 0]}>
            <planeGeometry args={[width, height]} />
            <meshBasicMaterial
              alphaMap={textures.mask ?? undefined}
              alphaTest={0.5}
              map={textures.glassInside ?? undefined}
              onBeforeCompile={alphaFromDoorUnit}
              side={THREE.BackSide}
              toneMapped={false}
            />
          </mesh>
        </>
      )}
      {art.hasGlass &&
        GLASS_SHEENS.map(([depth, side]) => (
          <mesh key={depth} position={[0, 0, thickness * depth]} rotation={[0, Math.PI, 0]}>
            <planeGeometry args={[width, height]} />
            <meshPhysicalMaterial
              alphaMap={textures.mask ?? undefined}
              clearcoat={1}
              clearcoatRoughness={0.05}
              color="#dbe6e6"
              depthWrite={false}
              envMapIntensity={1.8}
              metalness={0}
              onBeforeCompile={alphaFromDoorUnit}
              opacity={obscure ? 0.12 : 0.18}
              roughness={0.08}
              side={side}
              transparent
            />
          </mesh>
        ))}
      {stiles.map((sign) => (
        <mesh castShadow key={`stile-${sign}`} position={[sign * (width / 2 - 0.2), 0, thickness / 2]}>
          <boxGeometry args={[0.4, height, thickness]} />
          <meshStandardMaterial color={art.ironHex} metalness={0.5} roughness={0.5} />
        </mesh>
      ))}
      {rails.map((sign) => (
        <mesh castShadow key={`rail-${sign}`} position={[0, sign * (height / 2 - 0.2), thickness / 2]}>
          <boxGeometry args={[width, 0.4, thickness]} />
          <meshStandardMaterial color={art.ironHex} metalness={0.5} roughness={0.5} />
        </mesh>
      ))}
    </>
  );
}

/** A reflective pane just inside each face of the glass: depth through the door, and the side it faces. */
const GLASS_SHEENS = [
  [0.38, THREE.FrontSide],
  [0.62, THREE.BackSide],
] as const;

/**
 * Arched and shaped doors leave part of the rectangular opening outside the
 * door. That part is filled as fixed frame, the same color as the casing, so
 * it stays put when the door swings.
 */
function DoorSurround({ opening, mask }: { opening: Opening; mask: THREE.Texture }) {
  const leaf = doorLeaf(opening);
  const towardLock = hingeX(opening) < 0 ? 1 : -1;
  const x = hingeX(opening) + towardLock * (leaf.width / 2);
  return (
    <group position={[x, FRAME.sill + leaf.height / 2, 0.75]}>
      {IRON_LAYERS.map((depth) => (
        <mesh key={depth} position={[0, 0, depth * leaf.thickness]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[leaf.width, leaf.height]} />
          <meshStandardMaterial
            alphaMap={mask}
            alphaTest={0.5}
            color={CASING}
            metalness={0.28}
            onBeforeCompile={alphaOutsideDoorUnit}
            roughness={0.52}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}

/** The door art's mask keeps the door unit in red and the iron in green. */
function alphaFromDoorUnit(shader: THREE.WebGLProgramParametersWithUniforms) {
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <alphamap_fragment>",
    "#ifdef USE_ALPHAMAP\n\tdiffuseColor.a *= texture2D( alphaMap, vAlphaMapUv ).r;\n#endif",
  );
}

function alphaOutsideDoorUnit(shader: THREE.WebGLProgramParametersWithUniforms) {
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <alphamap_fragment>",
    "#ifdef USE_ALPHAMAP\n\tdiffuseColor.a *= 1.0 - texture2D( alphaMap, vAlphaMapUv ).r;\n#endif",
  );
}

const CASING = "#3c342c";
const CASING_SIDE = FRAME.side + 0.15;
const CASING_HEAD = FRAME.head + 0.15;

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
 * beat, the new door is seated, and light crosses it. The camera holds still.
 */
function RevealDirector({
  stage,
  revealNonce,
  viewNonce,
  onPlaying,
  onEnd,
}: {
  stage: RefObject<RevealStage>;
  revealNonce: number;
  viewNonce: number;
  onPlaying: (playing: boolean) => void;
  onEnd: () => void;
}) {
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

  // The reveal advances shared animation values every frame, outside React.
  /* eslint-disable react-hooks/immutability */
  useFrame((_, delta) => {
    if (clock.current < 0) return;
    clock.current += Math.min(delta, 0.05);
    const time = clock.current;
    const reveal = stage.current;
    reveal.dissolve = easeInOut(span(time, 0.7, 2.1));
    reveal.settle = easeOut(span(time, 2.6, 3.7));
    reveal.sweep = span(time, 3.7, 4.8);
    if (time >= REVEAL_SECONDS) finish();
  });
  /* eslint-enable react-hooks/immutability */

  return null;
}

type Framing = {
  facade: Facade;
  /** Depth of the photo plane the camera looks at. */
  planeZ: number;
  /** -1 stands outside the house, +1 inside. */
  side: -1 | 1;
  target: THREE.Vector3;
  /** How far back the view starts, before it is pulled in to fit the photo. */
  distance: number;
};

function framing(
  view: PlannerView,
  opening: Opening,
  facade: Facade,
  insideFacade: Facade | null,
): Framing {
  if (view === "inside" && insideFacade) {
    return {
      facade: insideFacade,
      planeZ: opening.jambDepth + 0.2,
      side: 1,
      target: new THREE.Vector3(
        (insideFacade.left + insideFacade.right) / 2,
        (insideFacade.bottom + insideFacade.top) / 2,
        opening.jambDepth,
      ),
      distance: 1e4,
    };
  }
  if (view === "threshold") {
    return {
      facade,
      planeZ: PHOTO_Z,
      side: -1,
      target: new THREE.Vector3(0, opening.height * 0.5, 0),
      distance: opening.height * 1.3,
    };
  }
  return {
    facade,
    planeZ: PHOTO_Z,
    side: -1,
    target: new THREE.Vector3((facade.left + facade.right) / 2, (facade.bottom + facade.top) / 2, 0),
    distance: 1e4,
  };
}

const CORNERS = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
] as const;

/** True when every corner of the screen lands on the photo. */
function seesOnlyPhoto(camera: THREE.Camera, fit: Framing) {
  camera.updateMatrixWorld();
  const point = new THREE.Vector3();
  for (const [x, y] of CORNERS) {
    point.set(x, y, 0.5).unproject(camera).sub(camera.position).normalize();
    if (Math.abs(point.z) < 1e-6) return false;
    const reach = (fit.planeZ - camera.position.z) / point.z;
    if (reach <= 0) return false;
    const hitX = camera.position.x + point.x * reach;
    const hitY = camera.position.y + point.y * reach;
    if (
      hitX < fit.facade.left ||
      hitX > fit.facade.right ||
      hitY < fit.facade.bottom ||
      hitY > fit.facade.top
    ) {
      return false;
    }
  }
  return true;
}

const MIN_DISTANCE = 18;

/** Moves the camera toward its target until nothing but the photo is in view. */
function keepInsidePhoto(camera: THREE.Camera, target: THREE.Vector3, fit: Framing) {
  if (seesOnlyPhoto(camera, fit)) return;
  const away = camera.position.clone().sub(target);
  const far = away.length();
  away.normalize();
  let near = Math.min(MIN_DISTANCE, far);
  let outer = far;
  for (let step = 0; step < 18; step += 1) {
    const middle = (near + outer) / 2;
    camera.position.copy(target).addScaledVector(away, middle);
    if (seesOnlyPhoto(camera, fit)) near = middle;
    else outer = middle;
  }
  camera.position.copy(target).addScaledVector(away, near);
  camera.updateMatrixWorld();
}

function ViewerControls({
  opening,
  facade,
  insideFacade,
  viewName,
  viewNonce,
  paused,
}: {
  opening: Opening;
  facade: Facade;
  insideFacade: Facade | null;
  viewName: PlannerView;
  viewNonce: number;
  /** True while the reveal plays: the camera holds still. */
  paused: boolean;
}) {
  const { camera, size } = useThree();
  const orbit = useRef<OrbitControlsImpl>(null);
  const fit = useMemo(
    () => framing(viewName, opening, facade, insideFacade),
    [facade, insideFacade, opening, viewName],
  );

  // The WebGL camera is a mutable scene object; views and limits move it in place.
  useEffect(() => {
    camera.position.set(fit.target.x, fit.target.y, fit.target.z + fit.side * fit.distance);
    camera.lookAt(fit.target);
    keepInsidePhoto(camera, fit.target, fit);
    orbit.current?.target.copy(fit.target);
    orbit.current?.update();
    // The screen size is a dependency so turning the phone refits the view.
  }, [camera, fit, size.width, size.height, viewNonce]);

  // Face-on is azimuth 0 from inside and half a turn from outside.
  const facing = fit.side === 1 ? 0 : Math.PI;

  return (
    <OrbitControls
      enablePan={false}
      enabled={!paused}
      maxAzimuthAngle={facing + 0.3}
      maxDistance={2000}
      maxPolarAngle={Math.PI / 2 + 0.12}
      minAzimuthAngle={facing - 0.3}
      minDistance={MIN_DISTANCE}
      minPolarAngle={Math.PI / 2 - 0.2}
      onChange={() => {
        const controls = orbit.current;
        if (controls) keepInsidePhoto(camera, controls.target, fit);
      }}
      ref={orbit}
    />
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

const DEFAULT_GLASS = { id: "clear", name: "Clear" };
const DEFAULT_FINISH = { id: "as-shown", name: "As shown", hex: "#1c1c1c", textureUrl: null };

type ArtTextures = {
  iron: THREE.Texture | null;
  mask: THREE.Texture | null;
  glassOutside: THREE.Texture | null;
  glassInside: THREE.Texture | null;
  photo: THREE.Texture | null;
};

function canvasTexture(canvas: HTMLCanvasElement | null, color: boolean) {
  if (!canvas) return null;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** GPU textures for the door being shown. Dropped textures are disposed. */
function useArtTextures(art: DoorArt | null): ArtTextures | null {
  const textures = useMemo<ArtTextures | null>(() => {
    if (!art) return null;
    if (art.kind === "photo") {
      return {
        iron: null,
        mask: null,
        glassOutside: null,
        glassInside: null,
        photo: canvasTexture(art.photo, true),
      };
    }
    return {
      iron: canvasTexture(art.iron, true),
      mask: canvasTexture(art.mask, false),
      glassOutside: canvasTexture(art.glassOutside, true),
      glassInside: canvasTexture(art.glassInside, true),
      photo: null,
    };
  }, [art]);
  useEffect(
    () => () => {
      if (!textures) return;
      Object.values(textures).forEach((texture) => texture?.dispose());
    },
    [textures],
  );
  return textures;
}

/**
 * The door to show, in the chosen glass and finish. The door on screen stays
 * until the next one is ready, so changing doors never leaves a blank opening.
 */
function useDoorArt(
  src: string,
  glass: { id: string },
  finish: { id: string; hex: string; textureUrl: string | null },
  preloadUrls: string[] | undefined,
  onBusyChange: ((busy: boolean) => void) | undefined,
  beforeSwap: () => void,
) {
  const key = doorArtKey(src, glass, finish);
  const [state, setState] = useState<{ art: DoorArt | null; failedKey: string | null }>({
    art: null,
    failedKey: null,
  });
  const latest = useRef({ preloadUrls, onBusyChange, beforeSwap });
  useEffect(() => {
    latest.current = { preloadUrls, onBusyChange, beforeSwap };
  }, [preloadUrls, onBusyChange, beforeSwap]);

  const glassId = glass.id;
  const finishId = finish.id;
  const finishHex = finish.hex;
  const finishTexture = finish.textureUrl;

  useEffect(() => {
    let alive = true;
    const chosenGlass = { id: glassId };
    const chosenFinish = { id: finishId, hex: finishHex, textureUrl: finishTexture };
    latest.current.onBusyChange?.(true);
    prepareDoorArt(src, chosenGlass, chosenFinish)
      .then((art) => {
        if (!alive) return;
        latest.current.beforeSwap();
        setState({ art, failedKey: null });
        latest.current.onBusyChange?.(false);
        // Get the neighbors ready so the next step feels instant.
        const queue = [...(latest.current.preloadUrls ?? [])];
        const preloadNext = (): Promise<void> => {
          const next = queue.shift();
          if (!alive || !next) return Promise.resolve();
          return prepareDoorArt(doorTextureSrc(next), chosenGlass, chosenFinish).then(
            preloadNext,
            preloadNext,
          );
        };
        void preloadNext();
      })
      .catch(() => {
        if (!alive) return;
        setState((now) => ({ art: now.art, failedKey: key }));
        latest.current.onBusyChange?.(false);
      });
    return () => {
      alive = false;
    };
  }, [key, src, glassId, finishId, finishHex, finishTexture]);

  const failed = state.failedKey === key;
  return { art: failed ? null : state.art, failed };
}

/** Hands the parent a way to draw the current view on demand. */
function FrameCapture({ onReady }: { onReady: (take: () => HTMLCanvasElement) => void }) {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    onReady(() => {
      gl.render(scene, camera);
      return gl.domElement;
    });
  }, [camera, gl, onReady, scene]);
  return null;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
