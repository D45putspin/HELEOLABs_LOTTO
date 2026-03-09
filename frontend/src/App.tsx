import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { WalletProvider, useWallet } from './contexts/WalletContext';

// Pages
import Dashboard from './pages/Dashboard';
import CreateLottery from './pages/CreateLottery';
import LotteryDetail from './pages/LotteryDetail';

const Header: React.FC = () => {
  const { connected, address, connect, disconnect } = useWallet();
  const [menuOpen, setMenuOpen] = useState(false);

  const shortenAddress = (addr: string) => {
    return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
  };

  const closeMenu = () => setMenuOpen(false);

  return (
    <>
      <header className="header">
        <div className="container header-bar flex justify-between items-center py-4">
          <Link to="/" className="brand">HELEOLABS LOTTO</Link>

          {/* Desktop Navigation */}
          <div className="desktop-nav flex items-center gap-6">
            <nav className="flex gap-4">
              <Link to="/" className="nav-link">Dashboard</Link>
              <Link to="/create" className="nav-link">Create Lottery</Link>
            </nav>

            {connected ? (
              <div className="flex items-center gap-2">
                <div className="wallet-pill">
                  <span className="status-indicator online"></span>
                  {address ? shortenAddress(address) : 'Connected'}
                </div>
                <button onClick={disconnect} className="btn-icon" title="Disconnect">
                  <svg className="icon" viewBox="0 0 24 24"><path d="M18.36 6.64a9 9 0 1 1-12.73 0M12 2v10" /></svg>
                </button>
              </div>
            ) : (
              <button onClick={connect} className="btn-primary">Connect Wallet</button>
            )}
          </div>

          {/* Mobile Hamburger Button */}
          <button
            className="hamburger-btn"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Toggle menu"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {menuOpen ? (
                <path d="M18 6L6 18M6 6l12 12" />
              ) : (
                <>
                  <path d="M3 12h18" />
                  <path d="M3 6h18" />
                  <path d="M3 18h18" />
                </>
              )}
            </svg>
          </button>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      {menuOpen && (
        <div className="mobile-menu-overlay" onClick={closeMenu}>
          <div className="mobile-menu" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-menu-inner">
              <div className="mobile-menu-header">
                <div className="brand mobile-menu-brand">HELEOLABS LOTTO / MENU</div>
                <button onClick={closeMenu} className="btn-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                </button>
              </div>

              <div className="mobile-wallet-section-top">
                {connected ? (
                  <div className="mobile-wallet-card card">
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <span className="tech-label text-xs">CONNECTED WALLET</span>
                        <span className="status-indicator online"></span>
                      </div>
                      <div className="mobile-wallet-address tech-value text-sm">
                        {address || 'Connected Wallet'}
                      </div>
                      <button onClick={() => { disconnect(); closeMenu(); }} className="btn-secondary w-full py-2">
                        Disconnect
                      </button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => { connect(); closeMenu(); }} className="btn-primary w-full py-4 shadow-glow flex items-center justify-center gap-2">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21V5a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1" /></svg>
                    Connect Wallet
                  </button>
                )}
              </div>

              <nav className="mobile-nav-list">
                <Link to="/" className="mobile-nav-item" onClick={closeMenu}>
                  <div className="flex items-center gap-4">
                    <div className="nav-item-icon">D</div>
                    <div className="flex flex-col">
                      <span className="text-lg font-bold">Dashboard</span>
                      <span className="text-xs text-secondary">View all active lotteries</span>
                    </div>
                  </div>
                </Link>
                <Link to="/create" className="mobile-nav-item" onClick={closeMenu}>
                  <div className="flex items-center gap-4">
                    <div className="nav-item-icon">C</div>
                    <div className="flex flex-col">
                      <span className="text-lg font-bold">Create</span>
                      <span className="text-xs text-secondary">Start a new prize pool</span>
                    </div>
                  </div>
                </Link>
              </nav>

              <div className="mobile-menu-footer">
                <p className="tech-label mobile-menu-version text-center">HELEOLABS LOTTO v1.0</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .desktop-nav {
          display: flex;
        }
        .hamburger-btn {
          display: none;
          background: transparent;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 10px;
          color: white;
          cursor: pointer;
          padding: 10px;
          align-items: center;
          justify-content: center;
          min-width: 44px;
          min-height: 44px;
        }
        
        @media (max-width: 768px) {
          .desktop-nav {
            display: none !important;
          }
          .hamburger-btn {
            display: flex;
          }
        }

        .mobile-menu-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.4);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          z-index: 9999;
          animation: fadeIn 0.3s ease;
        }

        .mobile-menu {
          position: absolute;
          top: 0;
          right: 0;
          width: min(360px, 100vw);
          max-width: 90vw;
          height: 100%;
          background: rgba(10, 10, 10, 0.9);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border-left: 1px solid rgba(255, 255, 255, 0.1);
          box-shadow: -10px 0 30px rgba(0,0,0,0.5);
          display: flex;
          flex-direction: column;
          animation: slideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .mobile-menu-inner {
          display: flex;
          flex-direction: column;
          height: 100%;
          padding: 24px;
          overflow-y: auto;
        }

        .mobile-menu-brand {
          font-size: 1.2rem;
        }

        .mobile-menu-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 32px;
        }

        .mobile-wallet-section-top {
          margin-bottom: 40px;
        }

        .mobile-wallet-card {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.1);
          padding: 16px !important;
        }

        .mobile-nav-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .mobile-nav-item {
          display: block;
          padding: 20px;
          color: white;
          text-decoration: none;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255,255,255,0.05);
          border-radius: 12px;
          transition: all 0.2s ease;
        }

        .mobile-nav-item:active {
          transform: scale(0.98);
          background: rgba(255, 255, 255, 0.05);
        }

        .nav-item-icon {
          width: 40px;
          height: 40px;
          border-radius: 8px;
          background: white;
          color: black;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          font-size: 1.2rem;
        }

        .mobile-menu-footer {
          margin-top: auto;
          padding-top: 24px;
        }

        @media (max-width: 520px) {
          .mobile-menu {
            width: 100vw;
            max-width: 100vw;
          }

          .mobile-menu-inner {
            padding: 20px 16px calc(24px + env(safe-area-inset-bottom, 0px));
          }

          .mobile-menu-brand {
            font-size: 0.95rem;
          }
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </>
  );
};

import { PendingTxProvider } from './contexts/PendingTxContext';

const App: React.FC = () => {
  return (
    <Router>
      <WalletProvider>
        <PendingTxProvider>
          <div className="background-fx">
            <div className="gradient-1 shadow-glow anim-float-slow"></div>
            <div className="gradient-2 shadow-glow anim-float-slow" style={{ animationDelay: '-10s' }}></div>
          </div>

          <div className="min-h-screen font-sans text-gray-900" style={{ position: 'relative', zIndex: 1 }}>
            <Header />

            <main className="py-10">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/create" element={<CreateLottery />} />
                <Route path="/lottery/:id" element={<LotteryDetail />} />
              </Routes>
            </main>

            <footer className="py-10 border-t border-border mt-20">
              <div className="container text-center text-secondary text-sm">
                <p className="tech-display">HELEOLABS LOTTO v1.0</p>
                <p>© 2026 DECENTRALIZED LOTTERY. ALL RIGHTS RESERVED.</p>
              </div>
            </footer>
          </div>
        </PendingTxProvider>
      </WalletProvider>
    </Router>
  );
};

export default App;
