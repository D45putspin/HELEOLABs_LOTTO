import React from 'react';

export type NotificationType = 'success' | 'error' | 'pending';

interface NotificationModalProps {
    isOpen: boolean;
    onClose: () => void;
    type: NotificationType;
    title: string;
    message: string;
    txId?: string;
}

const NotificationModal: React.FC<NotificationModalProps> = ({
    isOpen,
    onClose,
    type,
    title,
    message,
    txId
}) => {
    if (!isOpen) return null;

    const colors = {
        success: 'var(--success-color, #00d1b2)',
        error: 'var(--error-color, #ff4444)',
        pending: 'var(--main-color, #8a2be2)'
    };

    const icon = {
        success: (
            <svg className="modal-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
        ),
        error: (
            <svg className="modal-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
        ),
        pending: (
            <svg className="modal-icon animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
        )
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content card slide-up">
                <div className="modal-header-icon" style={{ color: colors[type] }}>
                    {icon[type]}
                </div>

                <h2 className="text-center mt-4 mb-2">{title}</h2>
                <p className="modal-message text-secondary text-center mb-6">{message}</p>

                {txId && (
                    <div className="modal-tx tech-display text-xs p-3 mb-6" style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
                        <span className="tech-label block mb-1">Transaction ID</span>
                        {txId}
                    </div>
                )}

                <button
                    onClick={onClose}
                    className={type === 'error' ? 'btn-secondary w-full' : 'btn-primary w-full'}
                >
                    {type === 'pending' ? 'Got it' : 'Close'}
                </button>
            </div>

            <style>{`
                .modal-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.8);
                    backdrop-filter: blur(8px);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 9999;
                    padding: 20px;
                }
                .modal-content {
                    max-width: 400px;
                    width: 100%;
                    max-height: calc(100vh - 40px);
                    padding: 32px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    overflow-y: auto;
                }
                .modal-message {
                    max-width: 100%;
                    overflow-wrap: anywhere;
                    word-break: break-word;
                }
                .modal-tx {
                    width: 100%;
                    overflow-wrap: anywhere;
                    word-break: break-all;
                    line-height: 1.4;
                }
                .modal-header-icon {
                    width: 64px;
                    height: 64px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .modal-icon {
                    width: 100%;
                    height: 100%;
                }
                .slide-up {
                    animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
                }
                @keyframes slideUp {
                    from { transform: translateY(20px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
                .animate-spin {
                    animation: spin 1s linear infinite;
                }
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                @media (max-width: 640px) {
                    .modal-overlay {
                        align-items: flex-end;
                        padding: 12px;
                    }
                    .modal-content {
                        max-width: none;
                        max-height: calc(100vh - 24px);
                        padding: 24px 20px;
                        border-radius: 20px 20px 12px 12px;
                    }
                }
            `}</style>
        </div>
    );
};

export default NotificationModal;
