import React from 'react';
import { Modal } from './Modal';

interface PublishModalProps {
  onClose: () => void;
}

export const PublishModal: React.FC<PublishModalProps> = ({ onClose }) => {
  return (
    <Modal title="Publish" onClose={onClose}>
      <p className="text-slate-400 text-sm">Publishing is not yet available.</p>
    </Modal>
  );
};
