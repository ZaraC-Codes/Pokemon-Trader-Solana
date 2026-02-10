import { ConnectButton } from '@rainbow-me/rainbowkit';

/**
 * WalletConnector Component
 *
 * Custom-styled RainbowKit wallet connect button matching the game's pixel-art HUD.
 * Uses ConnectButton.Custom for full control over appearance while keeping
 * RainbowKit's connection logic.
 *
 * Features:
 * - Yellow pixel-art border style matching SHOP button and HUD
 * - Dark background with monospace font
 * - Shows truncated address when connected
 * - Network indicator with chain icon
 * - Hover effects consistent with game UI
 */

// Pixel-art button styles matching the game HUD
const styles = {
  button: {
    padding: '10px 14px',
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    border: '2px solid #ffcc00',
    color: '#ffcc00',
    fontFamily: "'Courier New', monospace",
    fontSize: '12px',
    fontWeight: 'bold' as const,
    cursor: 'pointer',
    textAlign: 'center' as const,
    transition: 'all 0.1s',
    whiteSpace: 'nowrap' as const,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  buttonHover: {
    backgroundColor: 'rgba(40, 40, 0, 0.9)',
    borderColor: '#ffdd44',
  },
  connectedContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  chainButton: {
    padding: '8px 10px',
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    border: '2px solid #ffcc00',
    color: '#ffcc00',
    fontFamily: "'Courier New', monospace",
    fontSize: '11px',
    fontWeight: 'bold' as const,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  accountButton: {
    padding: '10px 14px',
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    border: '2px solid #ffcc00',
    color: '#ffcc00',
    fontFamily: "'Courier New', monospace",
    fontSize: '12px',
    fontWeight: 'bold' as const,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    transition: 'all 0.1s',
  },
  chainIcon: {
    width: '16px',
    height: '16px',
    borderRadius: '50%',
  },
  wrongNetwork: {
    backgroundColor: 'rgba(60, 0, 0, 0.9)',
    borderColor: '#ff4444',
    color: '#ff4444',
  },
  balance: {
    fontSize: '10px',
    color: '#aaa',
    marginRight: '4px',
  },
};

export default function WalletConnector() {
  return (
    <div className="wallet-connector">
      <ConnectButton.Custom>
        {({
          account,
          chain,
          openAccountModal,
          openChainModal,
          openConnectModal,
          mounted,
        }) => {
          const ready = mounted;
          const connected = ready && account && chain;

          return (
            <div
              {...(!ready && {
                'aria-hidden': true,
                style: {
                  opacity: 0,
                  pointerEvents: 'none',
                  userSelect: 'none',
                },
              })}
            >
              {(() => {
                // Not connected - show connect button
                if (!connected) {
                  return (
                    <button
                      onClick={openConnectModal}
                      type="button"
                      style={styles.button}
                      onMouseEnter={(e) => {
                        Object.assign(e.currentTarget.style, styles.buttonHover);
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = styles.button.backgroundColor;
                        e.currentTarget.style.borderColor = '#ffcc00';
                      }}
                    >
                      CONNECT WALLET
                    </button>
                  );
                }

                // Wrong network - show switch network button
                if (chain.unsupported) {
                  return (
                    <button
                      onClick={openChainModal}
                      type="button"
                      style={{ ...styles.button, ...styles.wrongNetwork }}
                    >
                      ⚠️ WRONG NETWORK
                    </button>
                  );
                }

                // Connected - show chain and account
                return (
                  <div style={styles.connectedContainer}>
                    {/* Chain button */}
                    <button
                      onClick={openChainModal}
                      type="button"
                      style={styles.chainButton}
                      title={chain.name}
                    >
                      {chain.hasIcon && chain.iconUrl && (
                        <img
                          alt={chain.name ?? 'Chain icon'}
                          src={chain.iconUrl}
                          style={styles.chainIcon}
                        />
                      )}
                    </button>

                    {/* Account button */}
                    <button
                      onClick={openAccountModal}
                      type="button"
                      style={styles.accountButton}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = 'rgba(40, 40, 0, 0.9)';
                        e.currentTarget.style.borderColor = '#ffdd44';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = styles.accountButton.backgroundColor;
                        e.currentTarget.style.borderColor = '#ffcc00';
                      }}
                    >
                      {account.displayBalance && (
                        <span style={styles.balance}>
                          {account.displayBalance}
                        </span>
                      )}
                      {account.displayName}
                    </button>
                  </div>
                );
              })()}
            </div>
          );
        }}
      </ConnectButton.Custom>
    </div>
  );
}
