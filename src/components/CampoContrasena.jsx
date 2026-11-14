// Campo de contraseña con botón para ver/ocultar (ADM-18): el botón tiene
// nombre accesible, aria-pressed y 44 px de área táctil. Antes era el puro
// icono de 17 px, imposible de acertar con guantes.
import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export default function CampoContrasena({
    id,
    etiqueta,
    value,
    onChange,
    autoComplete = 'current-password',
    placeholder,
    autoFocus = false,
    required = true,
    minLength,
    ayuda,
    invalido = false,
    disabled = false,
    refInput,
}) {
    const [visible, setVisible] = useState(false);
    const idAyuda = ayuda ? `${id}-ayuda` : undefined;

    return (
        <div>
            <label htmlFor={id} className="label">{etiqueta}</label>
            <div className="relative">
                <input
                    ref={refInput}
                    id={id}
                    type={visible ? 'text' : 'password'}
                    value={value}
                    onChange={onChange}
                    className="input-field"
                    // .input-field fija el padding fuera de las capas de
                    // Tailwind; un pr-12 no lo vence, por eso va en línea.
                    style={{ paddingRight: 48 }}
                    autoComplete={autoComplete}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder={placeholder}
                    autoFocus={autoFocus}
                    required={required}
                    minLength={minLength}
                    disabled={disabled}
                    aria-invalid={invalido || undefined}
                    aria-describedby={idAyuda}
                />
                <button
                    type="button"
                    onClick={() => setVisible((v) => !v)}
                    disabled={disabled}
                    aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    aria-pressed={visible}
                    aria-controls={id}
                    className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-ink-3 transition-colors hover:text-ink disabled:opacity-50"
                >
                    {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
            </div>
            {ayuda && <p id={idAyuda} className="mt-1.5 text-xs text-ink-3">{ayuda}</p>}
        </div>
    );
}
