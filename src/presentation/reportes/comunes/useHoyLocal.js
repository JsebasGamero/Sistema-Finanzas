import { useEffect, useState } from 'react';
import { hoyLocal } from '../../../domain/value-objects/fecha';

/** Milisegundos hasta la próxima medianoche local, con un segundo de margen. */
function msHastaMedianoche(ahora = new Date()) {
    const manana = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + 1);
    return manana.getTime() - ahora.getTime() + 1000;
}

/**
 * Fecha de hoy ('YYYY-MM-DD' local) que cambia sola al pasar la medianoche.
 *
 * Los reportes guardan el preset ("Este mes") y no las fechas, pero si el
 * rango se memoiza solo con el periodo, `hoy` se calcula una vez: con la
 * pantalla abierta del 30 de noviembre al 1 de diciembre seguía filtrando
 * noviembre y lo rotulaba "Este mes". Pasar este valor a rangoDePeriodo y a
 * las dependencias del useMemo recalcula el rango cuando cambia el día.
 *
 * El temporizador no basta: en el celular la app se suspende y los
 * temporizadores de una pestaña oculta se atrasan. Por eso también se revisa
 * al volver a la app (visibilitychange). Si el día no cambió, setHoy recibe
 * el mismo texto y React no vuelve a renderizar.
 */
export function useHoyLocal() {
    const [hoy, setHoy] = useState(() => hoyLocal());

    useEffect(() => {
        let temporizador;
        const actualizar = () => {
            setHoy(hoyLocal());
            clearTimeout(temporizador);
            temporizador = setTimeout(actualizar, msHastaMedianoche());
        };
        const alVolver = () => {
            if (document.visibilityState === 'visible') actualizar();
        };
        temporizador = setTimeout(actualizar, msHastaMedianoche());
        document.addEventListener('visibilitychange', alVolver);
        return () => {
            clearTimeout(temporizador);
            document.removeEventListener('visibilitychange', alVolver);
        };
    }, []);

    return hoy;
}
