import React, { useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { MeshDistortMaterial, Sphere, OrbitControls } from '@react-three/drei';

function AnimatedSphere() {
    const mesh = useRef();
    const [hovered, setHover] = useState(false);

    useFrame((state) => {
        const t = state.clock.getElapsedTime();
        mesh.current.distort = 0.3 + Math.sin(t) * 0.2;
        mesh.current.rotation.x = t * 0.5;
        mesh.current.rotation.y = t * 0.6;
    });

    return (
        <Sphere args={[1, 100, 200]} scale={hovered ? 2.2 : 2} ref={mesh}
            onPointerOver={() => setHover(true)}
            onPointerOut={() => setHover(false)}
        >
            <MeshDistortMaterial
                color={hovered ? "#ad0579" : "#4a00e0"}
                attach="material"
                distort={0.5}
                speed={1.5}
                roughness={0}
                metalness={0.8}
            />
        </Sphere>
    );
}

const ThreeHero = () => {
    return (
        <div style={{ width: '100%', height: '300px', position: 'relative' }}>
            <Canvas camera={{ position: [0, 0, 5] }}>
                <ambientLight intensity={0.5} />
                <commonSurfaceShader />
                <pointLight position={[10, 10, 10]} />
                <AnimatedSphere />
                <OrbitControls enableZoom={false} />
            </Canvas>
        </div>
    );
};

export default ThreeHero;
