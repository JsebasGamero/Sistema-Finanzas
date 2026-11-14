const MARCAS = {
    INGRESO: { clase: 'ingreso', letra: 'I', nombre: 'Ingreso' },
    EGRESO: { clase: 'egreso', letra: 'E', nombre: 'Egreso' },
    TRANSFERENCIA: { clase: 'transferencia', letra: 'T', nombre: 'Transferencia' },
};

/** Marca I / E / T del libro de caja, con el nombre para lectores de pantalla. */
export default function MarcaTipo({ tipo }) {
    const marca = MARCAS[tipo] ?? { clase: '', letra: '?', nombre: 'Tipo desconocido' };
    return (
        <span className={`tipo-mark ${marca.clase}`}>
            <span aria-hidden="true">{marca.letra}</span>
            <span className="sr-only">{marca.nombre}</span>
        </span>
    );
}
