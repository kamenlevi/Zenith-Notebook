import React from 'react';
import type { Notebook } from '../types';
import { Modal } from './Modal';
import {
  Bars3Icon,
  DocumentDuplicateIcon,
  PencilSquareIcon,
  ShareIcon,
  TrashIcon,
} from './Icons';

interface Props {
  notebook: Notebook;
  onClose: () => void;
  onRename: (id: string) => void;
  onEditPages: (id: string) => void;
  onPageStyle: (id: string) => void;
  onShareExport: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}

export const ActionsModal: React.FC<Props> = ({
  notebook,
  onClose,
  onRename,
  onEditPages,
  onPageStyle,
  onShareExport,
  onDuplicate,
  onDelete,
}) => {
  const strokes = notebook.objects.filter((o) => o.kind === 'stroke').length;
  const texts = notebook.objects.filter((o) => o.kind === 'text').length;
  const images = notebook.objects.filter((o) => o.kind === 'image').length;

  return (
    <Modal title={notebook.name} onClose={onClose}>
      <p className="mb-4 text-sm text-slate-400">
        {notebook.pageCount} {notebook.pageCount === 1 ? 'page' : 'pages'} · {strokes} strokes ·{' '}
        {texts} text {texts === 1 ? 'box' : 'boxes'} · {images}{' '}
        {images === 1 ? 'image' : 'images'}
      </p>
      <div className="flex flex-col gap-1">
        <Row Icon={PencilSquareIcon} onClick={() => onRename(notebook.id)}>
          Rename
        </Row>
        <Row Icon={DocumentDuplicateIcon} onClick={() => onEditPages(notebook.id)}>
          Page count
        </Row>
        <Row Icon={Bars3Icon} onClick={() => onPageStyle(notebook.id)}>
          Page style
        </Row>
        <Row Icon={ShareIcon} onClick={() => onShareExport(notebook.id)}>
          Share and export
        </Row>
        <Row Icon={DocumentDuplicateIcon} onClick={() => onDuplicate(notebook.id)}>
          Duplicate notebook
        </Row>
        <div className="my-1 h-px bg-slate-800" />
        <Row Icon={TrashIcon} destructive onClick={() => onDelete(notebook.id)}>
          Delete notebook
        </Row>
      </div>
    </Modal>
  );
};

const Row: React.FC<{
  children: React.ReactNode;
  onClick: () => void;
  Icon: React.FC<{ className?: string }>;
  destructive?: boolean;
}> = ({ children, onClick, Icon, destructive }) => (
  <button
    onClick={onClick}
    className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm transition-colors ${
      destructive
        ? 'text-red-400 hover:bg-red-500/15'
        : 'text-slate-200 hover:bg-slate-800'
    }`}
  >
    <Icon className="h-5 w-5 shrink-0" />
    {children}
  </button>
);
