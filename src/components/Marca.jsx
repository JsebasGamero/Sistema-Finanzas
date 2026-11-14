// Marca de FinanzasObra: el mismo dibujo que public/favicon.svg (un cuadro de
// tinta con dos columnas, como un libro de cuentas visto de canto), hecho con
// tokens para que se invierta solo en el tema noche.

/** Cuadro de la marca. `tam` en px. */
export function MarcaIcono({ tam = 28 }) {
    return (
        <span
            aria-hidden="true"
            className="relative inline-block flex-shrink-0 rounded-md bg-ink"
            style={{ width: tam, height: tam }}
        >
            <span className="absolute bg-accent" style={{ left: '22%', top: '22%', width: '25%', height: '56%' }} />
            <span className="absolute bg-paper" style={{ left: '53%', top: '41%', width: '25%', height: '37%' }} />
        </span>
    );
}

/** Cuadro + nombre. `ocultarNombreBajo360` deja solo el cuadro en celulares de 320 px. */
export default function Marca({ tam = 28, tamTexto = 16, ocultarNombreBajo360 = false }) {
    return (
        <span className="flex min-w-0 items-center gap-2.5">
            <MarcaIcono tam={tam} />
            <span
                className={`truncate font-bold tracking-[-0.01em] text-ink ${ocultarNombreBajo360 ? 'hidden min-[360px]:inline' : ''}`}
                style={{ fontSize: tamTexto }}
            >
                FinanzasObra
            </span>
        </span>
    );
}
