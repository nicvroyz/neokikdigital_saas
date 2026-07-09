import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export default function CustomSelect({ options = [], value, onChange, placeholder = 'Seleccionar...', icon: LeadIcon, style }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  const selectedOption = options.find((opt) => opt.value === value) || options[0];

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (optionValue) => {
    onChange({ target: { value: optionValue } });
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', ...style }}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.75rem 1rem',
          backgroundColor: '#ffffff',
          border: isOpen ? '1.5px solid var(--brand-indigo)' : '1px solid var(--border-default)',
          borderRadius: 'var(--radius-md)',
          boxShadow: isOpen ? '0 0 0 4px rgba(79, 70, 229, 0.15)' : 'var(--shadow-xs)',
          cursor: 'pointer',
          transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
          textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', minWidth: 0 }}>
          {LeadIcon && <LeadIcon size={18} color="var(--brand-indigo)" />}
          <span style={{ fontSize: '0.925rem', fontWeight: '700', color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {selectedOption ? selectedOption.label : placeholder}
          </span>
        </div>
        <ChevronDown
          size={18}
          color="var(--brand-indigo)"
          style={{
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
            flexShrink: 0,
          }}
        />
      </button>

      {/* Custom Dropdown Popover List */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            backgroundColor: '#ffffff',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 15px 35px -5px rgba(15, 23, 42, 0.18)',
            zIndex: 999,
            padding: '0.4rem',
            maxHeight: '260px',
            overflowY: 'auto',
            animation: 'modalPop 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <div
                key={option.value}
                onClick={() => handleSelect(option.value)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.7rem 0.85rem',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: isSelected ? '#eef2ff' : 'transparent',
                  color: isSelected ? 'var(--brand-indigo)' : 'var(--text-main)',
                  fontWeight: isSelected ? '800' : '600',
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  marginBottom: '0.15rem',
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) e.currentTarget.style.backgroundColor = '#f8fafc';
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <span>{option.label}</span>
                {isSelected && <Check size={16} color="var(--brand-indigo)" />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
