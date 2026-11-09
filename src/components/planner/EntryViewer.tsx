"use client";

import { OrbitControls, PointerLockControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { OrbitControls as OrbitControlsImpl, PointerLockControls as PointerLockControlsImpl } from "three-stdlib";
import * as THREE from "three";
import {
  DoorMark,
  FRAME,
  Opening,
  PlannerView,
  WallRect,
  cameraBlocked,
  cameraPose,
  doorLeaf,
  doorTextureSrc,
  doorTextureUrl,
  entryRoom,
  facadeFromMark,
  facadeRects,
  hingeX,
  swingRadians,
  walkBounds,
} from "@/lib/planner";

const PHOTO_Z = -0.2;

export function EntryViewer({
  doorImageUrl,
  photoUrl,
  opening,
  mark,
  doorOpen,
  viewName,
  viewNonce,
}: {
  doorImageUrl: string;
  photoUrl: string;
  opening: Opening;
  mark: DoorMark;
  doorOpen: number;
  viewName: PlannerView;
  viewNonce: number;
}) {
  const photo = usePreviewTexture(photoUrl);
  const door = usePreviewTexture(doorTextureSrc(doorImageUrl), true);

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
          <EntryScene
            doorOpen={doorOpen}
            doorTexture={door.texture}
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
}: {
  opening: Opening;
  mark: DoorMark;
  photoTexture: THREE.Texture;
  doorTexture: THREE.Texture | null;
  doorOpen: number;
  viewName: PlannerView;
  viewNonce: number;
}) {
  const facade = useMemo(() => facadeFromMark(opening, mark), [opening, mark]);
  const rects = useMemo(() => facadeRects(facade, opening), [facade, opening]);
  const geometries = useMemo(
    () => rects.map((rect) => photoGeometry(rect, facade)),
    [rects, facade],
  );
  const room = entryRoom(opening);

  useEffect(() => () => geometries.forEach((geometry) => geometry.dispose()), [geometries]);

  return (
    <>
      <hemisphereLight args={["#fff6ea", "#b5aa98", 1.15]} />
      <ambientLight intensity={0.35} />
      <directionalLight color="#fff8ee" intensity={2.6} position={[-30, 90, -70]} />
      <pointLight
        color="#fff4e5"
        distance={room.depth + opening.jambDepth + 40}
        intensity={18}
        position={[0, room.ceiling - 12, opening.jambDepth + 48]}
      />

      {geometries.map((geometry, index) => (
        <mesh geometry={geometry} key={rects[index].id}>
          <meshStandardMaterial map={photoTexture} metalness={0} roughness={0.92} />
        </mesh>
      ))}

      {rects.map((rect) => (
        <mesh
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
      <HingedDoor doorOpen={doorOpen} opening={opening} texture={doorTexture} />
      <Room opening={opening} />
      <ViewerControls
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
}: {
  opening: Opening;
  doorOpen: number;
  texture: THREE.Texture | null;
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
    if (group.current) group.current.rotation.y = swingRadians(opening, open.current);
  });

  return (
    <group position={[hingeX(opening), FRAME.sill, 0.75]} ref={group}>
      <mesh position={[towardLock * (leaf.width / 2), leaf.height / 2, leaf.thickness / 2]}>
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
    </group>
  );
}

function Room({ opening }: { opening: Opening }) {
  const room = entryRoom(opening);
  const wall = "#efe8dc";
  const centerZ = opening.jambDepth + room.depth / 2;

  return (
    <group>
      <mesh position={[0, -0.04, -70]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[room.width + 80, 140]} />
        <meshStandardMaterial color="#cfc6b6" roughness={1} />
      </mesh>
      <mesh position={[0, 0.02, centerZ]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[room.width, room.depth]} />
        <meshStandardMaterial color="#8d7968" roughness={0.96} />
      </mesh>
      <mesh position={[0, room.ceiling, centerZ]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[room.width, room.depth]} />
        <meshStandardMaterial color="#f6f2ea" side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[-room.width / 2, room.ceiling / 2, centerZ]}>
        <boxGeometry args={[1.5, room.ceiling, room.depth]} />
        <meshStandardMaterial color={wall} roughness={0.95} />
      </mesh>
      <mesh position={[room.width / 2, room.ceiling / 2, centerZ]}>
        <boxGeometry args={[1.5, room.ceiling, room.depth]} />
        <meshStandardMaterial color={wall} roughness={0.95} />
      </mesh>
      <mesh position={[0, room.ceiling / 2, opening.jambDepth + room.depth]}>
        <boxGeometry args={[room.width, room.ceiling, 1.5]} />
        <meshStandardMaterial color="#e7e0d2" roughness={0.95} />
      </mesh>
    </group>
  );
}

function ViewerControls({
  opening,
  mark,
  doorOpen,
  viewName,
  viewNonce,
}: {
  opening: Opening;
  mark: DoorMark;
  doorOpen: number;
  viewName: PlannerView;
  viewNonce: number;
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
    camera.position.set(...pose.position);
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
    camera.position.z = clampNumber(camera.position.z, bounds.minZ, bounds.maxZ);
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
        enabled={!locked}
        maxDistance={span * 2.2}
        maxPolarAngle={Math.PI / 2 - 0.04}
        minDistance={16}
        onChange={() => {
          if (walk.current?.isLocked) return;
          const outside = camera.position.z < 0;
          const xLimit = outside ? Math.max(bounds.maxX, facade.width / 2) : bounds.maxX;
          const maxY = outside ? Math.max(facade.top, 96) : entryRoom(opening).ceiling - 8;
          camera.position.x = clampNumber(camera.position.x, -xLimit, xLimit);
          camera.position.z = clampNumber(camera.position.z, bounds.minZ, bounds.maxZ);
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

function photoGeometry(rect: WallRect, facade: ReturnType<typeof facadeFromMark>) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(
      new Float32Array([
        rect.x0, rect.y0, PHOTO_Z,
        rect.x1, rect.y0, PHOTO_Z,
        rect.x1, rect.y1, PHOTO_Z,
        rect.x0, rect.y1, PHOTO_Z,
      ]),
      3,
    ),
  );
  // The exterior camera shows this plane mirrored, so U runs right to left.
  const u0 = 1 - (rect.x0 - facade.left) / facade.width;
  const u1 = 1 - (rect.x1 - facade.left) / facade.width;
  const v0 = (rect.y0 - facade.bottom) / facade.height;
  const v1 = (rect.y1 - facade.bottom) / facade.height;
  geometry.setAttribute(
    "uv",
    new THREE.BufferAttribute(new Float32Array([u0, v0, u1, v0, u1, v1, u0, v1]), 2),
  );
  geometry.setIndex([0, 2, 1, 0, 3, 2]);
  geometry.computeVertexNormals();
  return geometry;
}

function usePreviewTexture(url: string, cropDoor = false) {
  const [state, setState] = useState<{ texture: THREE.Texture | null; failed: boolean }>({
    texture: null,
    failed: false,
  });

  useEffect(() => {
    let alive = true;
    let texture: THREE.Texture | null = null;
    const loader = new THREE.TextureLoader();

    const apply = (next: THREE.Texture) => {
      if (!alive) {
        next.dispose();
        return;
      }
      next.colorSpace = THREE.SRGBColorSpace;
      next.anisotropy = 8;
      next.flipY = true;
      texture = next;
      setState({ texture: next, failed: false });
    };
    const fail = () => {
      if (alive) setState({ texture: null, failed: true });
    };
    const load = (source: string) => loader.load(source, apply, undefined, fail);

    const prepare = cropDoor ? doorTextureUrl(url, 1024).catch(() => url) : Promise.resolve(url);
    prepare.then(load).catch(fail);

    return () => {
      alive = false;
      texture?.dispose();
    };
  }, [cropDoor, url]);

  return state;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
