// AutocompleteInput - Reusable autocomplete component with create-on-the-fly functionality
import { useState, useRef, useEffect } from 'react';
import { X, Plus, Check } from 'lucide-react';

export default function AutocompleteInput({
    items = [],
    value = '',
    onChange,
    onCreateNew,
    placeholder = 'Escribir o seleccionar...',
    displayKey = 'nombre',
    valueKey = 'id',
    createLabel = 'Crear nuevo:',
    emptyMessage = 'Sin resultados',
    disabled = false,
    className = ''
}) {
    const [inputValue, setInputValue] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const [highlightIndex, setHighlightIndex] = useState(-1);
    const inputRef = useRef(null);
    const containerRef = useRef(null);

    // Sync input value with selected item
    useEffect(() => {
        if (value) {
            const selectedItem = items.find(item => item[valueKey] === value);
            if (selectedItem) {
                setInputValue(selectedItem[displayKey] || '');
            }
        } else {
            setInputValue('');
        }
    }, [value, items, displayKey, valueKey]);

    // Filter items based on input
    const filteredItems = inputValue
        ? items.filter(item =>
            item[displayKey]?.toLowerCase().includes(inputValue.toLowerCase())
        )
        : items;

    // Check if input matches exactly any existing item
    const exactMatch = items.find(
        item => item[displayKey]?.toLowerCase() === inputValue.toLowerCase()
    );

    // Can create new if input has content and no exact match
    const canCreateNew = inputValue.trim() && !exactMatch && onCreateNew;

    // Close dropdown on outside click
    useEffect(() => {
        function handleClickOutside(e) {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    function handleInputChange(e) {
        const newValue = e.target.value;
        setInputValue(newValue);
        setIsOpen(true);
        setHighlightIndex(-1);

        // If cleared, also clear the selected value
        if (!newValue) {
            onChange?.('');
        }
    }

    function handleSelectItem(item) {
        setInputValue(item[displayKey]);
        onChange?.(item[valueKey]);
        setIsOpen(false);
        setHighlightIndex(-1);
    }

    async function handleCreateNew() {
        if (!canCreateNew) return;

        const trimmedValue = inputValue.trim();
        try {
            const newItem = await onCreateNew(trimmedValue);
            if (newItem) {
                setInputValue(newItem[displayKey] || trimmedValue);
                onChange?.(newItem[valueKey]);
            }
        } catch (error) {
            console.error('Error creating new item:', error);
        }
        setIsOpen(false);
    }

    function handleKeyDown(e) {
        if (!isOpen) {
            if (e.key === 'ArrowDown' || e.key === 'Enter') {
                setIsOpen(true);
            }
            return;
        }

        const totalItems = filteredItems.length + (canCreateNew ? 1 : 0);

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setHighlightIndex(prev => (prev + 1) % totalItems);
                break;
            case 'ArrowUp':
                e.preventDefault();
                setHighlightIndex(prev => (prev - 1 + totalItems) % totalItems);
                break;
            case 'Enter':
                e.preventDefault();
                if (highlightIndex >= 0 && highlightIndex < filteredItems.length) {
                    handleSelectItem(filteredItems[highlightIndex]);
                } else if (canCreateNew && highlightIndex === filteredItems.length) {
                    handleCreateNew();
                } else if (canCreateNew && filteredItems.length === 0) {
                    handleCreateNew();
                }
                break;
            case 'Escape':
                setIsOpen(false);
                setHighlightIndex(-1);
                break;
        }
    }

    function handleClear() {
        setInputValue('');
        onChange?.('');
        inputRef.current?.focus();
    }

    return (
        <div ref={containerRef} className={`relative ${className}`}>
            <div className="relative">
                <input
                    ref={inputRef}
                    type="text"
                    value={inputValue}
                    onChange={handleInputChange}
                    onFocus={() => setIsOpen(true)}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    disabled={disabled}
                    className="input-field pr-10"
                    autoComplete="off"
                />
                {inputValue && (
                    <button
                        type="button"
                        onClick={handleClear}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                    >
                        <X size={16} />
                    </button>
                )}
            </div>

            {/* Dropdown */}
            {isOpen && (
                <div className="absolute z-50 w-full mt-1 bg-card border border-white/10 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                    {/* Existing items */}
                    {filteredItems.length > 0 ? (
                        filteredItems.map((item, index) => (
                            <button
                                key={item[valueKey]}
                                type="button"
                                onClick={() => handleSelectItem(item)}
                                className={`w-full text-left px-4 py-2.5 text-sm flex items-center justify-between
                                    ${highlightIndex === index ? 'bg-gold/20 text-gold' : 'text-gray-300 hover:bg-white/5'}
                                    ${item[valueKey] === value ? 'bg-green-500/10' : ''}
                                `}
                            >
                                <span>{item[displayKey]}</span>
                                {item[valueKey] === value && (
                                    <Check size={16} className="text-green-400" />
                                )}
                            </button>
                        ))
                    ) : !canCreateNew ? (
                        <div className="px-4 py-3 text-sm text-gray-500">
                            {emptyMessage}
                        </div>
                    ) : null}

                    {/* Create new option */}
                    {canCreateNew && (
                        <button
                            type="button"
                            onClick={handleCreateNew}
                            className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 border-t border-white/10
                                ${highlightIndex === filteredItems.length ? 'bg-gold/20 text-gold' : 'text-green-400 hover:bg-green-500/10'}
                            `}
                        >
                            <Plus size={16} />
                            <span>{createLabel} <strong>"{inputValue.trim()}"</strong></span>
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
