import { useEffect, useState } from "react";

import control from "@/assets/login/control-de-cachorro.jpg";
import duena from "@/assets/login/duena-y-perro.jpg";
import perroYGato from "@/assets/login/perro-y-gato.jpg";
import revision from "@/assets/login/revision-veterinaria.jpg";
import { cn } from "@/lib/utils";

const SLIDES = [
  { src: duena, alt: "Una dueña abraza a su perro con cariño" },
  { src: control, alt: "Una veterinaria ausculta a un cachorro" },
  { src: perroYGato, alt: "Una veterinaria sostiene a un perro y a un gato" },
  { src: revision, alt: "Un veterinario revisa a un perro grande" },
];

const INTERVAL_MS = 5000;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false)
  );
}

/**
 * Carrusel decorativo del panel de acceso. Cambia solo cada 5 s, se pausa al pasar el mouse o al
 * enfocar sus controles, y no avanza solo si el sistema pide reducir el movimiento.
 */
export function LoginCarousel() {
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || prefersReducedMotion()) {
      return;
    }
    const timer = setInterval(() => setCurrent((i) => (i + 1) % SLIDES.length), INTERVAL_MS);
    return () => clearInterval(timer);
  }, [paused]);

  return (
    <section
      aria-roledescription="carrusel"
      aria-label="Imágenes de la veterinaria"
      className="relative z-10 flex min-h-0 flex-1 flex-col gap-3 py-8"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="relative min-h-40 flex-1 overflow-hidden rounded-3xl bg-white/10">
        {SLIDES.map((slide, index) => (
          <img
            key={slide.src}
            src={slide.src}
            alt={slide.alt}
            aria-hidden={index !== current}
            className={cn(
              "absolute inset-0 h-full w-full object-cover transition-opacity duration-700 motion-reduce:transition-none",
              index === current ? "opacity-100" : "opacity-0",
            )}
          />
        ))}
      </div>
      <div className="flex justify-center gap-2">
        {SLIDES.map((slide, index) => (
          <button
            key={slide.src}
            type="button"
            aria-label={`Ver imagen ${index + 1} de ${SLIDES.length}`}
            aria-current={index === current}
            onClick={() => setCurrent(index)}
            className={cn(
              "h-2 rounded-full transition-all outline-none focus-visible:ring-2 focus-visible:ring-white",
              index === current ? "w-6 bg-white" : "w-2 bg-white/50 hover:bg-white/80",
            )}
          />
        ))}
      </div>
    </section>
  );
}
