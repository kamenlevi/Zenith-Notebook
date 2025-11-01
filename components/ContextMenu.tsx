import React, { useEffect, useRef } from 'react';

// FIX: This file was empty, causing a "not a module" error in Notebook.tsx.
// This implements the ContextMenu component and its related types to provide
// right-click menu functionality.

export interface MenuItem {
  label?: string;
  icon?: React.ReactNode;
  action?: () => void;
  disabled?: boolean;
  isSeparator?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, items, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);
  
  const menuStyle: React.CSSProperties = {
    position: 'fixed',
    top: `${y}px`,
    left: `${x}px`,
    zIndex: 1000,
  };
  
  // A second effect to adjust position after render to avoid going off-screen
  useEffect(() => {
      const getPosition = () => {
        const menu = menuRef.current;
        if (!menu) return { top: y, left: x };

        const menuRect = menu.getBoundingClientRect();
        let newX = x;
        let newY = y;

        if (x + menuRect.width > window.innerWidth) {
            newX = window.innerWidth - menuRect.width - 10;
        }
        if (y + menuRect.height > window.innerHeight) {
            newY = window.innerHeight - menuRect.height - 10;
        }
        return { top: newY, left: newX };
    }
    
      const menu = menuRef.current;
      if (menu) {
          const { top, left } = getPosition();
          menu.style.top = `${top}px`;
          menu.style.left = `${left}px`;
      }
  }, [x, y, items]);

  const handleAction = (item: MenuItem) => {
    if (!item.disabled && item.action) {
      item.action();
      onClose();
    }
  };

  return (
    <div
      ref={menuRef}
      style={menuStyle}
      className="bg-slate-800 border border-slate-700 rounded-lg shadow-2xl z-50 animate-fade-in text-slate-200 min-w-[200px]"
      role="menu"
    >
      <ul className="p-1">
        {items.map((item, index) => (
          item.isSeparator ? (
            <li key={`separator-${index}`} role="separator" className="h-px bg-slate-700 my-1" />
          ) : (
            <li key={item.label || index} role="presentation">
              <button
                role="menuitem"
                onClick={() => handleAction(item)}
                disabled={item.disabled}
                className="w-full text-left flex items-center gap-3 px-3 py-2 rounded-md transition-colors duration-150 enabled:hover:bg-slate-700 disabled:opacity-50"
              >
                {item.icon && <span className="w-5 h-5 flex-shrink-0">{item.icon}</span>}
                <span className="text-sm">{item.label}</span>
              </button>
            </li>
          )
        ))}
      </ul>
    </div>
  );
};
