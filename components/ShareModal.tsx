import React from 'react';
import { Modal } from './Modal';

interface ShareModalProps {
  onClose: () => void;
}

export const ShareModal: React.FC<ShareModalProps> = ({ onClose }) => {
  return (
    <Modal title="Share" onClose={onClose}>
      <p className="text-slate-400 text-sm">Sharing is not yet available.</p>
    </Modal>
  );
};
