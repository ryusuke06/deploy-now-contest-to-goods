"use client";
/* eslint-disable @next/next/no-img-element */
import {
  Component,
  type ReactNode,
  useEffect,
  useState,
  Suspense,
} from "react";
import { Canvas, useThree } from "@react-three/fiber";
import {
  ContactShadows,
  Edges,
  Environment,
  Lightformer,
  OrbitControls,
  RoundedBox,
} from "@react-three/drei";
import { SRGBColorSpace, Texture, TextureLoader } from "three";

function PrintedBlock({ src }: { src: string }) {
  const invalidate = useThree((s) => s.invalidate);
  const gl = useThree((s) => s.gl);
  const [loaded, setLoaded] = useState<{ src: string; map: Texture } | null>(
    null,
  );
  useEffect(() => {
    if (!src) return;
    let cancelled = false;
    const map = new TextureLoader().load(src, (texture) => {
      if (cancelled) {
        texture.dispose();
        return;
      }
      texture.colorSpace = SRGBColorSpace;
      texture.anisotropy = gl.capabilities.getMaxAnisotropy();
      texture.needsUpdate = true;
      setLoaded({ src, map: texture });
      invalidate();
    });
    return () => {
      cancelled = true;
      map.dispose();
    };
  }, [src, invalidate, gl]);
  const map = loaded?.src === src ? loaded.map : null;
  return (
    <group rotation={[0, -0.12, 0]}>
      <mesh position={[0, 0, -0.203]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[1.95, 1.95]} />
        <meshStandardMaterial color="#f7f4ed" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0, -0.199]}>
        <planeGeometry args={[1.95, 1.95]} />
        <meshBasicMaterial
          map={map}
          color={map ? "#ffffff" : "#e8ded0"}
          toneMapped={false}
        />
      </mesh>
      <RoundedBox args={[2, 2, 0.4]} radius={0.012} smoothness={3}>
        <meshPhysicalMaterial
          color="#ffffff"
          metalness={0}
          roughness={0}
          transmission={1}
          thickness={0.4}
          ior={1.49}
          clearcoat={1}
          clearcoatRoughness={0}
          envMapIntensity={0.35}
          attenuationColor="#e5f4ef"
          attenuationDistance={5}
        />
        <Edges threshold={20} color="#d2e1db" transparent opacity={0.3} />
      </RoundedBox>
    </group>
  );
}
function FlatPreview({ src }: { src: string }) {
  return (
    <div className="preview-block has-image">
      {src ? (
        <img src={src} alt="QRコード付き印刷画像" />
      ) : (
        <div className="empty-preview">
          <strong>ここに、あなたの作品を。</strong>
          <small>サイトを撮影するとプレビューできます。</small>
        </div>
      )}
    </div>
  );
}
class PreviewBoundary extends Component<
  { children: ReactNode; src: string },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <FlatPreview src={this.props.src} />
    ) : (
      this.props.children
    );
  }
}
export default function AcrylicPreview({ src }: { src: string }) {
  const [reset, setReset] = useState(0);
  return (
    <div className="acrylic-viewer">
      <div
        className="acrylic-canvas"
        role="img"
        aria-label="厚みと透明感を再現したアクリルブロック。ドラッグで回転できます。"
      >
        <PreviewBoundary src={src}>
          <Canvas
            key={reset}
            dpr={[2, 3]}
            frameloop="demand"
            camera={{ position: [1.1, 0.6, 6], fov: 24 }}
            gl={{ alpha: true, antialias: true, powerPreference: "low-power" }}
            fallback={<FlatPreview src={src} />}
          >
            <ambientLight intensity={0.8} />
            <directionalLight position={[3, 5, 4]} intensity={2} />
            <Suspense fallback={null}>
              <Environment resolution={128} frames={1}>
                <Lightformer
                  intensity={3}
                  position={[-3, 3, 4]}
                  rotation={[0, Math.PI / 4, 0]}
                  scale={[3, 5, 1]}
                />
                <Lightformer
                  intensity={1.5}
                  position={[3, 1, 1]}
                  rotation={[0, -Math.PI / 2, 0]}
                  scale={[2, 4, 1]}
                />
                <Lightformer
                  intensity={2}
                  position={[0, 5, -2]}
                  rotation={[Math.PI / 2, 0, 0]}
                  scale={[4, 4, 1]}
                />
              </Environment>
              <PrintedBlock src={src} />
              <ContactShadows
                position={[0, -1.02, 0]}
                opacity={0.3}
                scale={8}
                blur={2.8}
                far={3}
                resolution={256}
                frames={1}
                color="#34423a"
              />
            </Suspense>
            <OrbitControls
              makeDefault
              enablePan={false}
              enableZoom={false}
              minPolarAngle={Math.PI / 4}
              maxPolarAngle={Math.PI * 0.63}
              minAzimuthAngle={-Math.PI * 0.8}
              maxAzimuthAngle={Math.PI * 0.8}
            />
          </Canvas>
        </PreviewBoundary>
      </div>
      <div className="viewer-controls">
        <span>スワイプで回転</span>
        <button type="button" onClick={() => setReset((v) => v + 1)}>
          角度を戻す ↺
        </button>
      </div>
    </div>
  );
}
