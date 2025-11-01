import React from 'react';
import type { Subject } from '../types';
import { Modal } from './Modal';
import { PencilSquareIcon, DocumentDuplicateIcon, ShareIcon, TrashIcon } from './Icons';

interface ActionsModalProps {
  subject: Subject;
  onClose: () => void;
  onRename: (id: string) => void;
  onEditPages: (id: string) => void;
  onShareExport: (subject: Subject) => void;
  onDelete: (id: string) => void;
}

export const ActionsModal: React.FC<ActionsModalProps> = ({
  subject,
  onClose,
  onRename,
  onEditPages,
  onShareExport,
  onDelete,
}) => {
  return (
    <Modal title={`Actions for "${subject.name}"`} onClose={onClose}>
        <div className="flex flex-col gap-2">
            <ActionButton Icon={PencilSquareIcon} onClick={() => onRename(subject.id)}>Rename</ActionButton>
            <ActionButton Icon={DocumentDuplicateIcon} onClick={() => onEditPages(subject.id)}>Edit Pages</ActionButton>
            <ActionButton Icon={ShareIcon} onClick={() => onShareExport(subject)}>Share & Export</ActionButton>
            <div className="h-px bg-slate-700 my-1" />
            <ActionButton Icon={TrashIcon} onClick={() => onDelete(subject.id)} isDestructive>Delete Subject</ActionButton>
        </div>
    </Modal>
  );
};

interface ActionButtonProps {
  children: React.ReactNode;
  onClick: () => void;
  Icon: React.FC<{ className?: string }>;
  isDestructive?: boolean;
}

const ActionButton: React.FC<ActionButtonProps> = ({ children, onClick, Icon, isDestructive = false }) => (
    <button
      onClick={onClick}
      className={`w-full text-left flex items-center gap-4 px-4 py-3 rounded-lg transition-colors duration-150 ${
        isDestructive
          ? 'text-red-400 hover:bg-red-500/20'
          : 'text-slate-300 hover:bg-slate-700'
      }`}
    >
      <Icon className="w-5 h-5" />
      <span className="text-base">{children}</span>
    </button>
);
