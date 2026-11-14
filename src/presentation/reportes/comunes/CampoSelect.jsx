/**
 * Select con su label, para las barras de filtros de reportes.
 * @param {{ id: string, etiqueta: string, valor: string, onCambiar: (v: string) => void,
 *           opciones: Array<{ valor: string, texto: string }>, todos?: string, className?: string }} props
 */
export default function CampoSelect({ id, etiqueta, valor, onCambiar, opciones, todos = 'Todos', className = 'sm:w-52' }) {
    return (
        <div className={`min-w-0 ${className}`}>
            <label className="label" htmlFor={id}>{etiqueta}</label>
            <select id={id} className="input-field" value={valor} onChange={(e) => onCambiar(e.target.value)}>
                <option value="">{todos}</option>
                {opciones.map((o) => (
                    <option key={o.valor} value={o.valor}>{o.texto}</option>
                ))}
            </select>
        </div>
    );
}
