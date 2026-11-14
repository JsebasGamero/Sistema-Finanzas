/**
 * Marco de una gráfica del tablero: panel con título, subtítulo (el periodo
 * o "actual") y su propio estado vacío.
 */
export default function TarjetaGrafica({ titulo, subtitulo, vacia = false, mensajeVacio = 'Sin datos en este periodo.', leyenda, children, className = '' }) {
    return (
        <section className={`card card-flush min-w-0 ${className}`} aria-label={titulo}>
            <header className="panel-head">
                <div className="min-w-0">
                    <h3 className="panel-title">{titulo}</h3>
                    {subtitulo && <p className="text-xs text-ink-3 mt-0.5">{subtitulo}</p>}
                </div>
            </header>
            {vacia ? (
                <p className="empty-state">{mensajeVacio}</p>
            ) : (
                <div className="px-2 pt-3 pb-2 sm:px-4">
                    {/* La leyenda va bajo el título y no a su lado: en media columna,
                        junto a un subtítulo largo, se partía en tres renglones. */}
                    {leyenda && <div className="px-2 pb-2 sm:px-0">{leyenda}</div>}
                    {children}
                </div>
            )}
        </section>
    );
}
